"use client";

import { useState, useEffect } from "react";
import { UserPlus, X, Send, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

export default function InviteUserModal({ devices, currentUserId }: { devices: any[]; currentUserId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  // Only devices owned by the current user
  const ownedDevices = devices.filter((d: any) => d.ownerId === currentUserId);

  // Extract all existing shares
  const existingShares: { targetUserId: string; targetEmail: string; deviceId: string; deviceName: string }[] = [];
  ownedDevices.forEach((device) => {
    if (device.sharedWith && Array.isArray(device.sharedWith)) {
      device.sharedWith.forEach((user: any) => {
        if (user && user._id) {
          existingShares.push({
            targetUserId: user._id.toString(),
            targetEmail: user.email,
            deviceId: device.deviceId,
            deviceName: device.name
          });
        }
      });
    }
  });

  const handleDeviceToggle = (deviceId: string) => {
    if (selectedDevices.includes(deviceId)) {
      setSelectedDevices(selectedDevices.filter((id) => id !== deviceId));
    } else {
      setSelectedDevices([...selectedDevices, deviceId]);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (selectedDevices.length === 0) {
      setError("Lütfen en az bir cihaz seçin.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, deviceIds: selectedDevices }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Davet gönderilemedi.");
      }

      setSuccess("Davet başarıyla gönderildi!");
      setEmail("");
      setSelectedDevices([]);
      router.refresh();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccess = async (targetUserId: string, deviceId: string) => {
    if (!confirm("Bu kullanıcının cihaza erişimini kaldırmak istediğinize emin misiniz?")) return;

    try {
      const res = await fetch("/api/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, deviceId }),
      });

      if (!res.ok) {
        throw new Error("Erişim kaldırılamadı.");
      }
      
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
      >
        <UserPlus className="w-4 h-4" />
        <span className="hidden sm:inline-block">Davet Et</span>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur z-10">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-500" /> Ekip Daveti
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleInvite} className="space-y-5">
                {error && (
                  <div className="bg-rose-500/10 text-rose-400 p-3 rounded-lg text-sm border border-rose-500/20">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-lg text-sm border border-emerald-500/20">
                    {success}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Davet Edilecek E-posta</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-500" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      placeholder="lab.arkadasi@universite.edu"
                      required
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Kişinin sistemde daha önceden kayıtlı olması gerekmektedir.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-3">Paylaşılacak Cihazlar</label>
                  {ownedDevices.length === 0 ? (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center text-sm text-slate-500">
                      Henüz size ait bir cihaz bulunmuyor.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {ownedDevices.map((device) => (
                        <label key={device.deviceId} className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedDevices.includes(device.deviceId)}
                            onChange={() => handleDeviceToggle(device.deviceId)}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50"
                          />
                          <div>
                            <div className="text-sm font-medium text-slate-200">{device.name}</div>
                            <div className="text-xs text-slate-500">{device.deviceId}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || ownedDevices.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  {loading ? "Gönderiliyor..." : "Davet Gönder"}
                </button>
              </form>

              {existingShares.length > 0 && (
                <div className="mt-10">
                  <h4 className="text-sm font-medium text-slate-400 mb-4 border-b border-slate-800 pb-2">Aktif Davetler</h4>
                  <div className="space-y-3">
                    {existingShares.map((share, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-200 truncate">{share.targetEmail}</div>
                          <div className="text-xs text-slate-500 truncate">{share.deviceName}</div>
                        </div>
                        <button
                          onClick={() => handleRemoveAccess(share.targetUserId, share.deviceId)}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors ml-4"
                          title="Erişimi Kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
