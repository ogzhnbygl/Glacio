"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface ChartProps {
  data: any[];
  minTemp: number;
  maxTemp: number;
  minTemp2?: number;
  maxTemp2?: number;
  cabinetType?: string;
}

export default function TemperatureChart({ data, minTemp, maxTemp, minTemp2, maxTemp2, cabinetType }: ChartProps) {
  // Veriyi formata sok ve grafikte soldan sağa akması için ters çevir
  const formattedData = data.map(log => ({
    time: format(new Date(log.timestamp), 'HH:mm'),
    fullTime: format(new Date(log.timestamp), 'dd MMM HH:mm', { locale: tr }),
    temperature: log.temperature,
    ...(log.temperature2 !== undefined && log.temperature2 !== null ? { temperature2: log.temperature2 } : {})
  })).reverse(); 

  const isDual = cabinetType === 'dual_plus4_minus20';

  return (
    <div className="h-80 w-full mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#64748b" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(val) => `${val}°C`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
            itemStyle={{ color: '#06b6d4' }}
            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
          />
          
          <ReferenceLine y={maxTemp} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: isDual ? 'Sensör 1 Max' : 'Max Limit', fill: '#ef4444', fontSize: 10 }} />
          <ReferenceLine y={minTemp} stroke="#3b82f6" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: isDual ? 'Sensör 1 Min' : 'Min Limit', fill: '#3b82f6', fontSize: 10 }} />

          {isDual && maxTemp2 !== undefined && (
            <ReferenceLine y={maxTemp2} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Sensör 2 Max', fill: '#f59e0b', fontSize: 10 }} />
          )}
          {isDual && minTemp2 !== undefined && (
            <ReferenceLine y={minTemp2} stroke="#8b5cf6" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Sensör 2 Min', fill: '#8b5cf6', fontSize: 10 }} />
          )}

          <Line 
            type="monotone" 
            dataKey="temperature" 
            name={isDual ? "Sensör 1 (+4°C)" : "Sıcaklık"}
            stroke="#06b6d4" 
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: '#06b6d4', stroke: '#0f172a', strokeWidth: 2 }}
          />

          {isDual && (
            <Line 
              type="monotone" 
              dataKey="temperature2" 
              name="Sensör 2 (-20°C)"
              stroke="#8b5cf6" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#0f172a', strokeWidth: 2 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
