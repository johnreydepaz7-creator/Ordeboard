// Phase 4 reporting endpoints. Every number is calculated from existing records.
// No editable report copies are stored, so reports cannot drift from source data.
import { Router } from 'express';
import { requireAuth, ownerOnly } from '../middleware/auth.js';
import Order from '../models/Order.js';
import Expense from '../models/Expense.js';
const router = Router();
router.use(requireAuth, ownerOnly);

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function range(req, res) {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to) || from > to) {
    res.status(400).json({ message: 'Choose a valid start and end date.' });
    return null;
  }
  // Keep the report responsive and bound database work to a predictable period.
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
  if ((end - start) / 86400000 > 367) {
    res.status(400).json({ message: 'Date range cannot exceed 366 days.' });
    return null;
  }
  return { from, to, start, end };
}
const peso = cents => Math.round(cents) / 100;
const moneyCents = amount => Math.round(Number(amount) * 100);
const sortTotals = obj => Object.entries(obj).map(([name, cents]) => ({ name, amount: peso(cents) })).sort((a,b) => b.amount - a.amount || a.name.localeCompare(b.name));

router.get('/overview', async (req, res, next) => {
  const dates = range(req, res);
  if (!dates) return;
  try {
    // Revenue here is the stated order total for completed AND fully paid orders.
    // paidCompletedAt is the first qualifying event, not the most recent edit time.
    const [orders, expenses] = await Promise.all([
      Order.find({status:'Completed', paymentStatus:'Paid', paidCompletedAt: {$gte:dates.start,$lt:dates.end}})
        .select('total source items paidCompletedAt').lean(),
      Expense.find({expenseDate:{$gte:dates.from,$lte:dates.to}})
        .select('amountCents category expenseDate').lean(),
    ]);
    const days = new Map();
    // Manila-local reporting days (UTC+08:00; no DST).
    function addDay(day,field,amount) {
      if (!days.has(day)) days.set(day,{ date:day, salesCents:0, expensesCents:0, orders:0 });
      days.get(day)[field] += amount;
    }
    const sourceTotals = {}, categoryTotals = {}, productTotals = {};
    let salesCents=0, expenseCents=0;
    for (const order of orders) {
      const value=moneyCents(order.total);
      salesCents+=value;
      const source=order.source||'Other';
      sourceTotals[source]=(sourceTotals[source]||0)+value;
      const day=new Date(order.paidCompletedAt.getTime()+8*3600000).toISOString().slice(0,10);
      addDay(day,'salesCents',value);
      days.get(day).orders++;
      for(const item of order.items||[]) {
        const key=item.name?.trim()||'Unspecified product';
        productTotals[key]=(productTotals[key]||0)+Number(item.quantity||0);
      }
    }
    for (const expense of expenses) {
      expenseCents+=expense.amountCents;
      categoryTotals[expense.category]=(categoryTotals[expense.category]||0)+expense.amountCents;
      addDay(expense.expenseDate,'expensesCents',expense.amountCents);
    }
    const trend=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))
      .map(d=>({date:d.date,sales:peso(d.salesCents),expenses:peso(d.expensesCents),orders:d.orders}));
    const topProducts=Object.entries(productTotals).map(([name,quantity])=>({name,quantity}))
      .sort((a,b)=>b.quantity-a.quantity || a.name.localeCompare(b.name)).slice(0,10);
    res.set('Cache-Control','no-store');
    res.json({from:dates.from,to:dates.to,summary:{sales:peso(salesCents),expenses:peso(expenseCents),balance:peso(salesCents-expenseCents),orderCount:orders.length,expenseCount:expenses.length,averageOrderValue:orders.length?peso(Math.round(salesCents/orders.length)):0},trend,salesBySource:sortTotals(sourceTotals),expensesByCategory:sortTotals(categoryTotals),topProducts,notes:['Sales count completed, fully paid orders using their first qualifying date, in Philippine time.','Balance is sales minus recorded expenses, not audited net profit.','Older orders without paidCompletedAt are excluded until reconciled.','Products are ranked by quantities in qualifying orders, not by inventory consumption.']});
  } catch(err){next(err);}
});
export default router;
