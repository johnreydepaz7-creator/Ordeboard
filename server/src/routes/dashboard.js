// Fast operational summary for the signed-in Owner or Staff.
// Returns compact counts and actionable work, never full customer histories.
import { Router } from 'express';
import Order from '../models/Order.js';
import Reservation from '../models/Reservation.js';
import CakeJob from '../models/CakeJob.js';
import InventoryItem from '../models/InventoryItem.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [pendingOrders, activeOrders, readyOrders, activeCakes, duePickups, lowStock,
      priorityOrders, cakeDeadlines, pickupDeadlines] = await Promise.all([
      Order.countDocuments({ status: 'Pending' }),
      Order.countDocuments({ status: { $in: ['Confirmed', 'In production'] } }),
      Order.countDocuments({ status: 'Ready' }),
      CakeJob.countDocuments({ status: { $in: ['Queued', 'Preparing', 'Decorating'] } }),
      Reservation.countDocuments({ pickupAt: { $lte: soon }, status: { $in: ['Reserved', 'Confirmed'] } }),
      InventoryItem.countDocuments({ active: true, $expr: { $lte: ['$quantity', '$reorderLevel'] } }),
      Order.find({ status: { $in: ['Pending', 'Ready'] } })
        .sort({ updatedAt: -1, _id: -1 }).limit(6)
        .select('customerName status total createdAt').lean(),
      CakeJob.find({ dueAt: { $lte: soon }, status: { $nin: ['Completed', 'Cancelled'] } })
        .sort({ dueAt: 1 }).limit(8)
        .select('customerName cakeDescription dueAt status').lean(),
      Reservation.find({ pickupAt: { $lte: soon }, status: { $nin: ['Collected', 'Cancelled'] } })
        .sort({ pickupAt: 1 }).limit(8)
        .select('customerName description pickupAt status').lean(),
    ]);

    const deadlines = [
      ...cakeDeadlines.map(item => ({ id: String(item._id), kind: 'Cake', customer: item.customerName,
        detail: item.cakeDescription, dueAt: item.dueAt, status: item.status })),
      ...pickupDeadlines.map(item => ({ id: String(item._id), kind: 'Pickup', customer: item.customerName,
        detail: item.description, dueAt: item.pickupAt, status: item.status })),
    ].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)).slice(0, 8);

    res.json({
      checkedAt: now.toISOString(),
      summary: { pendingOrders, activeOrders, readyOrders, activeCakes, duePickups, lowStock },
      deadlines,
      priorityOrders: priorityOrders.map(order => ({ id: String(order._id), customer: order.customerName,
        status: order.status, total: order.total, createdAt: order.createdAt })),
    });
  } catch (error) { next(error); }
});

export default router;
