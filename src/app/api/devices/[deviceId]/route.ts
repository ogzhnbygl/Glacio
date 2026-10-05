import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import dbConnect from "@/lib/mongodb";
import Device from "@/models/Device";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
    }

    const { deviceId } = await params;
    const body = await req.json();
    const { name, minTemp, maxTemp, cabinetType } = body;

    await dbConnect();

    const device = await Device.findOne({ deviceId });

    if (!device) {
      return NextResponse.json({ error: "Cihaz bulunamadı." }, { status: 404 });
    }

    const userId = (session.user as any).id;
    const isAdmin = (session.user as any).role === "admin";
    const isOwner = device.ownerId?.toString() === userId;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Bu cihazı düzenleme yetkiniz yok." }, { status: 403 });
    }

    if (name) device.name = name;
    if (minTemp !== undefined) device.minTemp = minTemp;
    if (maxTemp !== undefined) device.maxTemp = maxTemp;
    if (cabinetType) device.cabinetType = cabinetType;

    await device.save();

    return NextResponse.json({ success: true, device });
  } catch (error) {
    console.error("Device update error:", error);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
