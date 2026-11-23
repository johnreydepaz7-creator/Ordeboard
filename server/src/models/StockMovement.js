import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 item:{type:mongoose.Schema.Types.ObjectId,ref:'InventoryItem',required:true,index:true},
 delta:{type:Number,required:true},previousQuantity:Number,newQuantity:Number,
 reason:{type:String,required:true,maxlength:200},
 requestId:{type:String,required:true,unique:true},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
export default mongoose.model('StockMovement',schema);
