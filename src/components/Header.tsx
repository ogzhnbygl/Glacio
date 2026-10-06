"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, ShieldCheck, Snowflake } from "lucide-react";

import ApiKeyModal from "./ApiKeyModal";
import InviteUserModal from "./InviteUserModal";
import UserProfileModal from "./UserProfileModal";

export default function Header({ user, apiKey, devices = [], autoPrompt = false }: { user: any; apiKey?: string; devices?: any[], autoPrompt?: boolean }) {
  const currentUserId = user?.id || user?._id;

  return (
    <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white flex items-center gap-2.5 group">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all duration-300">
            <div className="absolute inset-0 bg-white/20 rounded-xl blur-[1px] mix-blend-overlay"></div>
            <Snowflake className="w-5 h-5 text-white drop-shadow-md group-hover:rotate-90 transition-transform duration-700" />
          </div>
          <span className="tracking-tight">Glacio</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          {user?.role === "admin" && (
            <Link href="/admin" className="text-sm font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors">
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline-block">Süper Admin</span>
            </Link>
          )}

          {/* Show modals only if data is passed (e.g. on Dashboard) */}
          {apiKey !== undefined && (
            <ApiKeyModal apiKey={apiKey} deviceCount={devices.length} />
          )}

          {devices.length > 0 && currentUserId && (
            <InviteUserModal devices={devices} currentUserId={currentUserId} />
          )}
          
          <div className="flex items-center gap-4 pl-4 border-l border-slate-800">
            <UserProfileModal userProfile={user} autoPrompt={autoPrompt} />
            
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
