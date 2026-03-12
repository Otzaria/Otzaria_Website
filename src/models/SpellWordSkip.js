import mongoose from 'mongoose';

const SpellWordSkipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  word: { type: String, required: true },
  skippedBy: { type: String }
}, { timestamps: true });

SpellWordSkipSchema.index({ userId: 1, word: 1 }, { unique: true });

const SpellWordSkip = mongoose.models.SpellWordSkip || mongoose.model('SpellWordSkip', SpellWordSkipSchema);

export default SpellWordSkip;
