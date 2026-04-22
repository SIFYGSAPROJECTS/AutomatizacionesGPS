"use client";

import { useMemo, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { Map as MapIcon, MapPin, Globe, Building2, Truck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface LocationStat {
  city: string;
  state: string;
  tripCount: number;
  vehicles: Set<string>;
  isWorkZone: boolean;
}

export function UbicacionesPanel() {
  const { rawParsedData } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState("");

  const stats = useMemo(() => {
    if (!rawParsedData) return null;

    const locationMap = new Map<string, LocationStat>();
    const WORK_ZONES_KEYWORDS = ["minatitlan", "minatitlán", "comalcalco", "veracruz", "boca del rio", "coatzacoalcos", "villahermosa", "nanchital", "dos bocas"];

    rawParsedData.forEach((row: any) => {
      const getField = (keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
          if (match && row[match]) return String(row[match]).trim();
        }
        return "";
      };

      const direccion = getField(["lugar", "direccion", "dirección"]);
      const vehiculo = getField(["vehiculo", "vehículo", "matricula"]);
      if (!direccion) return;

      // Intentar extraer Ciudad y Estado del formato: "Calle, Colonia, Ciudad, Estado, Pais"
      const parts = direccion.split(",").map(p => p.trim());
      // Normalmente el formato es: [Calle, Colonia, Ciudad, CP Estado, Pais]
      // Intentamos tomar la ciudad (penúltima o antepenúltima parte)
      let city = "Desconocido";
      let state = "Desconocido";

      if (parts.length >= 3) {
        city = parts[parts.length - 3] || "Desconocido";
        state = parts[parts.length - 2] || "Desconocido";
      }

      const key = `${city}_${state}`.toLowerCase();
      if (!locationMap.has(key)) {
        const isWorkZone = WORK_ZONES_KEYWORDS.some(kw => city.toLowerCase().includes(kw) || state.toLowerCase().includes(kw));
        locationMap.set(key, {
          city,
          state,
          tripCount: 0,
          vehicles: new Set(),
          isWorkZone
        });
      }

      const loc = locationMap.get(key)!;
      loc.tripCount++;
      if (vehiculo) loc.vehicles.add(vehiculo);
    });

    const sortedLocations = Array.from(locationMap.values()).sort((a, b) => b.tripCount - a.tripCount);
    
    const topStates = new Map<string, number>();
    sortedLocations.forEach(loc => {
      topStates.set(loc.state, (topStates.get(loc.state) || 0) + loc.tripCount);
    });

    return {
      locations: sortedLocations,
      topStates: Array.from(topStates.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    };
  }, [rawParsedData]);

  if (!rawParsedData || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
          <Globe className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="font-heading text-4xl text-white mt-4">Sin Datos de Ubicación</h2>
        <p className="text-zinc-400">Carga un reporte para mapear los estados y ciudades visitadas.</p>
      </div>
    );
  }

  const filtered = stats.locations.filter(l => 
    l.city.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.state.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 pb-20 animate-in fade-in duration-500">
      
      {/* SECCIÓN A: RESUMEN POR ESTADOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-blue-500" />
            Top Estados Visitados
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topStates} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#71717a', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                  {stats.topStates.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#1d4ed8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-zinc-500 mt-4 italic">
            * Basado en la frecuencia de registros GPS en deshoras y horario laboral.
          </p>
        </div>

        {/* SECCIÓN B: BUSCADOR DE CIUDADES */}
        <div className="lg:col-span-2 bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl flex flex-col">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <div>
              <h3 className="text-lg font-bold text-white">Censo de Ciudades y Zonas</h3>
              <p className="text-xs text-zinc-500">Analizando {stats.locations.length} ciudades distintas detectadas en el reporte.</p>
            </div>
            
            <div className="relative w-full md:w-64">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Filtrar ciudad o estado..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg pl-10 pr-3 py-2 w-full focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar max-h-[400px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#050505] z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase">Ciudad / Zona</th>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Viajes</th>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Unidades</th>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-right">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filtered.map((l, i) => (
                  <tr key={i} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{l.city}</span>
                        <span className="text-xs text-zinc-500">{l.state}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-zinc-300 font-mono">{l.tripCount}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-zinc-400">
                        <Truck className="w-3 h-3" />
                        <span className="text-xs">{l.vehicles.size}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {l.isWorkZone ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                          <Building2 className="w-3 h-3" />
                          Zona Grial
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-medium uppercase italic">Fuera de Zona</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
