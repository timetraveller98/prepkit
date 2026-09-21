import { model, Schema } from "mongoose";

export interface ReviewDocument {
  _id: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  kitId: Schema.Types.ObjectId;
  flashcardId: string;
  repetitions: number;
  intervalDays: number;
  ease: number;
  lastConfidence: number | null;
  lastReviewedAt: Date | null;
  dueAt: Date;
}

const reviewSchema = new Schema<ReviewDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kitId: { type: Schema.Types.ObjectId, ref: "Kit", required: true },
    flashcardId: { type: String, required: true },
    repetitions: { type: Number, default: 0 },
    intervalDays: { type: Number, default: 0 },
    ease: { type: Number, default: 2.5 },
    lastConfidence: { type: Number, default: null },
    lastReviewedAt: { type: Date, default: null },
    dueAt: { type: Date, required: true },
  },
  { timestamps: true },
);

reviewSchema.index({ kitId: 1, flashcardId: 1 }, { unique: true });
reviewSchema.index({ userId: 1, kitId: 1 });

export const ReviewModel = model<ReviewDocument>("Review", reviewSchema);
