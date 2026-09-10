import mongoose, { type InferSchemaType, type Model } from "mongoose";

const practiceStateSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  kitId: { type: mongoose.Schema.Types.ObjectId, ref: "Kit", required: true, index: true },
  flashcardInternalId: { type: String, required: true },
  confidence: { type: Number, enum: [1, 2, 3], default: null },
  practiceCount: { type: Number, default: 0 },
  lastPracticedAt: { type: Date, default: null },
}, { timestamps: true });

practiceStateSchema.index({ kitId: 1, flashcardInternalId: 1 }, { unique: true });
export type PracticeStateDocument = InferSchemaType<typeof practiceStateSchema> & { _id: mongoose.Types.ObjectId };
export const PracticeState: Model<PracticeStateDocument> = mongoose.models.PracticeState ?? mongoose.model<PracticeStateDocument>("PracticeState", practiceStateSchema);
