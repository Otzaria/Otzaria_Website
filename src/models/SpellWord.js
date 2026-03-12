import mongoose from 'mongoose';

const SpellWordSchema = new mongoose.Schema({
  word: { type: String, required: true, unique: true },
  addedBy: { type: String }
}, { timestamps: true });

const SpellWord = mongoose.models.SpellWord || mongoose.model('SpellWord', SpellWordSchema);

export default SpellWord;
