"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface ChartProps {
  data: any[];
  minTemp: number;
  maxTemp: number;
}

export default function TemperatureChart({ data, minTemp, maxTemp }: ChartProps) {
  // Veriyi formata sok ve grafikte soldan sağa akması için ters çevir
  const formattedData = data.map(log => ({
    time: format(new Date(log.timestamp), 'HH:mm'),
    fullTime: format(new Date(log.timestamp), 'dd MMM HH:mm', { locale: tr }),
    temperature: log.temperature
  })).reverse(); 

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
          
          <ReferenceLine y={maxTemp} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Max Limit', fill: '#ef4444', fontSize: 10 }} />
          <ReferenceLine y={minTemp} stroke="#3b82f6" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Min Limit', fill: '#3b82f6', fontSize: 10 }} />

          <Line 
            type="monotone" 
            dataKey="temperature" 
            name="Sıcaklık"
            stroke="#06b6d4" 
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: '#06b6d4', stroke: '#0f172a', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
