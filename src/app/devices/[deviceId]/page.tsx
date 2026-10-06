import dbConnect from "@/lib/mongodb";
import Device from "@/models/Device";
import TelemetryLog from "@/models/TelemetryLog";
import TemperatureChart from "@/components/TemperatureChart";
import { ArrowLeft, Thermometer, Clock, Activity, AlertTriangle } from "lucide-react";
import Link from "next/link";
import DeviceSettingsModal from "@/components/DeviceSettingsModal";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DeviceDetail({ params }: { params: Promise<{ deviceId: string }> }) {
  await dbConnect();
  
  // Next.js 15 requires params to be awaited
  const { deviceId } = await params;
  
  const device = await Device.findOne({ deviceId }).lean();
  
  if (!device) {
    notFound();
  }

  // Fetch last 100 logs
  const logs = await TelemetryLog.find({ deviceId })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();
    
  const currentTemp = logs.length > 0 ? logs[0].temperature : null;
  const currentTemp2 = logs.length > 0 ? logs[0].temperature2 : null;
  const isOnline = logs.length > 0 ? new Date().getTime() - new Date(device.lastSeen).getTime() < 5 * 60 * 1000 : false;
  
  const isDual = device.cabinetType === 'dual_plus4_minus20';
  
  const isDanger1 = currentTemp !== null && (currentTemp < device.minTemp || currentTemp > device.maxTemp);
  const isDanger2 = isDual && currentTemp2 !== null && device.minTemp2 !== undefined && device.maxTemp2 !== undefined && (currentTemp2 < device.minTemp2 || currentTemp2 > device.maxTemp2);
  const isDanger = isDanger1 || isDanger2;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-cyan-500/30 pb-20">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-5 pointer-events-none"></div>
      
      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          <span>Panele Dön</span>
        </Link>
        
        <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                {device.name}
              </h1>
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
              </div>
            </div>
            <p className="text-slate-400 font-mono text-sm">ID: {device.deviceId}</p>
          </div>
          
          <DeviceSettingsModal device={JSON.parse(JSON.stringify(device))} />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Current Status Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
             <div className={`absolute top-0 right-0 w-32 h-32 -mr-10 -mt-10 rounded-full blur-3xl opacity-20 transition-colors ${
                  !isOnline ? 'bg-slate-500' :
                  isDanger ? 'bg-rose-500' : 'bg-emerald-500'
                }`}></div>
            <h3 className="text-slate-400 font-medium mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Güncel Durum
            </h3>
            
            <div className={`flex items-end gap-6 mb-6 ${isDual ? 'flex-col items-start gap-4' : ''}`}>
              <div className="flex items-center gap-3">
                {isDual && <span className="text-slate-500 font-medium text-sm w-16">Sensör 1</span>}
                <div className={`text-6xl font-light tracking-tighter ${
                  !isOnline ? 'text-slate-500' :
                  isDanger1 ? 'text-rose-400' : 'text-white'
                }`}>
                  {currentTemp !== null ? currentTemp.toFixed(1) : '--'}
                  <span className="text-3xl text-slate-500 ml-1">°C</span>
                </div>
                {isDanger1 && isOnline && (
                  <div className="text-rose-400 animate-pulse" title="Sıcaklık limitleri dışında!">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                )}
              </div>

              {isDual && (
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 font-medium text-sm w-16">Sensör 2</span>
                  <div className={`text-6xl font-light tracking-tighter ${
                    !isOnline ? 'text-slate-500' :
                    isDanger2 ? 'text-rose-400' : 'text-white'
                  }`}>
                    {currentTemp2 !== null && currentTemp2 !== undefined ? currentTemp2.toFixed(1) : '--'}
                    <span className="text-3xl text-slate-500 ml-1">°C</span>
                  </div>
                  {isDanger2 && isOnline && (
                    <div className="text-rose-400 animate-pulse" title="Sensör 2 limitleri dışında!">
                      <AlertTriangle className="w-8 h-8" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-800/50">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Son Güncelleme</span>
                <span className="text-white text-sm font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-500" />
                  {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true, locale: tr })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Kayıt Tarihi</span>
                <span className="text-white text-sm font-medium">
                  {new Date(device.createdAt).toLocaleDateString('tr-TR')}
                </span>
              </div>
            </div>
          </div>

          {/* Config Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-2">
            <h3 className="text-slate-400 font-medium mb-4 flex items-center gap-2">
              <Thermometer className="w-4 h-4" /> Sıcaklık Limitleri
            </h3>
            <p className="text-sm text-slate-400 mb-6 max-w-md">
              Cihaz bu sıcaklık aralıklarının dışına çıkarsa uyarı sistemleri (Telegram) devreye girer.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mb-6">
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-1">Dolap Tipi</div>
                <div className="text-sm font-medium text-slate-300">
                  {device.cabinetType === 'single_plus4' && '+4°C (Tek Sensör)'}
                  {device.cabinetType === 'single_minus20' && '-20°C (Tek Sensör)'}
                  {device.cabinetType === 'single_minus80' && '-80°C (Tek Sensör)'}
                  {device.cabinetType === 'dual_plus4_minus20' && '+4°C ve -20°C (Çift)'}
                  {(!device.cabinetType || device.cabinetType === 'unconfigured') && 'Belirlenmedi'}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 max-w-md">
                {isDual && <div className="text-sm font-medium text-slate-500 w-16">Sensör 1</div>}
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-slate-500 text-xs mb-1">Minimum</div>
                  <div className="text-2xl font-semibold text-blue-400">{device.minTemp}°C</div>
                </div>
                <div className="text-slate-600">/</div>
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-slate-500 text-xs mb-1">Maksimum</div>
                  <div className="text-2xl font-semibold text-rose-400">{device.maxTemp}°C</div>
                </div>
              </div>

              {isDual && (
                <div className="flex items-center gap-4 max-w-md">
                  <div className="text-sm font-medium text-slate-500 w-16">Sensör 2</div>
                  <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                    <div className="text-slate-500 text-xs mb-1">Minimum</div>
                    <div className="text-2xl font-semibold text-purple-400">{device.minTemp2 ?? '--'}°C</div>
                  </div>
                  <div className="text-slate-600">/</div>
                  <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                    <div className="text-slate-500 text-xs mb-1">Maksimum</div>
                    <div className="text-2xl font-semibold text-amber-400">{device.maxTemp2 ?? '--'}°C</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-white">Sıcaklık Grafiği</h3>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-md">Son 100 Ölçüm</span>
          </div>
          
          {logs.length > 0 ? (
             <TemperatureChart 
                data={logs} 
                minTemp={device.minTemp} 
                maxTemp={device.maxTemp} 
                minTemp2={device.minTemp2}
                maxTemp2={device.maxTemp2}
                cabinetType={device.cabinetType}
              />
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-500">
              Henüz yeterli veri yok.
            </div>
          )}
        </div>
        
      </main>
    </div>
  );
}
