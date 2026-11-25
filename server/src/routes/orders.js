// Protected order operations: every request must have an active Phase 1 session.
import { Router } from 'express';
import { z } from 'zod';
import Order from '../models/Order.js';
import CakeJob from '../models/CakeJob.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
const statuses = ['Pending', 'Confirmed', 'In production', 'Ready', 'Completed', 'Cancelled'];
const payments = ['Unpaid', 'Partially paid', 'Paid'];
const item = z.object({ name: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(10000), unitPrice: z.number().finite().min(0.01).max(10000000) }).strict();
const fields = z.object({
  customerName: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(100).default(''),
  source: z.enum(['Walk-in', 'Phone', 'Facebook', 'Delivery app', 'Other']),
  items: z.array(item).min(1).max(30),
  notes: z.string().trim().max(1000).default(''),
  paymentStatus: z.enum(payments).default('Unpaid'),
  fulfillmentAt: z.string().datetime({ offset: true }).nullable().optional(),
});
const orderId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const roundMoney = number => Math.round((number + Number.EPSILON) * 100) / 100;
function mapOrder(order) {
  return { id: String(order._id), customerName: order.customerName, contact: order.contact, fulfillmentAt: order.fulfillmentAt || null,
    source: order.source, items: order.items, total: order.total, status: order.status,
    paymentStatus: order.paymentStatus, paidCompletedAt: order.paidCompletedAt, notes: order.notes,
    createdAt: order.createdAt, updatedAt: order.updatedAt };
}
// Paginate to prevent a large business history overwhelming browsers.
router.get('/', async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(['All', 'Active', ...statuses]).default('All'), search: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid order filters.' });
    const { status, search, page } = parsed.data;
    const filter = {};
    if (status === 'Active') filter.status = { $in: ['Confirmed', 'In production'] };
    else if (status !== 'All') filter.status = status;
    // Escape regex metacharacters: customer text is not executable regex syntax.
    if (search) filter.customerName = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [orders, count] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(),
      Order.countDocuments(filter),
    ]);
    const related = await CakeJob.find({ sourceOrder: { $in: orders.map(o => o._id) } }).select('_id sourceOrder status dueAt').lean();
    const byOrder = new Map(related.map(c => [String(c.sourceOrder), { id: String(c._id), status: c.status, dueAt: c.dueAt }]));
    res.json({ orders: orders.map(o => ({ ...mapOrder(o), cake: byOrder.get(String(o._id)) || null })), page, pages: Math.max(1, Math.ceil(count / 20)), count });
  } catch (error) { next(error); }
});
router.post('/', async (req, res, next) => {
  try {
    if (!['owner', 'staff'].includes(req.user.role)) return res.status(403).json({ message: 'Order access requires an Owner or Staff account.' });
    const draftOwner = req.get('Draft-Account');
    if (draftOwner !== undefined && draftOwner !== req.user.id) {
      return res.status(403).json({ message: 'Sign in to the account that saved this draft before submitting.' });
    }
    const requestId = req.get('Idempotency-Key');
    if (!requestId || !/^[a-zA-Z0-9-]{12,80}$/.test(requestId)) return res.status(400).json({ message: 'Missing or invalid submission key.' });
    const existingOrder = async () => {
      const prior = await Order.findOne({ requestId });
      if (!prior) return false;
      if (String(prior.createdBy) !== req.user.id) {
        res.status(409).json({ message: 'This submission key is already in use.' });
      } else {
        res.json({ order: mapOrder(prior), duplicatePrevented: true });
      }
      return true;
    };
    // Resolve retries before revalidating time-sensitive fields.
    if (await existingOrder()) return;
    const parsed = fields.strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Enter a unit price greater than ₱0.00 for every product, and check all required order fields.' });
    const data = parsed.data;
    if (data.fulfillmentAt && (new Date(data.fulfillmentAt).getTime() < Date.now()-60_000 || new Date(data.fulfillmentAt).getTime()>Date.now()+365*86400000)) return res.status(400).json({ message: 'Choose a fulfillment date within the next year.' });
    const total = roundMoney(data.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    if (!Number.isSafeInteger(Math.round(total * 100))) return res.status(400).json({ message: 'Order total is too large.' });
    try {
      const order = await Order.create({ ...data, total, requestId, createdBy: req.user.id, updatedBy: req.user.id });
      res.status(201).json({ order: mapOrder(order) });
    } catch (error) {
      // Another request may have inserted the order after the first lookup.
      if (error.code !== 11000 || !await existingOrder()) throw error;
    }
  } catch (error) { next(error); }
});
// Edit business details; current status is unchanged and requires a separate route.
router.patch('/:id', async (req, res, next) => {
  try {
    if (!orderId.safeParse(req.params.id).success) return res.status(400).json({ message: 'Invalid order ID.' });
    const parsed = fields.strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Unit prices must be greater than ₱0.00. Check all order fields.' });
    const data = parsed.data;
    if (data.fulfillmentAt && (new Date(data.fulfillmentAt).getTime() < Date.now()-60_000 || new Date(data.fulfillmentAt).getTime()>Date.now()+365*86400000)) return res.status(400).json({ message: 'Choose a fulfillment date within the next year.' });
    const total = roundMoney(data.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    if (!Number.isSafeInteger(Math.round(total * 100))) return res.status(400).json({ message: 'Order total is too large.' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (['Completed', 'Cancelled'].includes(order.status)) return res.status(409).json({ message: 'Completed or cancelled orders cannot be edited.' });
    Object.assign(order, data, { total, updatedBy: req.user.id });
    if (order.status === 'Completed' && order.paymentStatus === 'Paid' && !order.paidCompletedAt) order.paidCompletedAt = new Date();
    await order.save();
    res.json({ order: mapOrder(order) });
  } catch (error) {
    if (error.name === 'VersionError') return res.status(409).json({ message: 'Another user changed this order. Refresh and try again.' });
    next(error);
  }
});
router.patch('/:id/status', async (req, res, next) => {
  try {
    if (!orderId.safeParse(req.params.id).success) return res.status(400).json({ message: 'Invalid order ID.' });
    const parsed = z.object({ status: z.enum(statuses) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid order status.' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    const nextAllowed = { Pending: ['Confirmed', 'Cancelled'], Confirmed: ['In production', 'Cancelled'], 'In production': ['Ready', 'Cancelled'], Ready: ['Completed', 'Cancelled'], Completed: [], Cancelled: [] };
    if (!nextAllowed[order.status].includes(parsed.data.status)) return res.status(409).json({ message: 'This status change is not allowed.' });
    const linkedCake = await CakeJob.findOne({ sourceOrder: order._id }).select('status').lean();
    if (linkedCake && ['In production', 'Ready'].includes(parsed.data.status)) return res.status(409).json({ message: 'This order has a linked cake job. Update its stage in Cake Production instead.' });
    if (linkedCake && parsed.data.status === 'Cancelled' && linkedCake.status !== 'Cancelled') return res.status(409).json({ message: 'Cancel the linked cake job first.' });
    order.status = parsed.data.status;
    if (order.status === 'Completed' && order.paymentStatus === 'Paid' && !order.paidCompletedAt) order.paidCompletedAt = new Date();
    order.updatedBy = req.user.id;
    await order.save();
    res.json({ order: mapOrder(order) });
  } catch (error) {
    if (error.name === 'VersionError') return res.status(409).json({ message: 'Another user changed this order. Refresh and try again.' });
    next(error);
  }
});
export default router;
