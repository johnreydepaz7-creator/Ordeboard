import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import InventoryItem from '../models/InventoryItem.js';
import StockMovement from '../models/StockMovement.js';
import { requireAuth } from '../middleware/auth.js';
const router=Router();router.use(requireAuth);
const idOk=id=>mongoose.isValidObjectId(id);
const itemFields=z.object({name:z.string().trim().min(1).max(120),unit:z.string().trim().min(1).max(30),reorderLevel:z.number().int().min(0).max(100000000)}).strict();
router.get('/',async(req,res,next)=>{try{const items=await InventoryItem.find({active:true}).sort({name:1}).limit(500).lean();res.json({items});}catch(e){next(e);}});
router.post('/',async(req,res,next)=>{try{const data=itemFields.safeParse(req.body);if(!data.success)return res.status(400).json({message:'Check inventory item fields.'});const item=await InventoryItem.create({...data.data,createdBy:req.user.id});res.status(201).json({item});}catch(e){next(e);}});
router.patch('/:id',async(req,res,next)=>{try{if(!idOk(req.params.id))return res.status(400).json({message:'Invalid item ID.'});const data=itemFields.safeParse(req.body);if(!data.success)return res.status(400).json({message:'Check inventory item fields.'});const item=await InventoryItem.findOneAndUpdate({_id:req.params.id,active:true},{$set:data.data},{new:true,runValidators:true});if(!item)return res.status(404).json({message:'Item not found.'});res.json({item});}catch(e){next(e);}});
// Conditional atomic stock changes prevent stock from falling below zero.
// A unique request key prevents the same submission from being applied twice.
router.post('/:id/movements',async(req,res,next)=>{try{
 if(!idOk(req.params.id))return res.status(400).json({message:'Invalid item ID.'});
 const data=z.object({delta:z.number().int().min(-100000000).max(100000000).refine(v=>v!==0),reason:z.string().trim().min(2).max(200)}).strict().safeParse(req.body);
 const key=req.get('Idempotency-Key');if(!data.success||!key||!/^[a-zA-Z0-9-]{12,80}$/.test(key))return res.status(400).json({message:'Invalid quantity, reason or request key.'});
 const existing=await StockMovement.findOne({requestId:key});if(existing)return res.json({movement:existing,duplicatePrevented:true});
 // MongoDB replica-set transactions are required to couple the count and audit row.
 // Standalone MongoDB is not suitable for this transaction; return a clear error.
 const session=await mongoose.startSession();let movement;
 try {await session.withTransaction(async()=>{
  const item=await InventoryItem.findOneAndUpdate({_id:req.params.id,active:true,quantity:{$gte:Math.max(0,-data.data.delta)}},{$inc:{quantity:data.data.delta}},{new:false,session});
  if(!item)throw Object.assign(new Error('Item missing or insufficient stock.'),{status:409});
  [movement]=await StockMovement.create([{item:item._id,delta:data.data.delta,previousQuantity:item.quantity,newQuantity:item.quantity+data.data.delta,reason:data.data.reason,requestId:key,createdBy:req.user.id}],{session});
 });}finally{await session.endSession();}
 res.status(201).json({movement});
 }catch(e){if(e.code===11000){const existing=await StockMovement.findOne({requestId:req.get('Idempotency-Key')});if(existing)return res.json({movement:existing,duplicatePrevented:true});}if(e.status)return res.status(e.status).json({message:e.message});if(e.code===20||/Transaction numbers are only allowed|replica set/i.test(e.message))return res.status(503).json({message:'Stock auditing requires MongoDB replica-set transactions. Configure a replica set before posting stock movements.'});next(e);}});
router.get('/:id/movements',async(req,res,next)=>{try{if(!idOk(req.params.id))return res.status(400).json({message:'Invalid item ID.'});const movements=await StockMovement.find({item:req.params.id}).sort({createdAt:-1}).limit(100).lean();res.json({movements});}catch(e){next(e);}});
export default router;
