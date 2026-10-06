import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import dbConnect from "@/lib/mongodb";
import Device from "@/models/Device";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
    }

    const { email, deviceIds } = await req.json();
    if (!email || !deviceIds || !deviceIds.length) {
      return NextResponse.json({ error: "Email ve en az bir cihaz seçilmelidir." }, { status: 400 });
    }

    await dbConnect();
    
    // Find the target user
    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser) {
      return NextResponse.json({ error: "Bu email adresi sistemde kayıtlı değil." }, { status: 404 });
    }

    const userId = (session.user as any).id;

    if (targetUser._id.toString() === userId) {
      return NextResponse.json({ error: "Kendinize davet gönderemezsiniz." }, { status: 400 });
    }

    // Process each selected device
    for (const deviceId of deviceIds) {
      const device = await Device.findOne({ deviceId, ownerId: userId });
      if (device) {
        // Prevent duplicate shares
        const alreadyShared = device.sharedWith.some((id: any) => id.toString() === targetUser._id.toString());
        if (!alreadyShared) {
          device.sharedWith.push(targetUser._id);
          await device.save();
        }
      }
    }

    return NextResponse.json({ success: true, message: "Davet başarıyla gönderildi." });
  } catch (error) {
    console.error("Invite API error:", error);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
    }

    const { targetUserId, deviceId } = await req.json();
    if (!targetUserId || !deviceId) {
      return NextResponse.json({ error: "Kullanıcı ve cihaz ID gereklidir." }, { status: 400 });
    }

    await dbConnect();
    const userId = (session.user as any).id;

    const device = await Device.findOne({ deviceId, ownerId: userId });
    if (!device) {
      return NextResponse.json({ error: "Cihaz bulunamadı veya yetkiniz yok." }, { status: 404 });
    }

    device.sharedWith = device.sharedWith.filter((id: any) => id.toString() !== targetUserId);
    await device.save();

    return NextResponse.json({ success: true, message: "Erişim başarıyla kaldırıldı." });
  } catch (error) {
    console.error("Remove Invite API error:", error);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
