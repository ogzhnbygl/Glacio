import mongoose from 'mongoose';

export interface IDevice extends mongoose.Document {
  deviceId: string;
  name: string;
  lastSeen: Date;
  isOnline: boolean;
  minTemp: number;
  maxTemp: number;
  ownerId?: mongoose.Types.ObjectId;
  sharedWith: mongoose.Types.ObjectId[];
  claimSecret: string;
  isClaimed: boolean;
  createdAt: Date;
}

const DeviceSchema = new mongoose.Schema<IDevice>({
  deviceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: true },
  minTemp: { type: Number, required: true, default: 2.0 },
  maxTemp: { type: Number, required: true, default: 8.0 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  claimSecret: { type: String, required: true },
  isClaimed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Device || mongoose.model<IDevice>('Device', DeviceSchema);
