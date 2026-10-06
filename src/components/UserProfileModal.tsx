"use client";

import { useState, useEffect } from "react";
import { User as UserIcon, X, Save, Building2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

interface UserProfile {
  name?: string;
  email?: string;
  labName?: string;
  institution?: string;
  address?: string;
}

export default function UserProfileModal({ userProfile, autoPrompt = false }: { userProfile: UserProfile, autoPrompt?: boolean }) {
  // If labName is missing, open modal automatically on mount
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const [labName, setLabName] = useState(userProfile.labName || "");
  const [institution, setInstitution] = useState(userProfile.institution || "");
  const [address, setAddress] = useState(userProfile.address || "");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    if (!userProfile.labName && autoPrompt) {
      setIsOpen(true);
    }
  }, [userProfile.labName, autoPrompt]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labName, institution, address }),
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
        className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-slate-800"
        title="Profili Düzenle"
      >
        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
          <UserIcon className="w-4 h-4 text-slate-400" />
        </div>
        <span className="hidden sm:inline-block font-medium">{userProfile.name || userProfile.email}</span>
      </button>

      {isMounted && isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-cyan-500" /> Profil ve Laboratuvar Bilgileri
              </h3>
              {userProfile.labName && (
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {!userProfile.labName && (
                <div className="bg-cyan-500/10 text-cyan-400 p-3 rounded-lg text-sm border border-cyan-500/20 mb-4">
                  Sistemi kullanmaya başlamadan önce lütfen laboratuvar bilgilerinizi eksiksiz doldurun. Bu bilgiler cihaz yönetimi için gereklidir.
                </div>
              )}

              {error && (
                <div className="bg-rose-500/10 text-rose-400 p-3 rounded-lg text-sm border border-rose-500/20">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Laboratuvar Adı</label>
                <div className="relative">
                  <input
                    type="text"
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                    className="block w-full pl-4 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    placeholder="Örn: Biyokimya Ar-Ge Laboratuvarı"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Bağlı Bulunan Kurum / Üniversite</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    placeholder="Örn: Hacettepe Üniversitesi Tıp Fakültesi"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Kurum Açık Adresi</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 pt-3 pointer-events-none">
                    <MapPin className="h-5 w-5 text-slate-500" />
                  </div>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 min-h-[80px]"
                    placeholder="Laboratuvarınızın tam adresi"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-800/50 mt-6">
                {userProfile.labName && (
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    İptal
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || !labName.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {loading ? "Kaydediliyor..." : "Bilgileri Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
