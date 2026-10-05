import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import dbConnect from "@/lib/mongodb";
import Device from "@/models/Device";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
    }

    await dbConnect();

    // Generate random strings for deviceId and claimSecret
    const randomSuffix = crypto.randomBytes(3).toString("hex");
    const deviceId = `glacio-node-${randomSuffix}`;
    const claimSecret = crypto.randomBytes(4).toString("hex").toUpperCase();

    const device = await Device.create({
      deviceId,
      name: `Yeni Cihaz (${deviceId})`,
      claimSecret,
      isClaimed: false,
      minTemp: 2.0,
      maxTemp: 8.0,
      sharedWith: []
    });

    return NextResponse.json({ success: true, device });
  } catch (error) {
    console.error("Admin device creation error:", error);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
