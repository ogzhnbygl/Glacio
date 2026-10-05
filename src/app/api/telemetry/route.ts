import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Device from '@/models/Device';
import TelemetryLog from '@/models/TelemetryLog';
import User from '@/models/User';

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 401 });
    }

    await dbConnect();

    // Validate User via API Key
    const user = await User.findOne({ apiKey });
    if (!user) {
      return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
    }

    const body = await req.json();
    const { deviceId, temperature } = body;

    if (!deviceId || typeof temperature !== 'number') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Validate Device Ownership
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found in system' }, { status: 404 });
    }
    
    if (!device.isClaimed || !device.ownerId) {
      return NextResponse.json({ error: 'Device is not claimed yet' }, { status: 403 });
    }

    if (device.ownerId.toString() !== user._id.toString()) {
      return NextResponse.json({ error: 'Device does not belong to this API Key' }, { status: 403 });
    }

    // 1. Create telemetry log entry
    await TelemetryLog.create({
      deviceId,
      temperature,
      timestamp: new Date()
    });

    // 2. Update device's last seen time and status
    device.lastSeen = new Date();
    device.isOnline = true;
    await device.save();

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
