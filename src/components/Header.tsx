"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, User as UserIcon, ShieldCheck } from "lucide-react";

export default function Header({ user }: { user: any }) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white flex items-center gap-2">
          <div className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center text-white font-bold">
            G
          </div>
          Glacio
        </Link>

        <div className="flex items-center gap-6">
          {user?.role === "admin" && (
            <Link href="/admin" className="text-sm font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors">
              <ShieldCheck className="w-4 h-4" />
              Süper Admin
            </Link>
          )}
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-slate-400" />
              </div>
              <span className="hidden sm:inline-block">{user?.name || user?.email}</span>
            </div>
            
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-slate-500 hover:text-rose-400 transition-colors p-2 rounded-lg hover:bg-rose-500/10"
              title="Çıkış Yap"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
