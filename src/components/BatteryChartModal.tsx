"use client";

import { useState } from "react";
import { Battery, X, Zap } from "lucide-react";
import { createPortal } from "react-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface BatteryLogPoint {
  timestamp: string | Date;
  batteryPercentage?: number;
  batteryVoltage?: number;
}

interface BatteryChartModalProps {
  data: BatteryLogPoint[];
  currentPercentage: number;
  currentVoltage: number | null;
  variant?: "row" | "badge";
}

export default function BatteryChartModal({
  data,
  currentPercentage,
  currentVoltage,
  variant = "row",
}: BatteryChartModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const formattedData = data
    .filter((d) => typeof d.batteryPercentage === "number")
    .map((log) => ({
      time: format(new Date(log.timestamp), "HH:mm"),
      fullTime: format(new Date(log.timestamp), "dd MMM HH:mm", { locale: tr }),
      percentage: log.batteryPercentage as number,
      voltage:
        typeof log.batteryVoltage === "number"
          ? Number(log.batteryVoltage.toFixed(2))
          : null,
    }));

  const percentages = formattedData.map((d) => d.percentage);
  const minPercent =
    percentages.length > 0 ? Math.min(...percentages) : currentPercentage;
  const maxPercent =
    percentages.length > 0 ? Math.max(...percentages) : currentPercentage;

  const badgeColorClass =
    currentPercentage > 50
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : currentPercentage > 20
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-rose-500/10 text-rose-400 border-rose-500/20";

  const strokeColor =
    currentPercentage > 50
      ? "#10b981"
      : currentPercentage > 20
      ? "#f59e0b"
      : "#f43f5e";

  return (
    <>
      {variant === "badge" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 hover:brightness-110 ${badgeColorClass}`}
          title="Günlük pil grafiğini görmek için tıklayın"
        >
          <Battery className="w-3.5 h-3.5" />
          <span>%{currentPercentage}</span>
          {currentVoltage !== null && (
            <span className="opacity-75 font-mono">
              ({currentVoltage.toFixed(2)}V)
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full flex justify-between items-center -mx-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer group text-left"
          title="Günlük pil grafiğini görmek için tıklayın"
        >
          <span className="text-slate-400 group-hover:text-cyan-400 transition-colors text-sm flex items-center gap-1.5">
            <Battery className="w-4 h-4 text-cyan-500" />
            <span className="underline decoration-slate-700 underline-offset-4 group-hover:decoration-cyan-500/50">
              Pil Seviyesi
            </span>
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border transition-transform group-hover:scale-105 ${badgeColorClass}`}
            >
              %{currentPercentage}
            </span>
            {currentVoltage !== null && (
              <span className="text-slate-400 text-xs font-mono">
                {currentVoltage.toFixed(2)} V
              </span>
            )}
          </div>
        </button>
      )}

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-cyan-950/30"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Battery className="w-5 h-5 text-cyan-400" />
                    Gün İçi Pil Seviyesi
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Son 24 saatlik pil yüzdesi ve voltaj takibi
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5">
                {/* Summary Mini Cards */}
                <div className="grid grid-cols-3 gap-2.5 mb-4">
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 text-center">
                    <div className="text-[11px] text-slate-500 mb-0.5">
                      Güncel
                    </div>
                    <div className="text-sm font-semibold text-white">
                      %{currentPercentage}
                      {currentVoltage !== null && (
                        <span className="text-xs text-slate-400 font-mono ml-1">
                          ({currentVoltage.toFixed(2)}V)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 text-center">
                    <div className="text-[11px] text-slate-500 mb-0.5">
                      En Yüksek
                    </div>
                    <div className="text-sm font-semibold text-emerald-400">
                      %{maxPercent}
                    </div>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 text-center">
                    <div className="text-[11px] text-slate-500 mb-0.5">
                      En Düşük
                    </div>
                    <div className="text-sm font-semibold text-amber-400">
                      %{minPercent}
                    </div>
                  </div>
                </div>

                {/* Chart */}
                {formattedData.length > 0 ? (
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={formattedData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="batteryGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={strokeColor}
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="95%"
                              stopColor={strokeColor}
                              stopOpacity={0.0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1e293b"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="time"
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={28}
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          domain={[
                            (dataMin: number) =>
                              Math.max(0, Math.floor(dataMin - 10)),
                            (dataMax: number) =>
                              Math.min(100, Math.ceil(dataMax + 5)),
                          ]}
                          tickFormatter={(val) => `%${val}`}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) {
                              return null;
                            }
                            const point = payload[0].payload;
                            return (
                              <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 shadow-xl text-xs">
                                <div className="text-slate-400 mb-1">
                                  {point.fullTime}
                                </div>
                                <div className="font-semibold text-white flex items-center gap-1.5">
                                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>Pil: %{point.percentage}</span>
                                  {point.voltage !== null && (
                                    <span className="text-slate-400 font-mono">
                                      ({point.voltage.toFixed(2)} V)
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="percentage"
                          stroke={strokeColor}
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#batteryGradient)"
                          dot={false}
                          activeDot={{
                            r: 5,
                            fill: strokeColor,
                            stroke: "#0f172a",
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-44 flex items-center justify-center text-slate-500 text-sm">
                    Gün içi pil geçmişi verisi henüz bulunmuyor.
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
