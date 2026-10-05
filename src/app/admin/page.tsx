import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import Device from "@/models/Device";
import { ShieldCheck, Package } from "lucide-react";
import AdminGenerateButton from "@/components/AdminGenerateButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as any).role !== "admin") {
    redirect("/login");
  }

  await dbConnect();
  const devices = await Device.find().sort({ createdAt: -1 }).lean();

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Panale Dön
          </Link>
        </div>
        <header className="flex items-center justify-between mb-10 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-cyan-500" />
              Süper Admin Paneli
            </h1>
            <p className="text-slate-400 mt-2">Tüm cihazları yönetin ve yeni cihazlar üretin.</p>
          </div>
          
          <AdminGenerateButton />
        </header>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <Package className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Sistemdeki Tüm Cihazlar</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 text-sm">
                  <th className="p-4 font-medium">Cihaz ID</th>
                  <th className="p-4 font-medium">İsim</th>
                  <th className="p-4 font-medium">Sahibi</th>
                  <th className="p-4 font-medium">Kutu Şifresi (Secret)</th>
                  <th className="p-4 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {devices.map((device: any) => (
                  <tr key={device._id.toString()} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 font-mono text-sm text-cyan-400">{device.deviceId}</td>
                    <td className="p-4 text-slate-200">{device.name}</td>
                    <td className="p-4 text-slate-400">
                      {device.ownerId ? <span className="text-emerald-400">Sahipli</span> : <span className="text-slate-500">Sahipsiz (Depoda)</span>}
                    </td>
                    <td className="p-4 font-mono text-sm text-slate-300">{device.claimSecret || "-"}</td>
                    <td className="p-4">
                      {device.isClaimed ? (
                        <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Aktif</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Beklemede</span>
                      )}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      Sistemde henüz hiç cihaz yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
