import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Device from '@/models/Device';
import TelemetryLog from '@/models/TelemetryLog';

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.IOT_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { deviceId, temperature } = body;

    if (!deviceId || typeof temperature !== 'number') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    await dbConnect();

    // 1. Create telemetry log entry
    await TelemetryLog.create({
      deviceId,
      temperature,
      timestamp: new Date()
    });

    // 2. Update device's last seen time and status
    const device = await Device.findOneAndUpdate(
      { deviceId },
      { 
        $set: { 
          lastSeen: new Date(), 
          isOnline: true 
        },
        $setOnInsert: {
          name: `Yeni Cihaz (${deviceId})`,
          minTemp: 2.0,
          maxTemp: 8.0,
          createdAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    // TODO: Faz 2 - Sıcaklık limitleri dışında ise Telegram botu ile bildirim gönder
    // if (temperature < device.minTemp || temperature > device.maxTemp) {
    //   await sendTelegramAlert(device, temperature);
    // }

    return NextResponse.json({ success: true, device });
  } catch (error: any) {
    console.error('Telemetry Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
