import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 description:{type:String,required:true,trim:true,maxlength:200},
 category:{type:String,enum:['Ingredients','Utilities','Rent','Salary','Transport','Equipment','Other'],required:true},
 amountCents:{type:Number,required:true,min:1,max:1000000000}, expenseDate:{type:String,required:true},
 requestId:{type:String,required:true,unique:true},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
export default mongoose.model('Expense',schema);
