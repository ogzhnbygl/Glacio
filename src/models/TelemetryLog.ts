import mongoose from 'mongoose';

export interface ITelemetryLog extends mongoose.Document {
  deviceId: string;
  temperature: number;
  timestamp: Date;
}

const TelemetryLogSchema = new mongoose.Schema<ITelemetryLog>({
  deviceId: { type: String, required: true, index: true },
  temperature: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: { expires: '30d' } } // Veri birikmemesi için 30 günlük TTL index
});

export default mongoose.models.TelemetryLog || mongoose.model<ITelemetryLog>('TelemetryLog', TelemetryLogSchema);
