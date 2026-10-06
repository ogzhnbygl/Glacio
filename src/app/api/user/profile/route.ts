import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
    }

    const { labName, institution, address } = await req.json();

    await dbConnect();
    const userId = (session.user as any).id;

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    if (labName !== undefined) user.labName = labName;
    if (institution !== undefined) user.institution = institution;
    if (address !== undefined) user.address = address;

    await user.save();

    return NextResponse.json({ success: true, user: { labName: user.labName, institution: user.institution, address: user.address } });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
