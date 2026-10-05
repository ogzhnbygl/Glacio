import mongoose from 'mongoose';

export interface ITelemetryLog extends mongoose.Document {
  deviceId: string;
  temperature: number;
  temperature2?: number;
  timestamp: Date;
}

const TelemetryLogSchema = new mongoose.Schema<ITelemetryLog>({
  deviceId: { type: String, required: true },
  temperature: { type: Number, required: true },
  temperature2: { type: Number },
  timestamp: { type: Date, default: Date.now }
}, {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'deviceId',
    granularity: 'minutes'
  },
  expireAfterSeconds: 2592000 // 30 Gün (Saniye cinsinden)
});

export default mongoose.models.TelemetryLog || mongoose.model<ITelemetryLog>('TelemetryLog', TelemetryLogSchema);
