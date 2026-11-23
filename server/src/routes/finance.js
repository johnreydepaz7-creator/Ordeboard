import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth, ownerOnly } from '../middleware/auth.js';
import Expense from '../models/Expense.js';
import Order from '../models/Order.js';
import InventoryItem from '../models/InventoryItem.js';
const router=Router();router.use(requireAuth,ownerOnly);
const validDate=v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const fields=z.object({description:z.string().trim().min(2).max(200),category:z.enum(['Ingredients','Utilities','Rent','Salary','Transport','Equipment','Other']),amount:z.number().finite().min(0.01).max(10000000),expenseDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validDate)}).strict();
function cents(v){return Math.round(v*100);}
router.get('/expenses',async(req,res,next)=>{try{const expenses=await Expense.find().sort({expenseDate:-1,createdAt:-1}).limit(300).lean();res.json({expenses:expenses.map(e=>({...e,amount:e.amountCents/100}))});}catch(e){next(e);}});
router.post('/expenses',async(req,res,next)=>{try{const parsed=fields.safeParse(req.body);const key=req.get('Idempotency-Key');if(!parsed.success||!key||!/^[a-zA-Z0-9-]{12,80}$/.test(key))return res.status(400).json({message:'Check expense details and request key.'});const old=await Expense.findOne({requestId:key});if(old)return res.json({expense:old,duplicatePrevented:true});const {amount,...data}=parsed.data;const expense=await Expense.create({...data,amountCents:cents(amount),requestId:key,createdBy:req.user.id});res.status(201).json({expense});}catch(e){if(e.code===11000)return res.status(409).json({message:'Duplicate expense submission.'});next(e);}});
router.patch('/expenses/:id',async(req,res,next)=>{try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Invalid expense ID.'});const parsed=fields.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Check expense fields.'});const {amount,...data}=parsed.data;const expense=await Expense.findByIdAndUpdate(req.params.id,{$set:{...data,amountCents:cents(amount)}},{new:true,runValidators:true});if(!expense)return res.status(404).json({message:'Expense not found.'});res.json({expense});}catch(e){next(e);}});
router.get('/summary',async(req,res,next)=>{try{
 const from=typeof req.query.from==='string'?req.query.from:'';const to=typeof req.query.to==='string'?req.query.to:'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!validDate(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!validDate(to)||from>to)return res.status(400).json({message:'Provide a valid date range.'});
 const start=new Date(`${from}T00:00:00+08:00`),end=new Date(new Date(`${to}T00:00:00+08:00`).getTime()+86400000);
 // Completed AND paid orders: estimates recorded revenue, not verified bank receipts.
 const orders=await Order.find({status:'Completed',paymentStatus:'Paid',paidCompletedAt:{$gte:start,$lt:end}}).select('total source').lean();
 const expenses=await Expense.find({expenseDate:{$gte:from,$lte:to}}).select('amountCents').lean();
 const salesCents=orders.reduce((n,o)=>n+cents(o.total),0),expenseCents=expenses.reduce((n,e)=>n+e.amountCents,0);
 const sources={};for(const order of orders)sources[order.source]=(sources[order.source]||0)+cents(order.total)/100;
 const lowStock=await InventoryItem.countDocuments({active:true,$expr:{$lte:['$quantity','$reorderLevel']}});
 res.json({from,to,sales:salesCents/100,expenses:expenseCents/100,balance:(salesCents-expenseCents)/100,orderCount:orders.length,lowStock,sources,note:'Sales are completed, fully paid orders measured by their first completed-and-paid date. Earlier qualifying orders need a one-time migration. The balance is not accounting net profit.'});
 }catch(e){next(e);}});
export default router;
