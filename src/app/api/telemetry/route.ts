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
    const { deviceId, readings, temperature, temperature2, batteryVoltage, batteryPercentage, rssi, txPower } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
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

    // Toplu (Batch) Telemetri Desteği (Deep Sleep Modu için)
    if (Array.isArray(readings) && readings.length > 0) {
      const now = Date.now();
      const logsToInsert = [];

      for (let i = 0; i < readings.length; i++) {
        const r = readings[i];
        const isLatestReading = (i === readings.length - 1);
        const hasT1 = typeof r.temperature === 'number' && !Number.isNaN(r.temperature);
        const hasT2 = typeof r.temperature2 === 'number' && !Number.isNaN(r.temperature2);
        const hasV = typeof r.batteryVoltage === 'number' && !Number.isNaN(r.batteryVoltage);
        const hasP = typeof r.batteryPercentage === 'number' && !Number.isNaN(r.batteryPercentage);
        const rRssi = typeof r.rssi === 'number' ? r.rssi : (isLatestReading && typeof rssi === 'number' ? rssi : undefined);
        const rTx = typeof r.txPower === 'number' ? r.txPower : (isLatestReading && typeof txPower === 'number' ? txPower : undefined);
        const offsetMin = typeof r.offsetMinutes === 'number' ? r.offsetMinutes : 0;

        if (hasT1 || hasT2 || hasV || hasP) {
          logsToInsert.push({
            deviceId,
            ...(hasT1 ? { temperature: r.temperature } : {}),
            ...(hasT2 ? { temperature2: r.temperature2 } : {}),
            ...(hasV ? { batteryVoltage: r.batteryVoltage } : {}),
            ...(hasP ? { batteryPercentage: r.batteryPercentage } : {}),
            ...(typeof rRssi === 'number' ? { rssi: rRssi } : {}),
            ...(typeof rTx === 'number' ? { txPower: rTx } : {}),
            timestamp: new Date(now + offsetMin * 60000)
          });
        }
      }

      if (logsToInsert.length > 0) {
        await TelemetryLog.insertMany(logsToInsert);
      }

      // Son ölçüm ile cihaz durumunu güncelle
      const latest = readings[readings.length - 1];
      const hasLatestT1 = typeof latest.temperature === 'number' && !Number.isNaN(latest.temperature);
      const hasLatestT2 = typeof latest.temperature2 === 'number' && !Number.isNaN(latest.temperature2);
      const hasLatestV = typeof latest.batteryVoltage === 'number' && !Number.isNaN(latest.batteryVoltage);
      const hasLatestP = typeof latest.batteryPercentage === 'number' && !Number.isNaN(latest.batteryPercentage);

      device.lastSeen = new Date();
      device.isOnline = true;
      if (hasLatestT1) device.lastTemp = latest.temperature;
      if (hasLatestT2) device.lastTemp2 = latest.temperature2;
      if (hasLatestV) device.batteryVoltage = latest.batteryVoltage;
      if (hasLatestP) device.batteryPercentage = latest.batteryPercentage;

      const effectiveRssi = typeof latest.rssi === 'number' ? latest.rssi : (typeof rssi === 'number' ? rssi : undefined);
      const effectiveTxPower = typeof latest.txPower === 'number' ? latest.txPower : (typeof txPower === 'number' ? txPower : undefined);
      if (typeof effectiveRssi === 'number') device.rssi = effectiveRssi;
      if (typeof effectiveTxPower === 'number') device.txPower = effectiveTxPower;

      await device.save();

      return NextResponse.json({ success: true, count: logsToInsert.length, device });
    }

    // Tekil Telemetri (Eski / Anlık Akış)
    const hasTemp1 = typeof temperature === 'number' && !Number.isNaN(temperature);
    const hasTemp2 = typeof temperature2 === 'number' && !Number.isNaN(temperature2);
    const hasBatVoltage = typeof batteryVoltage === 'number' && !Number.isNaN(batteryVoltage);
    const hasBatPercent = typeof batteryPercentage === 'number' && !Number.isNaN(batteryPercentage);
    const hasRssi = typeof rssi === 'number' && !Number.isNaN(rssi);
    const hasTxPower = typeof txPower === 'number' && !Number.isNaN(txPower);

    if (!hasTemp1 && !hasTemp2 && !hasBatVoltage && !hasBatPercent) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // 1. Create telemetry log entry
    await TelemetryLog.create({
      deviceId,
      ...(hasTemp1 ? { temperature } : {}),
      ...(hasTemp2 ? { temperature2 } : {}),
      ...(hasBatVoltage ? { batteryVoltage } : {}),
      ...(hasBatPercent ? { batteryPercentage } : {}),
      ...(hasRssi ? { rssi } : {}),
      ...(hasTxPower ? { txPower } : {}),
      timestamp: new Date()
    });

    // 2. Update device's last seen time, status, temperatures, and battery info
    device.lastSeen = new Date();
    device.isOnline = true;
    device.lastTemp = hasTemp1 ? temperature : undefined;
    device.lastTemp2 = hasTemp2 ? temperature2 : undefined;
    if (hasBatVoltage) {
      device.batteryVoltage = batteryVoltage;
    }
    if (hasBatPercent) {
      device.batteryPercentage = batteryPercentage;
    }
    if (hasRssi) {
      device.rssi = rssi;
    }
    if (hasTxPower) {
      device.txPower = txPower;
    }
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
