// Cake production connects confirmed orders / reservations to inventory usage.
// A linked record is NOT another order: it is the production task for that order.
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import CakeJob from '../models/CakeJob.js';
import Order from '../models/Order.js';
import Reservation from '../models/Reservation.js';
import InventoryItem from '../models/InventoryItem.js';
import StockMovement from '../models/StockMovement.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
const statuses = ['Queued', 'Preparing', 'Decorating', 'Ready', 'Completed', 'Cancelled'];
const transitions = {
  Queued: ['Preparing', 'Cancelled'], Preparing: ['Decorating', 'Cancelled'],
  Decorating: ['Ready', 'Cancelled'], Ready: ['Completed', 'Cancelled'],
  Completed: [], Cancelled: [],
};
const idIsValid = id => /^[0-9a-f]{24}$/i.test(id || '');
const materialsSchema = z.array(z.object({
  item: z.string().regex(/^[0-9a-f]{24}$/i),
  quantity: z.number().int().min(1).max(100000000),
}).strict()).max(30).refine(lines => new Set(lines.map(l => l.item)).size === lines.length, 'Stock items must be unique.');
const detailsSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(100),
  cakeDescription: z.string().trim().min(1).max(300),
  size: z.string().trim().min(1).max(80),
  flavor: z.string().trim().min(1).max(100),
  designInstructions: z.string().trim().max(1500),
  quantity: z.number().int().min(1).max(1000),
  dueAt: z.string().datetime({ offset: true }),
  materials: materialsSchema.default([]),
}).strict();
const creationSchema = detailsSchema.extend({
  sourceType: z.enum(['order', 'reservation']).optional(),
  sourceId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
}).refine(data => Boolean(data.sourceType) === Boolean(data.sourceId), 'Choose a valid source.');
function parseDetails(body, creating = false) {
  const parsed = (creating ? creationSchema : detailsSchema).safeParse(body);
  if (!parsed.success) return null;
  const dueAt = new Date(parsed.data.dueAt);
  if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() < Date.now() - 60000 || dueAt.getTime() > Date.now() + 365 * 86400000) return null;
  return { ...parsed.data, dueAt };
}
const view = item => ({
  id: String(item._id), customerName: item.customerName, contact: item.contact,
  cakeDescription: item.cakeDescription, size: item.size, flavor: item.flavor,
  designInstructions: item.designInstructions, quantity: item.quantity,
  dueAt: item.dueAt, status: item.status,
  materials: (item.materials || []).map(m => ({ item: String(m.item), quantity: m.quantity })),
  stockDeductedAt: item.stockDeductedAt || null,
  sourceType: item.sourceOrder ? 'order' : item.sourceReservation ? 'reservation' : null,
  sourceId: item.sourceOrder ? String(item.sourceOrder) : item.sourceReservation ? String(item.sourceReservation) : null,
  createdAt: item.createdAt, updatedAt: item.updatedAt,
});
async function validateMaterials(lines) {
  if (!lines.length) return true; // Some cakes may not use tracked inventory.
  const existing = await InventoryItem.countDocuments({ _id: { $in: lines.map(m => m.item) }, active: true });
  return existing === lines.length;
}
router.get('/', async (req, res, next) => {
  try {
    const parsed = z.object({
      search: z.string().trim().max(100).default(''),
      status: z.enum(['All', ...statuses]).default('All'),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid filters.' });
    const { search, status, page } = parsed.data;
    const filter = {};
    if (status !== 'All') filter.status = status;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ customerName: { $regex: safe, $options: 'i' } }, { cakeDescription: { $regex: safe, $options: 'i' } }];
    }
    const [items, count] = await Promise.all([
      CakeJob.find(filter).sort({ dueAt: 1, _id: 1 }).skip((page - 1) * 20).limit(20).lean(),
      CakeJob.countDocuments(filter),
    ]);
    res.json({ cakes: items.map(view), count, page, pages: Math.max(1, Math.ceil(count / 20)) });
  } catch (error) { next(error); }
});
router.post('/', async (req, res, next) => {
  try {
    const data = parseDetails(req.body, true);
    if (!data) return res.status(400).json({ message: 'Check cake details, inventory amounts and future due date.' });
    const requestId = req.get('Idempotency-Key');
    if (!requestId || !/^[a-zA-Z0-9-]{12,80}$/.test(requestId)) return res.status(400).json({ message: 'Invalid submission key.' });
    const previous = await CakeJob.findOne({ requestId });
    if (previous) return res.json({ cake: view(previous), duplicatePrevented: true });
    if (!await validateMaterials(data.materials)) return res.status(400).json({ message: 'One or more inventory items no longer exist or are inactive.' });
    const { sourceType, sourceId, ...fields } = data;
    if (sourceType === 'order') {
      const source = await Order.findById(sourceId).lean();
      if (!source) return res.status(404).json({ message: 'Source order not found.' });
      if (!['Confirmed', 'In production'].includes(source.status)) return res.status(409).json({ message: 'Confirm the order before sending it to cake production.' });
      // Never accept customer details from the browser for a linked source.
      fields.customerName = source.customerName;
      fields.contact = source.contact;
      fields.sourceOrder = source._id;
    }
    if (sourceType === 'reservation') {
      const source = await Reservation.findById(sourceId).lean();
      if (!source) return res.status(404).json({ message: 'Source reservation not found.' });
      if (!['Confirmed'].includes(source.status)) return res.status(409).json({ message: 'Confirm the reservation before sending it to cake production.' });
      fields.customerName = source.customerName;
      fields.contact = source.contact;
      fields.sourceReservation = source._id;
    }
    const job = await CakeJob.create({ ...fields, requestId, createdBy: req.user.id, updatedBy: req.user.id });
    res.status(201).json({ cake: view(job) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This order, reservation, or cake submission already has a cake job. Refresh to view it.' });
    next(error);
  }
});
router.patch('/:id', async (req, res, next) => {
  try {
    if (!idIsValid(req.params.id)) return res.status(400).json({ message: 'Invalid cake job ID.' });
    const fields = parseDetails(req.body);
    if (!fields) return res.status(400).json({ message: 'Invalid cake details, inventory amounts or due date.' });
    const job = await CakeJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Cake job not found.' });
    if (['Completed', 'Cancelled'].includes(job.status)) return res.status(409).json({ message: 'Finished or cancelled cake jobs cannot be edited.' });
    // Ingredients must be fixed BEFORE starting production so stock is only used once.
    if (job.status !== 'Queued') delete fields.materials;
    else if (!await validateMaterials(fields.materials)) return res.status(400).json({ message: 'An inventory item is no longer available.' });
    if (job.sourceOrder || job.sourceReservation) {
      delete fields.customerName;
      delete fields.contact;
    }
    Object.assign(job, fields, { updatedBy: req.user.id });
    await job.save();
    res.json({ cake: view(job) });
  } catch (error) { if (error.name === 'VersionError') return res.status(409).json({ message: 'This cake job was changed elsewhere. Refresh and retry.' }); next(error); }
});
router.patch('/:id/status', async (req, res, next) => {
  try {
    if (!idIsValid(req.params.id)) return res.status(400).json({ message: 'Invalid cake job ID.' });
    const parsed = z.object({ status: z.enum(statuses) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid production status.' });
    // Simple stages with no related writes still work on standalone MongoDB.
    // Stock deductions or synchronization with an order need an atomic transaction.
    const current = await CakeJob.findById(req.params.id);
    if (!current) return res.status(404).json({ message: 'Cake job not found.' });
    const target = parsed.data.status;
    if (!transitions[current.status]?.includes(target)) return res.status(409).json({ message: 'This production status change is not allowed. Refresh the list.' });
    const needsTransaction = (Boolean(current.sourceOrder) && ['Preparing','Ready'].includes(target)) ||
      (target === 'Preparing' && (current.materials?.length || 0) > 0);
    if (!needsTransaction) {
      current.status = target;
      current.updatedBy = req.user.id;
      if (target === 'Preparing') current.stockDeductedAt = new Date();
      await current.save(); // Optimistic concurrency prevents duplicate status changes.
      return res.json({ cake: view(current) });
    }
    // All stock movements AND the new cake/order stages commit together or not at all.
    // MongoDB Atlas / replica set is required for these multi-document writes.
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const job = await CakeJob.findById(req.params.id).session(session);
        if (!job) throw Object.assign(new Error('Cake job not found.'), { status: 404 });
        const target = parsed.data.status;
        if (!transitions[job.status]?.includes(target)) throw Object.assign(new Error('This production status change is not allowed. Refresh the list.'), { status: 409 });
        if (job.sourceOrder && ['Preparing', 'Ready'].includes(target)) {
          const source = await Order.findById(job.sourceOrder).session(session);
          if (!source) throw Object.assign(new Error('Linked order was deleted.'), { status: 409 });
          const expected = target === 'Preparing' ? ['Confirmed', 'In production'] : ['In production', 'Ready'];
          if (!expected.includes(source.status)) throw Object.assign(new Error('Linked order status is out of sync. Check Orders & Reservations.'), { status: 409 });
          source.status = target === 'Preparing' ? 'In production' : 'Ready';
          source.updatedBy = req.user.id;
          await source.save({ session });
        }
        if (target === 'Preparing' && !job.stockDeductedAt) {
          // Inventory stores whole-number units; these totals are for the whole job.
          for (const material of job.materials) {
            const inventory = await InventoryItem.findOneAndUpdate({
              _id: material.item, active: true, quantity: { $gte: material.quantity },
            }, { $inc: { quantity: -material.quantity } }, { new: false, session });
            if (!inventory) throw Object.assign(new Error('Insufficient stock or missing material. Check Inventory before starting production.'), { status: 409 });
            await StockMovement.create([{
              item: inventory._id, delta: -material.quantity,
              previousQuantity: inventory.quantity, newQuantity: inventory.quantity - material.quantity,
              reason: `Cake job ${job._id} started: ${job.customerName}`.slice(0, 200),
              requestId: `cake-${job._id}-${inventory._id}`, createdBy: req.user.id,
            }], { session });
          }
          job.stockDeductedAt = new Date();
        }
        job.status = target;
        job.updatedBy = req.user.id;
        await job.save({ session });
        result = view(job);
      });
    } finally { await session.endSession(); }
    res.json({ cake: result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.name === 'VersionError' || error.code === 11000 || error.codeName === 'WriteConflict') return res.status(409).json({ message: 'This cake job changed elsewhere. Refresh and try again.' });
    if (error.code === 20 || /Transaction numbers are only allowed|replica set/i.test(error.message || '')) return res.status(503).json({ message: 'Linked cake production and inventory transactions require MongoDB Atlas or a MongoDB replica set.' });
    next(error);
  }
});
export default router;
