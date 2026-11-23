// One custom cake production job; no payment data is stored here.
import mongoose from 'mongoose';
const cakeJobSchema = new mongoose.Schema({
  customerName: { type: String, required: true, trim: true, maxlength: 120 },
  contact: { type: String, default: '', trim: true, maxlength: 100 },
  cakeDescription: { type: String, required: true, trim: true, maxlength: 300 },
  size: { type: String, required: true, trim: true, maxlength: 80 },
  flavor: { type: String, required: true, trim: true, maxlength: 100 },
  designInstructions: { type: String, default: '', trim: true, maxlength: 1500 },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  sourceOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  sourceReservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
  materials: [{ _id: false, item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true }, quantity: { type: Number, required: true, min: 1, max: 100000000 } }],
  stockDeductedAt: { type: Date, default: null },
  dueAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['Queued', 'Preparing', 'Decorating', 'Ready', 'Completed', 'Cancelled'], default: 'Queued', index: true },
  requestId: { type: String, trim: true, maxlength: 80 }, // One unique key per creation attempt.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, optimisticConcurrency: true });
// One production job per source record; don't duplicate work when multiple staff click.
cakeJobSchema.index({ sourceOrder: 1 }, { unique: true, partialFilterExpression: { sourceOrder: { $type: 'objectId' } } });
cakeJobSchema.index({ sourceReservation: 1 }, { unique: true, partialFilterExpression: { sourceReservation: { $type: 'objectId' } } });
cakeJobSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });
export default mongoose.model('CakeJob', cakeJobSchema);
