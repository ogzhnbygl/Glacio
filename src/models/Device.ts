import mongoose from 'mongoose';

export interface IDevice extends mongoose.Document {
  deviceId: string;
  name: string;
  lastSeen: Date;
  isOnline: boolean;
  minTemp: number;
  maxTemp: number;
  createdAt: Date;
}

const DeviceSchema = new mongoose.Schema<IDevice>({
  deviceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: true },
  minTemp: { type: Number, required: true, default: 2.0 },
  maxTemp: { type: Number, required: true, default: 8.0 },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Device || mongoose.model<IDevice>('Device', DeviceSchema);
