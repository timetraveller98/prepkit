import { model, Schema } from "mongoose";

export interface UserDocument {
  _id: Schema.Types.ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const UserModel = model<UserDocument>("User", userSchema);
