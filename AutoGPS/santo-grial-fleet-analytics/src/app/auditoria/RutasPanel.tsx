"use client";

import { useMemo, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { AlertTriangle, MapPin, Navigation, Flag } from "lucide-react";
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface RouteAggregation {
  routeKey: string;
  origin: string;
  destination: string;
  tripCount: number;
  averageDurationMinutes: number;
  tripTypeCategory: "Micro" | "Corto" | "Medio" | "Largo";
  vehicles: string[];
}

export function RutasPanel() {
  const { rawParsedData } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDay, setFilterDay] = useState<"weekend" | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  const stats = useMemo(() => {
    if (!rawParsedData) return null;

    // 1. Acondicionar datos y ordenar para el Origen
    const processableRows = rawParsedData.map(row => {
      const getField = (keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
          if (match && row[match]) return row[match].trim();
        }
        return "";
      };
      const fecha = getField(["fecha", "date"]);
      const horaStr = getField(["hora"]);
      const vehiculo = getField(["vehiculo", "vehículo", "matricula"]);
      const timestamp = new Date(`${fecha} ${horaStr}`).getTime() || 0;
      return { row, getField, fecha, vehiculo, timestamp };
    }).sort((a, b) => a.timestamp - b.timestamp);

    const vehicleOrigins: Record<string, string> = {};
    const routeMap = new Map<string, any>();
    
    let micro = 0, short = 0, medium = 0, long = 0;
    let totalTripsCount = 0;

    processableRows.forEach(({ getField, fecha, vehiculo }) => {
      const distStr = getField(["distancia (km)", "distancia", "km"]);
      const velStr = getField(["velocidad media", "vel. media", "vel media", "velocidad prom"]);
      const lugar = getField(["lugar", "direccion", "dirección"]);
      
      const origin = vehicleOrigins[vehiculo] || "Punto de Partida (Desconocido)";
      
      let dayOfWeek = -1;
      const parsedDate = new Date(fecha);
      if (!isNaN(parsedDate.getTime())) dayOfWeek = parsedDate.getUTCDay();

      let isIncluded = true;
      if (filterDay === "weekend" && dayOfWeek !== 0 && dayOfWeek !== 6) {
         isIncluded = false;
      }

      if (isIncluded) {
        const dist = parseFloat(distStr);
        if (!isNaN(dist) && dist > 0) {
          let vel = parseFloat(velStr);
          if (isNaN(vel) || vel <= 0) vel = 25; // Velocidad promedio asumida si no existe en la celda
          
          const durationMins = Math.round((dist / vel) * 60);
          const category = durationMins < 10 ? "Micro" : durationMins <= 30 ? "Corto" : durationMins <= 60 ? "Medio" : "Largo";

          const routeKey = `${origin} -> ${lugar}`;
          if (!routeMap.has(routeKey)) {
            routeMap.set(routeKey, {
               routeKey,
               origin,
               destination: lugar,
               tripCount: 0,
               durationsArr: [],
               vehicles: new Set<string>()
            });
          }
          
          const agg = routeMap.get(routeKey)!;
          agg.tripCount++;
          agg.durationsArr.push(durationMins);
          if (vehiculo) agg.vehicles.add(vehiculo);

          totalTripsCount++;
          if (category === "Micro") micro++;
          else if (category === "Corto") short++;
          else if (category === "Medio") medium++;
          else long++;
        }
      }
      
      // Actualizar el origen para el próximo viaje del mismo vehículo
      if (lugar) {
         vehicleOrigins[vehiculo] = lugar;
      }
    });

    // 2. Colapsar arreglos, calcular medianas y ordenar
    const aggregatedRoutes: RouteAggregation[] = Array.from(routeMap.values()).map(agg => {
      const arr = agg.durationsArr.sort((a: number, b: number) => a - b);
      const mid = Math.floor(arr.length / 2);
      const median = arr.length % 2 !== 0 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
      
      const cat = median < 10 ? "Micro" : median <= 30 ? "Corto" : median <= 60 ? "Medio" : "Largo";
      
      return {
        routeKey: agg.routeKey,
        origin: agg.origin,
        destination: agg.destination,
        tripCount: agg.tripCount,
        averageDurationMinutes: median,
        tripTypeCategory: cat,
        vehicles: Array.from(agg.vehicles) as string[]
      };
    }).sort((a, b) => b.tripCount - a.tripCount);

    return {
      routes: aggregatedRoutes,
      kpis: {
         totalTrips: totalTripsCount,
         micro, short, medium, long,
         mostFrequentRoute: aggregatedRoutes.length > 0 ? aggregatedRoutes[0].routeKey : "Sin Datos"
      }
    };
  }, [rawParsedData, filterDay]);

  if (!rawParsedData || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
          <Navigation className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="font-heading text-4xl text-white mt-4">Sin Datos</h2>
        <p className="text-zinc-400">Carga un reporte y selecciona un mes en el Time Machine para analizar rutas.</p>
      </div>
    );
  }

  // KPIs
  const { kpis, routes } = stats;

  // Filtrado de rutas según barra de búsqueda y categoría
  const filteredRoutes = routes.filter(r => {
    const matchesSearch = r.routeKey.toLowerCase().includes(searchTerm.toLowerCase()) || r.vehicles.some(v => v.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === "All" || r.tripTypeCategory === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const pieData = [
    { name: "Micro (< 10m)", value: kpis.micro, color: "#10b981" },
    { name: "Corto (10-30m)", value: kpis.short, color: "#3b82f6" },
    { name: "Medio (30-60m)", value: kpis.medium, color: "#f59e0b" },
    { name: "Largo (> 60m)", value: kpis.long, color: "#ef4444" },
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
            <p className="text-sm text-zinc-500 font-medium">Viajes Analizados</p>
            <p className="text-2xl font-bold text-white">{kpis.totalTrips.toLocaleString()}</p>
          </div>
        </div>
        
        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 hover:border-red-500/30 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-500 font-medium">Rutas Largas ({">"}1hr)</p>
            <p className="text-2xl font-bold text-white">{kpis.long.toLocaleString()}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 md:col-span-2 hover:border-zinc-700 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-zinc-900 border border-zinc-800">
            <MapPin className="w-6 h-6 text-zinc-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-zinc-500 font-medium">Trayecto más repetido</p>
            <p className="text-lg font-bold text-white truncate" title={kpis.mostFrequentRoute}>{kpis.mostFrequentRoute}</p>
          </div>
        </div>
      </div>

      {/* SECCIÓN B: Gráficas de Categorización */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-white mb-6">Tiempos Reales de Conducción</h3>
          <div className="h-[250px]">
            {pieData.length > 0 ? (
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
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-sm">No hay datos</div>
            )}
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
                <option value="all">Toda la Semana</option>
                <option value="weekend">Solo Fines de Semana</option>
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
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">T. Conducción</th>
                  <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Categoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredRoutes.slice(0, 100).map((r, i) => (
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
