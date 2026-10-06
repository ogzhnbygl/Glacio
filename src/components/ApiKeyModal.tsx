"use client";

import { useState, useEffect } from "react";
import { Key, X, AlertCircle } from "lucide-react";
import { createPortal } from "react-dom";

export default function ApiKeyModal({ apiKey, deviceCount }: { apiKey: string; deviceCount: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
      >
        <Key className="w-4 h-4" />
        <span className="hidden sm:inline-block">API Key</span>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-500" /> Kurulum Anahtarı (API Key)
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {deviceCount === 0 ? (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">Cihaz Eklenmedi</p>
                    <p className="text-sm opacity-80">
                      Sistemde size ait bir cihaz bulunmuyor. API anahtarınızı görebilmek için öncelikle "Yeni Cihaz Ekle" butonunu kullanarak kutudan çıkan şifre ile en az bir cihazı sahiplenmeniz gerekmektedir.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-400">
                    Bu anahtarı, cihazınızı laboratuvar ağına bağlarken açılan <span className="text-cyan-400">"Glacio-Setup"</span> sayfasındaki <span className="font-semibold text-slate-300">"API Secret Key"</span> bölümüne yapıştırın.
                  </p>
                  
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mt-2">
                    <code className="text-cyan-400 text-sm select-all break-all block">
                      {apiKey}
                    </code>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 pt-0 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 transition-colors text-sm font-medium"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
