"use client";

import { useState } from "react";
import { Settings, X, Save } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DeviceSettingsModal({ device }: { device: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(device.name);
  const [minTemp, setMinTemp] = useState(device.minTemp);
  const [maxTemp, setMaxTemp] = useState(device.maxTemp);
  const [minTemp2, setMinTemp2] = useState(device.minTemp2 || -22);
  const [maxTemp2, setMaxTemp2] = useState(device.maxTemp2 || -16);
  const [cabinetType, setCabinetType] = useState(device.cabinetType || 'unconfigured');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/devices/${device.deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name, 
          minTemp, 
          maxTemp, 
          cabinetType,
          ...(cabinetType === 'dual_plus4_minus20' ? { minTemp2, maxTemp2 } : {}) 
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Güncelleme başarısız.");
      }

      setIsOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 hover:text-cyan-400 rounded-lg text-sm transition-all text-white"
      >
        <Settings className="w-4 h-4" />
        <span>Cihaz Ayarları</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-500" /> Cihaz Ayarları
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {error && (
                <div className="bg-rose-500/10 text-rose-400 p-3 rounded-lg text-sm border border-rose-500/20">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Görünen Cihaz Adı</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Dolap Konfigürasyonu (Sensör Tipi)</label>
                <select
                  value={cabinetType}
                  onChange={(e) => setCabinetType(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 appearance-none"
                >
                  <option value="unconfigured">Belirlenmedi (Seçiniz)</option>
                  <option value="single_plus4">Sadece +4°C (Tek Sensör)</option>
                  <option value="single_minus20">Sadece -20°C (Tek Sensör)</option>
                  <option value="single_minus80">Sadece -80°C (Tek Sensör)</option>
                  <option value="dual_plus4_minus20">Kombine: +4°C ve -20°C (Çift Sensör)</option>
                </select>
                <p className="text-xs text-slate-500 mt-2">Not: Çift sensörlü seçimlerde cihaz donanımının bunu desteklemesi gerekir.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 text-sm font-semibold text-cyan-400 mt-2 mb-[-8px]">
                  {cabinetType === 'dual_plus4_minus20' ? 'Sensör 1 (+4°C Bölümü) Hedefleri' : 'Sensör Hedefleri'}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Minimum Sıcaklık (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={minTemp}
                    onChange={(e) => setMinTemp(parseFloat(e.target.value))}
                    className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Maksimum Sıcaklık (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={maxTemp}
                    onChange={(e) => setMaxTemp(parseFloat(e.target.value))}
                    className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    required
                  />
                </div>
              </div>

              {cabinetType === 'dual_plus4_minus20' && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="col-span-2 text-sm font-semibold text-cyan-400 mb-[-8px]">
                    Sensör 2 (-20°C Bölümü) Hedefleri
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Minimum Sıcaklık (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={minTemp2}
                      onChange={(e) => setMinTemp2(parseFloat(e.target.value))}
                      className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Maksimum Sıcaklık (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={maxTemp2}
                      onChange={(e) => setMaxTemp2(parseFloat(e.target.value))}
                      className="block w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-800/50 mt-6">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {loading ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
