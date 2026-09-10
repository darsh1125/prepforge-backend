import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { GENERATION_STATUSES } from "../core/status/generation.js";

const warningSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    stage: { type: String },
    recoverable: { type: Boolean },
  },
  { _id: false },
);

const kitRecordSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    input: {
      jd: { type: String, default: "" },
      company_url: { type: String, default: "" },
      days: { type: Number, default: 1 },
    },
    status: {
      type: String,
      enum: GENERATION_STATUSES,
      default: "queued",
      index: true,
    },
    progress: {
      stage: { type: String, default: "queued" },
      percent: { type: Number, default: 0 },
      message: { type: String, default: "" },
    },
    warnings: { type: [warningSchema], default: [] },
    /**
     * External Appendix A kit only. Do not store ownerId/status here.
     * Editor/practice metadata live in sibling fields so regeneration
     * and confidence tracking can evolve without polluting evaluator output.
     */
    kit: { type: mongoose.Schema.Types.Mixed, default: null },
    editorMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    practiceMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    inputFingerprint: { type: String, index: true },
    research: { type: mongoose.Schema.Types.Mixed, default: null },
    extraction: { type: mongoose.Schema.Types.Mixed, default: null },
    questions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    questionMetadata: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

kitRecordSchema.index({ ownerId: 1, updatedAt: -1 });

export type KitDocument = InferSchemaType<typeof kitRecordSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Kit: Model<KitDocument> =
  mongoose.models.Kit ?? mongoose.model<KitDocument>("Kit", kitRecordSchema);
