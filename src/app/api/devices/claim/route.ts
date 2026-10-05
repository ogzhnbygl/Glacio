import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import dbConnect from "@/lib/mongodb";
import Device from "@/models/Device";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
    }

    const { claimSecret } = await req.json();

    if (!claimSecret) {
      return NextResponse.json({ error: "Lütfen bir şifre girin." }, { status: 400 });
    }

    await dbConnect();

    const device = await Device.findOne({ claimSecret });

    if (!device) {
      return NextResponse.json({ error: "Bu şifreye ait cihaz bulunamadı. Şifreyi kontrol edin." }, { status: 404 });
    }

    if (device.isClaimed) {
      return NextResponse.json({ error: "Bu cihaz zaten başka biri tarafından sahiplenilmiş." }, { status: 400 });
    }

    // Assign device to user
    const userId = (session.user as any).id;
    device.ownerId = userId;
    device.isClaimed = true;
    await device.save();

    return NextResponse.json({ success: true, message: "Cihaz başarıyla üzerinize alındı." });
  } catch (error) {
    console.error("Claim error:", error);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
