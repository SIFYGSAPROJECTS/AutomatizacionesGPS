"use client";

import { useEffect, useMemo, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { analyzeTrips } from "@/lib/tripAnalyzer";
import { AlertTriangle, MapPin, Navigation, Clock, Activity, Flag } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

export function RutasPanel() {
  const { rawParsedData, tripReport, setTripReport } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDay, setFilterDay] = useState<"weekend" | "all">("weekend");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  useEffect(() => {
    if (rawParsedData && !tripReport) {
      const report = analyzeTrips(rawParsedData);
      setTripReport(report);
    }
  }, [rawParsedData]);

  if (!rawParsedData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
          <Navigation className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="font-heading text-4xl text-white mt-4">Sin Datos</h2>
        <p className="text-zinc-400">Selecciona un mes en el Time Machine para analizar rutas.</p>
      </div>
    );
  }

  if (!tripReport) {
    return <div className="text-zinc-500 p-8 text-center animate-pulse">Analizando secuencias de rutas...</div>;
  }

  // KPIs
  const { kpis } = tripReport;

  // Filtrado de rutas frecuentes
  const baseRoutes = filterDay === "weekend" ? tripReport.frequentWeekendRoutes : tripReport.frequentRoutes;
  const filteredRoutes = baseRoutes.filter(r => {
    const matchesSearch = r.routeKey.toLowerCase().includes(searchTerm.toLowerCase()) || r.vehicles.some(v => v.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === "All" || r.tripTypeCategory === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const pieData = [
    { name: "Micro (< 10m)", value: kpis.microTripsWeekend, color: "#10b981" },
    { name: "Corto (10-30m)", value: kpis.shortTripsWeekend, color: "#3b82f6" },
    { name: "Medio (30-60m)", value: kpis.mediumTripsWeekend, color: "#f59e0b" },
    { name: "Largo (> 60m)", value: kpis.longTripsWeekend, color: "#ef4444" },
  ].filter(d => d.value > 0);

  const getBadgeColor = (type: string) => {
    switch (type) {
      case "Micro": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Corto": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "Medio": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "Largo": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-zinc-800 text-zinc-400";
    }
  };

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="flex flex-col gap-8 pb-20 animate-in fade-in duration-500">
      
      {/* SECCIÓN A: KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 hover:border-blue-500/30 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20">
            <Navigation className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-500 font-medium">Viajes Totales (Fin de Sem.)</p>
            <p className="text-2xl font-bold text-white">{kpis.totalWeekendTrips.toLocaleString()}</p>
          </div>
        </div>
        
        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 hover:border-red-500/30 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-500 font-medium">Rutas Largas ({">"}1hr)</p>
            <p className="text-2xl font-bold text-white">{kpis.longTripsWeekend.toLocaleString()}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 md:col-span-2 hover:border-zinc-700 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-zinc-900 border border-zinc-800">
            <MapPin className="w-6 h-6 text-zinc-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-zinc-500 font-medium">Ruta de mayor tráfico</p>
            <p className="text-lg font-bold text-white truncate" title={kpis.mostFrequentWeekendRoute}>{kpis.mostFrequentWeekendRoute}</p>
          </div>
        </div>
      </div>

      {/* SECCIÓN B: Gráficas de Categorización */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-white mb-6">Comportamiento de Viajes</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3 mt-4">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                  <span className="text-sm text-zinc-400">{d.name}</span>
                </div>
                <span className="text-sm font-bold text-white">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SECCIÓN C: Tabla de Rutas Frecuentes */}
        <div className="lg:col-span-2 bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl flex flex-col">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <h3 className="text-lg font-bold text-white shrink-0">Patrones de Movimiento</h3>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <select 
                value={filterDay}
                onChange={(e) => setFilterDay(e.target.value as any)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="weekend">Fines de Semana</option>
                <option value="all">Toda la Semana</option>
              </select>

              <select 
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="All">Todas las Duraciones</option>
                <option value="Micro">Micro (&lt;10m)</option>
                <option value="Corto">Corto (10-30m)</option>
                <option value="Medio">Medio (30-60m)</option>
                <option value="Largo">Largo (&gt;60m)</option>
              </select>

              <input 
                type="text" 
                placeholder="Buscar dirección o vehículo..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 w-full md:w-64 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#050505] z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase">Trayecto (Origen → Destino)</th>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Viajes</th>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Duración Prom.</th>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Categoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredRoutes.slice(0, 50).map((r, i) => (
                  <tr key={i} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="py-4 px-4 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                           <div className="w-2 h-2 rounded-full bg-zinc-600"></div>
                           <div className="w-px h-6 bg-zinc-800"></div>
                           <Flag className="w-3 h-3 text-red-500" />
                        </div>
                        <div className="flex flex-col gap-2 w-full max-w-sm">
                          <p className="text-sm font-medium text-zinc-300 truncate" title={r.origin}>{r.origin}</p>
                          <p className="text-sm font-medium text-zinc-300 truncate" title={r.destination}>{r.destination}</p>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-600 mt-2 ml-6">Vehículos: {r.vehicles.slice(0, 3).join(", ")}{r.vehicles.length > 3 ? ` +${r.vehicles.length - 3}` : ''}</p>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-white font-bold text-lg">{r.tripCount}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-zinc-300 font-mono">{formatDuration(r.averageDurationMinutes)}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getBadgeColor(r.tripTypeCategory)}`}>
                        {r.tripTypeCategory}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredRoutes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-zinc-500">
                      No se encontraron rutas con esos criterios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
