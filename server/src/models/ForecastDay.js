import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: String, // Manila business date; unique across workers and restarts.
  preparedAt: Date,
  prediction: mongoose.Schema.Types.Mixed,
  actual: mongoose.Schema.Types.Mixed,
});
export default mongoose.model('ForecastDay', schema);

export const ForecastMonth = mongoose.model('ForecastMonth', new mongoose.Schema({
  _id: String, // Calendar month, YYYY-MM
  preparedAt: Date,
  expectedOrders: Number,
  actualOrders: Number,
}));
