"use client";

import { useEffect, useMemo, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { profileStops, StopProfile, StopClassification } from "@/lib/stopProfiler";
import { useStopClassifications } from "@/hooks/useStopClassifications";
import { MapPin, AlertTriangle, Car, Clock, Search, ChevronDown, Home, ShoppingBag, CheckCircle, HelpCircle, Thermometer, Users } from "lucide-react";
import dynamic from "next/dynamic";

// Leaflet debe cargarse solo en cliente (SSR incompatible)
const StopMiniMap = dynamic(() => import("./StopMiniMap"), { ssr: false });

const CLASSIFICATION_OPTIONS: { value: StopClassification; label: string; icon: typeof Home; color: string }[] = [
  { value: "pernocta", label: "Pernocta 🏠", icon: Home, color: "text-red-500" },
  { value: "personal", label: "Personal 🏪", icon: ShoppingBag, color: "text-amber-500" },
  { value: "operativa", label: "Operativa ✅", icon: CheckCircle, color: "text-green-500" },
  { value: "sin_clasificar", label: "Sin Clasificar", icon: HelpCircle, color: "text-zinc-500" },
];

function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0 && m === 0) return "< 1m";
  return `${h}h ${m}m`;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-amber-500" : "bg-green-500";
  const glow = score >= 70 ? "shadow-red-500/30" : score >= 40 ? "shadow-amber-500/30" : "shadow-green-500/30";
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} ${glow} shadow-lg transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-mono font-bold ${score >= 70 ? "text-red-500" : score >= 40 ? "text-amber-500" : "text-green-500"}`}>
        {score}
      </span>
    </div>
  );
}

export function ParadasPanel() {
  const { rawParsedData, stopReport, setStopReport } = useFleetStore();
  const { classify, getClassification, classifiedCount } = useStopClassifications();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedStop, setExpandedStop] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "high" | "medium" | "low" | "classified" | "unclassified">("all");

  // Procesar automáticamente cuando haya datos
  useEffect(() => {
    if (rawParsedData && !stopReport) {
      const report = profileStops(rawParsedData);
      setStopReport(report);
    }
  }, [rawParsedData, stopReport, setStopReport]);

  // Filtrado reactivo
  const filteredStops = useMemo(() => {
    if (!stopReport) return [];
    let stops = stopReport.stops;

    // Filtro por búsqueda
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      stops = stops.filter(s =>
        s.address.toLowerCase().includes(q) ||
        s.uniqueVehicles.some(v => v.toLowerCase().includes(q)) ||
        s.uniqueConductors.some(c => c.toLowerCase().includes(q)) ||
        s.geocerca.toLowerCase().includes(q)
      );
    }

    // Filtro por tipo
    if (filterType === "high") stops = stops.filter(s => s.suspicionScore >= 70);
    else if (filterType === "medium") stops = stops.filter(s => s.suspicionScore >= 40 && s.suspicionScore < 70);
    else if (filterType === "low") stops = stops.filter(s => s.suspicionScore < 40);
    else if (filterType === "classified") stops = stops.filter(s => getClassification(s.addressKey) !== "sin_clasificar");
    else if (filterType === "unclassified") stops = stops.filter(s => getClassification(s.addressKey) === "sin_clasificar");

    return stops;
  }, [stopReport, searchQuery, filterType, getClassification]);

  // Sugerencias de autocompletado para el buscador
  const searchSuggestions = useMemo(() => {
    if (!stopReport) return [];
    const suggestions = new Set<string>();
    for (const stop of stopReport.stops) {
      for (const v of stop.uniqueVehicles) suggestions.add(v);
      for (const c of stop.uniqueConductors) suggestions.add(c);
      if (stop.geocerca) suggestions.add(stop.geocerca);
    }
    return Array.from(suggestions).sort();
  }, [stopReport]);

  // Estado vacío
  if (!rawParsedData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center border border-zinc-800">
          <MapPin className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="font-heading font-normal text-4xl text-white mt-4">Sin Datos</h2>
        <p className="text-zinc-400">Sube un archivo en el Dashboard para comenzar.</p>
      </div>
    );
  }

  if (!stopReport) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400">Escaneando paradas...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-20">

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { label: "Paradas Únicas", value: stopReport.totalUniqueStops.toLocaleString(), icon: MapPin, color: "text-zinc-400" },
          { label: "Alta Sospecha", value: stopReport.highSuspicion.toLocaleString(), icon: Thermometer, color: "text-red-500" },
          { label: "Sospecha Media", value: stopReport.mediumSuspicion.toLocaleString(), icon: AlertTriangle, color: "text-amber-500" },
          { label: "Ya Clasificadas", value: classifiedCount.toLocaleString(), icon: CheckCircle, color: "text-orange-500" },
          { label: "Vehículos Involucrados", value: stopReport.totalVehiclesInvolved.toLocaleString(), icon: Users, color: "text-zinc-400" },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-4 flex items-center gap-3 hover:border-orange-500/30 transition-colors">
            <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-[#050505] border border-zinc-800">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{stat.label}</p>
              <h4 className="text-xl font-bold text-white">{stat.value}</h4>
            </div>
          </div>
        ))}
      </div>

      {/* Datalist de sugerencias */}
      <datalist id="paradas-search-list">
        {searchSuggestions.map(s => <option key={s} value={s} />)}
      </datalist>

      {/* FILTROS */}
      <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-end">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            list="paradas-search-list"
            placeholder="Buscar dirección, vehículo, conductor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111] border border-zinc-800 text-zinc-200 text-sm rounded-lg pl-9 pr-3 py-2.5 focus:ring-1 focus:ring-orange-500 focus:outline-none"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="bg-[#111] border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-orange-500 focus:outline-none"
        >
          <option value="all">Todas las paradas</option>
          <option value="high">🔴 Alta Sospecha (≥70)</option>
          <option value="medium">🟡 Media (40-69)</option>
          <option value="low">🟢 Baja (&lt;40)</option>
          <option value="classified">✅ Ya Clasificadas</option>
          <option value="unclassified">⚠️ Sin Clasificar</option>
        </select>
        <div className="text-xs text-zinc-500">
          {filteredStops.length} resultados
        </div>
      </div>

      {/* TABLA DE PARADAS */}
      <div className="space-y-3">
        {filteredStops.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            No se encontraron paradas con los filtros aplicados.
          </div>
        )}

        {filteredStops.slice(0, 50).map((stop) => {
          const isExpanded = expandedStop === stop.addressKey;
          const currentClass = getClassification(stop.addressKey);
          const classOption = CLASSIFICATION_OPTIONS.find(o => o.value === currentClass);

          return (
            <div key={stop.addressKey} className={`rounded-2xl border bg-[#0a0a0a] overflow-hidden transition-colors ${isExpanded ? "border-orange-500/50" : "border-zinc-900 hover:border-orange-500/30"}`}>
              {/* Fila principal */}
              <div
                className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-5 gap-4 cursor-pointer hover:bg-[#111] transition-colors"
                onClick={() => setExpandedStop(isExpanded ? null : stop.addressKey)}
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border ${
                    stop.suspicionScore >= 70 ? "bg-red-500/10 border-red-500/20" :
                    stop.suspicionScore >= 40 ? "bg-amber-500/10 border-amber-500/20" :
                    "bg-[#050505] border-zinc-800"
                  }`}>
                    <MapPin className={`w-5 h-5 ${
                      stop.suspicionScore >= 70 ? "text-red-500" :
                      stop.suspicionScore >= 40 ? "text-amber-500" :
                      "text-green-500"
                    }`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-zinc-200 text-sm font-medium truncate" title={stop.address}>
                      {stop.address}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {stop.geocerca && (
                        <span className="text-[10px] bg-[#050505] text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded">{stop.geocerca}</span>
                      )}
                      <span className="text-[10px] text-zinc-500">{stop.totalVisits} visitas</span>
                      <span className="text-[10px] text-zinc-500">•</span>
                      <span className="text-[10px] text-zinc-500">{stop.uniqueVehicles.length} vehículo{stop.uniqueVehicles.length !== 1 ? "s" : ""}</span>
                      <span className="text-[10px] text-zinc-500">•</span>
                      <span className="text-[10px] text-zinc-500">Prom: {formatSeconds(stop.avgParkedSeconds)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <ScoreBar score={stop.suspicionScore} />

                  {/* Selector de clasificación */}
                  <select
                    value={currentClass}
                    onChange={(e) => {
                      e.stopPropagation();
                      classify(stop.addressKey, e.target.value as StopClassification);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={`text-xs font-medium rounded-lg px-3 py-2 border bg-[#050505] focus:outline-none focus:ring-1 focus:ring-orange-500 ${
                      currentClass === "pernocta" ? "border-red-500/30 text-red-400" :
                      currentClass === "personal" ? "border-amber-500/30 text-amber-400" :
                      currentClass === "operativa" ? "border-green-500/30 text-green-400" :
                      "border-zinc-800 text-zinc-400"
                    }`}
                  >
                    {CLASSIFICATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  <ChevronDown className={`w-5 h-5 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </div>

              {/* Panel expandido: Minimapa + Detalles */}
              {isExpanded && (
                <div className="border-t border-zinc-900 bg-black p-6 animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Minimapa (3 columnas) */}
                    <div className="lg:col-span-3 rounded-xl overflow-hidden border border-zinc-800" style={{ height: 280 }}>
                      <StopMiniMap lat={stop.lat} lng={stop.lng} address={stop.address} />
                    </div>

                    {/* Info panel (2 columnas) */}
                    <div className="lg:col-span-2 space-y-4">
                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#0a0a0a] border border-zinc-900 rounded-xl p-3">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Visitas Nocturnas</p>
                          <p className="text-lg font-bold text-red-400">{stop.nightVisits}</p>
                        </div>
                        <div className="bg-[#0a0a0a] border border-zinc-900 rounded-xl p-3">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Fin de Semana</p>
                          <p className="text-lg font-bold text-amber-400">{stop.weekendVisits}</p>
                        </div>
                        <div className="bg-[#0a0a0a] border border-zinc-900 rounded-xl p-3">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Primera Vez</p>
                          <p className="text-sm font-mono text-zinc-300">{stop.firstSeen}</p>
                        </div>
                        <div className="bg-[#0a0a0a] border border-zinc-900 rounded-xl p-3">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Última Vez</p>
                          <p className="text-sm font-mono text-zinc-300">{stop.lastSeen}</p>
                        </div>
                      </div>

                      {/* Vehículos que visitan */}
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Vehículos</p>
                        <div className="flex flex-wrap gap-2">
                          {stop.uniqueVehicles.map(v => (
                            <span key={v} className="text-xs bg-[#111] text-orange-400 border border-orange-500/20 px-2 py-1 rounded font-mono">
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Conductores */}
                      {stop.uniqueConductors.length > 0 && (
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Conductores</p>
                          <div className="flex flex-wrap gap-2">
                            {stop.uniqueConductors.map(c => (
                              <span key={c} className="text-xs bg-[#111] text-zinc-300 border border-zinc-800 px-2 py-1 rounded">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timeline de visitas */}
                  <div className="mt-6">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      Últimas {Math.min(stop.visits.length, 15)} visitas
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-zinc-900">
                      <table className="w-full text-xs text-left">
                        <thead className="text-zinc-500 bg-[#0a0a0a] border-b border-zinc-900">
                          <tr>
                            <th className="px-4 py-3 font-medium uppercase tracking-widest">Fecha</th>
                            <th className="px-4 py-3 font-medium uppercase tracking-widest">Hora</th>
                            <th className="px-4 py-3 font-medium uppercase tracking-widest">Vehículo</th>
                            <th className="px-4 py-3 font-medium uppercase tracking-widest">Conductor</th>
                            <th className="px-4 py-3 font-medium uppercase tracking-widest">T. Aparcado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                          {stop.visits.slice(0, 15).map((visit, vi) => (
                            <tr key={vi} className="hover:bg-zinc-900 transition-colors text-zinc-300">
                              <td className="px-4 py-2.5 font-mono">{visit.fecha}</td>
                              <td className="px-4 py-2.5 font-mono">{visit.hora}</td>
                              <td className="px-4 py-2.5">{visit.matricula || visit.vehiculo}</td>
                              <td className="px-4 py-2.5 text-zinc-400">{visit.conductor}</td>
                              <td className="px-4 py-2.5 font-mono text-orange-400">{formatSeconds(visit.tiempoAparcadoSecs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Botones grandes de clasificación */}
                  <div className="mt-6 flex flex-wrap gap-3">
                    {CLASSIFICATION_OPTIONS.filter(o => o.value !== "sin_clasificar").map(opt => {
                      const isActive = currentClass === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => classify(stop.addressKey, opt.value)}
                          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all border ${
                            isActive
                              ? opt.value === "pernocta" ? "bg-red-500/10 border-red-500/30 text-red-400"
                                : opt.value === "personal" ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                : "bg-green-500/10 border-green-500/30 text-green-400"
                              : "bg-[#0a0a0a] border-zinc-800 text-zinc-400 hover:border-orange-500/30 hover:text-zinc-200"
                          }`}
                        >
                          <opt.icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredStops.length > 50 && (
          <div className="text-center py-6 text-zinc-500 text-sm">
            Mostrando 50 de {filteredStops.length} paradas. Usa el buscador para refinar.
          </div>
        )}
      </div>
    </div>
  );
}
