"use client";

import { useMemo, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { Building2, Home, MapPin, AlertTriangle, Truck, Moon, ChevronRight, CheckCircle2 } from "lucide-react";

interface PernoctaStat {
  vehiculo: string;
  conductor: string;
  location: string;
  isBase: boolean;
  nightCount: number;
  lastLat?: number;
  lastLng?: number;
  weekendExits: number;
}

export function BasesPanel() {
  const { rawParsedData } = useFleetStore();
  const [filter, setFilter] = useState<"all" | "base" | "home">("all");

  const analysis = useMemo(() => {
    if (!rawParsedData) return null;

    const pernoctas = new Map<string, PernoctaStat>();
    const OFFICE_KEYWORDS = ["oficina", "base", "taller", "cedis", "patio"];

    rawParsedData.forEach((row: any) => {
      const getField = (keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
          if (match && row[match]) return String(row[match]).trim();
        }
        return "";
      };

      const vehiculo = getField(["vehiculo", "unidad"]);
      const horaStr = getField(["hora", "inicio", "hora inicial"]);
      const direccion = getField(["lugar", "destino", "direccion", "dirección"]);
      const geocerca = getField(["geocerca", "geocercas"]);
      const fechaStr = getField(["fecha", "inicio"]);
      const dist = parseFloat(getField(["distancia", "km"])) || 0;

      if (!vehiculo || !horaStr) return;

      const hour = parseInt(horaStr.split(":")[0]);
      const isNight = hour >= 22 || hour <= 6;
      
      // Intentar detectar si es fin de semana
      const date = new Date(fechaStr);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

      if (isNight) {
        const key = vehiculo;
        if (!pernoctas.has(key)) {
          const isBase = OFFICE_KEYWORDS.some(kw => 
            direccion.toLowerCase().includes(kw) || 
            geocerca.toLowerCase().includes(kw)
          );

          pernoctas.set(key, {
            vehiculo,
            conductor: getField(["conductor"]),
            location: geocerca || direccion,
            isBase,
            nightCount: 0,
            weekendExits: 0
          });
        }
        
        const stat = pernoctas.get(key)!;
        stat.nightCount++;
        
        // Si hay movimiento (>0.5km) siendo fin de semana y fuera de base, es salida de domicilio
        if (isWeekend && dist > 0.5 && !stat.isBase) {
          stat.weekendExits++;
        }
      }
    });

    const results = Array.from(pernoctas.values());
    return {
      total: results.length,
      inBase: results.filter(r => r.isBase).length,
      atHome: results.filter(r => !r.isBase).length,
      alerts: results.filter(r => r.weekendExits > 0).length,
      list: results.sort((a, b) => b.weekendExits - a.weekendExits)
    };
  }, [rawParsedData]);

  if (!rawParsedData || !analysis) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-zinc-500">
        Carga un reporte para analizar el estatus de bases y pernoctas.
      </div>
    );
  }

  const filteredList = analysis.list.filter(item => {
    if (filter === "base") return item.isBase;
    if (filter === "home") return !item.isBase;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      
      {/* SEMÁFORO DE RESGUARDO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <Building2 className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase">En Base (Oficina)</p>
            <h4 className="text-2xl font-bold text-white">{analysis.inBase} <span className="text-sm font-normal text-zinc-600">unidades</span></h4>
          </div>
        </div>

        <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <Home className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase">En Domicilio</p>
            <h4 className="text-2xl font-bold text-white">{analysis.atHome} <span className="text-sm font-normal text-zinc-600">unidades</span></h4>
          </div>
        </div>

        <div className="bg-[#050505] border border-red-900/30 rounded-2xl p-5 flex items-center gap-4 shadow-lg shadow-red-950/10">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase">Salidas Detectadas</p>
            <h4 className="text-2xl font-bold text-red-500">{analysis.alerts} <span className="text-sm font-normal text-red-900">alertas</span></h4>
          </div>
        </div>
      </div>

      {/* LISTADO DE ESTATUS */}
      <div className="bg-[#050505] border border-zinc-900 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-zinc-900 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white">Censo de Pernoctas y Resguardos</h3>
            <p className="text-xs text-zinc-500">Análisis basado en la ubicación entre 22:00 y 06:00 hrs.</p>
          </div>
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 gap-1">
            <button onClick={() => setFilter("all")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === "all" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Todos</button>
            <button onClick={() => setFilter("base")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === "base" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Bases</button>
            <button onClick={() => setFilter("home")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === "home" ? "bg-amber-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Domicilios</button>
          </div>
        </div>

        <div className="overflow-auto max-h-[500px] custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#050505] z-10">
              <tr className="border-b border-zinc-800">
                <th className="py-4 px-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Unidad / Chofer</th>
                <th className="py-4 px-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center">Tipo Resguardo</th>
                <th className="py-4 px-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ubicación de Pernocta</th>
                <th className="py-4 px-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Estatus Finde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {filteredList.map((item, i) => (
                <tr key={i} className="group hover:bg-zinc-900/40 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${item.weekendExits > 0 ? "border-red-500/20 bg-red-500/5" : "border-zinc-800 bg-black"}`}>
                        <Truck className={`w-5 h-5 ${item.weekendExits > 0 ? "text-red-500" : "text-zinc-400"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white leading-none mb-1">{item.vehiculo}</p>
                        <p className="text-[10px] text-zinc-500 uppercase font-medium">{item.conductor || "Sin conductor"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-center">
                    {item.isBase ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase">
                        <Building2 className="w-3 h-3" /> Base Oficial
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-bold uppercase">
                        <Home className="w-3 h-3" /> Domicilio
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-start gap-2 max-w-[250px]">
                      <MapPin className="w-3.5 h-3.5 text-zinc-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-zinc-400 leading-relaxed truncate" title={item.location}>{item.location}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    {item.weekendExits > 0 ? (
                      <div className="flex flex-col items-end">
                        <span className="inline-flex items-center gap-1 text-red-500 text-xs font-bold bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-500/20">
                          <AlertTriangle className="w-3 h-3" /> {item.weekendExits} Salidas
                        </span>
                        <span className="text-[9px] text-red-900 mt-1 uppercase font-bold">Uso no autorizado</span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-500 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sin movimientos
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
