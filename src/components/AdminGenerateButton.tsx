"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminGenerateButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/devices", { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Cihaz üretilirken bir hata oluştu.");
      }
    } catch (err) {
      console.error(err);
      alert("Sunucu hatası.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleGenerate}
      disabled={loading}
      className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-cyan-900/20 disabled:opacity-50"
    >
      <Plus className="w-5 h-5" />
      {loading ? "Üretiliyor..." : "Yeni Cihaz Üret"}
    </button>
  );
}
