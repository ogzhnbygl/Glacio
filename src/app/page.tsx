import dbConnect from "@/lib/mongodb";
import Device from "@/models/Device";
import TelemetryLog from "@/models/TelemetryLog";
import { Thermometer, Activity, Clock, Server, AlertTriangle, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import Link from 'next/link';
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import ClaimDeviceModal from "@/components/ClaimDeviceModal";

import User from "@/models/User";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect("/login");
  }

  const userId = (session.user as any).id;

  await dbConnect();
  
  // Fetch user to get their API key
  const currentUser = await User.findById(userId).lean();
  const apiKey = currentUser?.apiKey || "";
  
  const devices = await Device.find({ 
    $or: [{ ownerId: userId }, { sharedWith: userId }] 
  }).populate("sharedWith", "email name").sort({ createdAt: -1 }).lean();
  
  // Fetch latest telemetry for each device
  const devicesWithTemp = await Promise.all(devices.map(async (device: any) => {
    const latestLog = await TelemetryLog.findOne({ deviceId: device.deviceId })
      .sort({ timestamp: -1 })
      .lean();
      
    // Determine if device is considered online (last seen within 5 minutes AND has at least one log)
    const isOnline = latestLog 
      ? new Date().getTime() - new Date(device.lastSeen).getTime() < 5 * 60 * 1000 
      : false;
    
      return {
        ...device,
        _id: device._id.toString(),
        currentTemp: latestLog ? latestLog.temperature : null,
        currentTemp2: latestLog ? latestLog.temperature2 : null,
        isActuallyOnline: isOnline
      };
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-cyan-500/30">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 pointer-events-none"></div>
      
      <Header 
        user={session.user} 
        apiKey={apiKey} 
        devices={JSON.parse(JSON.stringify(devices))} 
      />

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-sm font-medium mb-4 border border-cyan-500/20">
              <Activity className="w-4 h-4" />
              <span>Sistem Aktif</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-3">
              Glacio <span className="font-light">Panel</span>
            </h1>
            <p className="text-slate-400 max-w-xl text-lg mb-4">
              Laboratuvar ve dolap sıcaklıklarının gerçek zamanlı izleme ve yönetim platformu.
            </p>
          </div>
          
          <div className="flex gap-4 mb-4">
            <ClaimDeviceModal />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devicesWithTemp.map((device) => {
            const hasTemp = device.currentTemp !== null;
            const hasTemp2 = device.currentTemp2 !== null && device.currentTemp2 !== undefined;
            const isDual = device.cabinetType === 'dual_plus4_minus20';

            const isDanger1 = hasTemp && (device.currentTemp < device.minTemp || device.currentTemp > device.maxTemp);
            const isDanger2 = isDual && hasTemp2 && device.minTemp2 !== undefined && device.maxTemp2 !== undefined && (device.currentTemp2 < device.minTemp2 || device.currentTemp2 > device.maxTemp2);
            const isDanger = isDanger1 || isDanger2;
            
            return (
              <Link href={`/devices/${device.deviceId}`} key={device._id} className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-6 transition-all hover:bg-slate-800/80 hover:border-slate-700 hover:shadow-xl hover:shadow-cyan-900/10 overflow-hidden block">
                {/* Background gradient effect based on state */}
                <div className={`absolute top-0 right-0 w-32 h-32 -mr-10 -mt-10 rounded-full blur-3xl opacity-20 transition-colors ${
                  !device.isActuallyOnline ? 'bg-slate-500' :
                  isDanger ? 'bg-rose-500' : 'bg-emerald-500'
                }`}></div>

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-1 group-hover:text-cyan-300 transition-colors">
                      {device.name}
                    </h2>
                    <div className="text-slate-500 text-sm font-mono">{device.deviceId}</div>
                  </div>
                  
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    device.isActuallyOnline 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {device.isActuallyOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                  </div>
                </div>

                <div className={`flex items-end gap-3 mb-6 ${isDual ? 'flex-col items-start gap-2' : ''}`}>
                  <div className="flex items-center gap-3 w-full justify-between">
                    <div className="flex items-end gap-2">
                      {isDual && <span className="text-slate-500 font-medium text-xs mb-1 w-12">Sensör 1</span>}
                      <div className={`text-5xl font-light tracking-tighter ${
                        !device.isActuallyOnline ? 'text-slate-500' :
                        isDanger1 ? 'text-rose-400' : 'text-white'
                      }`}>
                        {hasTemp ? device.currentTemp.toFixed(1) : '--'}
                        <span className="text-2xl text-slate-500 ml-1">°C</span>
                      </div>
                    </div>
                    {isDanger1 && device.isActuallyOnline && (
                      <div className="text-rose-400 animate-pulse" title="Sıcaklık limitleri dışında!">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {isDual && (
                    <div className="flex items-center gap-3 w-full justify-between mt-2 pt-2 border-t border-slate-800/30">
                      <div className="flex items-end gap-2">
                        <span className="text-slate-500 font-medium text-xs mb-1 w-12">Sensör 2</span>
                        <div className={`text-5xl font-light tracking-tighter ${
                          !device.isActuallyOnline ? 'text-slate-500' :
                          isDanger2 ? 'text-rose-400' : 'text-white'
                        }`}>
                          {hasTemp2 ? device.currentTemp2.toFixed(1) : '--'}
                          <span className="text-2xl text-slate-500 ml-1">°C</span>
                        </div>
                      </div>
                      {isDanger2 && device.isActuallyOnline && (
                        <div className="text-rose-400 animate-pulse" title="Sensör 2 limitleri dışında!">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50">
                  <div className="col-span-2 sm:col-span-1">
                    <div className="text-slate-500 text-xs mb-1">Hedef Aralık</div>
                    <div className="text-slate-300 text-sm font-medium flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <Thermometer className="w-3.5 h-3.5 text-cyan-500" />
                        {device.minTemp}°C / {device.maxTemp}°C {isDual && <span className="text-[10px] text-slate-500">(S1)</span>}
                      </div>
                      {isDual && (
                        <div className="flex items-center gap-1">
                          <Thermometer className="w-3.5 h-3.5 text-purple-400" />
                          {device.minTemp2 ?? '--'}°C / {device.maxTemp2 ?? '--'}°C <span className="text-[10px] text-slate-500">(S2)</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <div className="text-slate-500 text-xs mb-1">Son Güncelleme</div>
                    <div className="text-slate-300 text-sm font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-cyan-500" />
                      {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true, locale: tr })}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          
          {devicesWithTemp.length === 0 && (
            <div className="col-span-full py-24 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
                <Server className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">Henüz cihaz bulunmuyor</h3>
              <p className="text-slate-400 max-w-sm mx-auto">
                Hesabınıza tanımlı bir cihaz yok. Yukarıdaki "Yeni Cihaz Ekle" butonuna tıklayarak kutudan çıkan şifre ile cihazınızı ekleyebilirsiniz.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
