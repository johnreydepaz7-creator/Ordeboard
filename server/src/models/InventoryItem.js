import mongoose from 'mongoose';
// Stock is adjusted through the movement endpoint, never from a browser-supplied total.
const schema = new mongoose.Schema({
 name:{type:String,required:true,trim:true,maxlength:120}, unit:{type:String,required:true,trim:true,maxlength:30},
 quantity:{type:Number,default:0,min:0}, reorderLevel:{type:Number,default:0,min:0},
 active:{type:Boolean,default:true}, createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true,optimisticConcurrency:true});
schema.index({name:1});
export default mongoose.model('InventoryItem',schema);
