"use client";

import { useEffect, useState, useMemo } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { analyzeWeekendUsage, WeekendUsageReport } from "@/lib/weekendAnalyzer";
import { Calendar, AlertTriangle, Car, Moon, Download, Search, MapPin, Clock, ChevronRight, Printer, FileSpreadsheet, X, Presentation } from "lucide-react";
import { generateWeekendPptxReport } from "@/lib/weekendPptxGenerator";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export function FinDeSemanaPanel() {
  const { rawParsedData, weekendFilter, setWeekendFilter, weekendReport, setWeekendReport } = useFleetStore();

  const [localFrom, setLocalFrom] = useState<string>("");
  const [localTo, setLocalTo] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isGeneratingPptx, setIsGeneratingPptx] = useState(false);
  const [showPptxPreviewModal, setShowPptxPreviewModal] = useState(false);

  // Initialize dates when data loads
  useEffect(() => {
    if (rawParsedData && !weekendReport) {
      // Run once initially to get global extremes
      const report = analyzeWeekendUsage(rawParsedData, null, null);
      if (report.summary.dateRange.from) {
        setLocalFrom(report.summary.dateRange.from.split("T")[0]);
      }
      if (report.summary.dateRange.to) {
        setLocalTo(report.summary.dateRange.to.split("T")[0]);
      }
      setWeekendReport(report);
    }
  }, [rawParsedData]);

  // Ejecución Manual al clicear "Aplicar"
  const handleApplyDates = () => {
    if (!rawParsedData) return;
    const fDate = localFrom ? new Date(localFrom + "T00:00:00") : null;
    const tDate = localTo ? new Date(localTo + "T00:00:00") : null;
    
    setWeekendFilter({ from: fDate, to: tDate });
    const report = analyzeWeekendUsage(rawParsedData, fDate, tDate);
    setWeekendReport(report);
  };

  const handleExport = async () => {
    if (!weekendReport) return;
    setIsExporting(true);
    
    try {
      const resp = await fetch("/api/export/weekend-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weekendReport)
      });
      
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_Uso_Personal_${new Date().getTime()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error("Error al exportar a Excel:", error);
      alert("No se pudo generar el Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPptx = async () => {
    if (!weekendReport || filteredProfiles.length === 0) return;
    setIsGeneratingPptx(true);
    try {
      await generateWeekendPptxReport(
        filteredProfiles, 
        localFrom, 
        localTo, 
        `Top10_FinesDeSemana_${new Date().getTime()}.pptx`
      );
    } finally {
      setIsGeneratingPptx(false);
    }
  };

  if (!rawParsedData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
          <AlertTriangle className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="font-heading font-normal text-4xl text-white mt-4">Sin Datos</h2>
        <p className="text-zinc-400">Sube un archivo en el Dashboard para comenzar.</p>
      </div>
    );
  }

  // Filter profiles through the search inputs
  const filteredProfiles = useMemo(() => {
    if (!weekendReport) return [];
    
    let filtered = weekendReport.byUnit;

    if (weekendFilter.searchQuery) {
      const q = weekendFilter.searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.vehiculo.toLowerCase().includes(q) || 
        (p.matricula && p.matricula.toLowerCase().includes(q)) ||
        (p.conductor && p.conductor.toLowerCase().includes(q))
      );
    }

    if (weekendFilter.dayFilter === "saturday") {
       filtered = filtered.filter(p => p.saturdayEvents > 0).map(p => ({
         ...p,
         weekendDays: p.weekendDays.filter(wd => wd.diaNombre === "sabado"),
         sundayEvents: 0,
         totalEvents: p.saturdayEvents
       }));
    } else if (weekendFilter.dayFilter === "sunday") {
       filtered = filtered.filter(p => p.sundayEvents > 0).map(p => ({
         ...p,
         weekendDays: p.weekendDays.filter(wd => wd.diaNombre === "domingo"),
         saturdayEvents: 0,
         totalEvents: p.sundayEvents
       }));
    }

    return filtered;
  }, [weekendReport, weekendFilter.searchQuery, weekendFilter.dayFilter]);

  // Derive KPIs directly from filtered view so they are fully reactive
  const kpiData = useMemo(() => {
    if (!weekendReport) return null;
    return {
      unitsWithAlerts: filteredProfiles.length,
      totalUnits: weekendReport.summary.totalUnits,
      totalAlertEvents: filteredProfiles.reduce((sum, p) => sum + p.totalEvents, 0),
      saturdayEvents: filteredProfiles.reduce((sum, p) => sum + p.saturdayEvents, 0),
      sundayEvents: filteredProfiles.reduce((sum, p) => sum + p.sundayEvents, 0),
    };
  }, [filteredProfiles, weekendReport]);

  // Calcula datos para gráficos animados
  const chartData = useMemo(() => {
    if (filteredProfiles.length === 0) return { hourlyData: [], topInfractors: [] };

    // 1. Tendencia Horaria Absoluta
    const hourlyCounts = Array(24).fill(0);
    filteredProfiles.forEach(u => {
      u.weekendDays.forEach(wd => {
        wd.eventos.forEach(ev => {
          const hrStr = ev.hora.split(":")[0];
          const hrNum = parseInt(hrStr, 10);
          if (!isNaN(hrNum) && hrNum >= 0 && hrNum < 24) {
             hourlyCounts[hrNum]++;
          }
        });
      });
    });
    
    const hourlyData = hourlyCounts.map((count, i) => ({
       hora: `${i.toString().padStart(2, '0')}:00`,
       alertas: count
    }));

    // 2. Top Infractores (Máximo 5)
    // Extraemos su matrícula o un tramo de su vehículo para que quepa en el YAxis
    const topInfractors = [...filteredProfiles]
       .sort((a,b) => b.totalEvents - a.totalEvents)
       .slice(0, 5)
       .map(u => ({
         name: u.matricula || (u.vehiculo.length > 15 ? u.vehiculo.substring(0, 15) + "..." : u.vehiculo), 
         vehiculoId: u.matricula || u.vehiculo, // Clave maestra para poder buscarlo interactivamente
         alertas: u.totalEvents
       }));

    return { hourlyData, topInfractors };
  }, [filteredProfiles]);

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-20">
      
      {/* Botones exportar */}
      <div className="flex justify-end gap-3">
        <button 
          onClick={() => setShowPreviewModal(true)}
          disabled={isExporting}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 border border-zinc-700"
        >
          <FileSpreadsheet className="w-4 h-4 text-green-500" />
          {isExporting ? 'Generando...' : 'Vista Previa Excel'}
        </button>

        <button 
          onClick={() => setShowPptxPreviewModal(true)}
          disabled={isGeneratingPptx}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-black px-5 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 shadow-lg shadow-orange-600/20"
        >
          <Presentation className="w-4 h-4" />
          {isGeneratingPptx ? 'Generando...' : 'Vista Previa PPTX'}
        </button>
      </div>

      {/* SECCIÓN A: Filtros */}
      <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-6 sticky top-4 z-40 shadow-2xl">
        <div className="flex flex-col lg:flex-row gap-6 justify-between">
          
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Desde</label>
              <input 
                type="date" 
                value={localFrom} 
                onChange={(e) => setLocalFrom(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 w-40 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Hasta</label>
              <input 
                type="date" 
                value={localTo} 
                onChange={(e) => setLocalTo(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 w-40 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <button 
              onClick={handleApplyDates}
              className="bg-orange-600 hover:bg-orange-500 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-orange-600/20"
            >
              Aplicar
            </button>
          </div>

          <div className="flex items-end gap-3 flex-1 lg:justify-end">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Buscar unidad, placas..." 
                value={weekendFilter.searchQuery}
                onChange={(e) => setWeekendFilter({ searchQuery: e.target.value })}
                className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg pl-9 pr-3 py-2 w-full lg:w-64 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <select
              value={weekendFilter.dayFilter}
              onChange={(e) => setWeekendFilter({ dayFilter: e.target.value as any })}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">Sáb & Dom</option>
              <option value="sunday">Solo Domingos</option>
              <option value="saturday">Solo Sábados</option>
            </select>
          </div>

        </div>
      </div>

      {weekendReport && (
        <>
          {/* SECCIÓN B: KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {kpiData && [
              { label: "Unidades con Alertas", value: `${kpiData.unitsWithAlerts} / ${kpiData.totalUnits}`, icon: Car, color: "text-zinc-400", bg: "bg-[#050505] border border-zinc-800" },
              { label: "Alertas F. Horario", value: kpiData.totalAlertEvents.toLocaleString(), icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10 border border-orange-500/20" },
              { label: "Sábados detectados", value: kpiData.saturdayEvents.toLocaleString(), icon: Moon, color: "text-amber-500", bg: "bg-amber-500/10 border border-amber-500/20" },
              { label: "Domingos detectados", value: kpiData.sundayEvents.toLocaleString(), icon: Calendar, color: "text-zinc-500", bg: "bg-zinc-900 border border-zinc-800" },
            ].map((stat, i) => (
              <div key={i} className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 hover:border-orange-500/30 transition-colors">
                <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{stat.label}</p>
                  <h4 className="text-2xl font-bold text-white mt-0.5">{stat.value}</h4>
                </div>
              </div>
            ))}
          </div>

          {/* SECCIÓN B.5: ANALÍTICA Y TENDENCIAS (RECHARTS) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            
            {/* Gráfica Izquierda: Campana de Horas (AreaChart) */}
            <div className="lg:col-span-3 bg-[#050505] border border-zinc-900 rounded-2xl p-6 transition-all hover:border-orange-500/30">
               <h3 className="text-zinc-100 font-semibold mb-1 flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5 text-orange-500" />
                  Tendencia Operativa por Hora
               </h3>
               <p className="text-zinc-500 text-sm mb-6">Distribución a lo largo del día (Refleja el filtro actual)</p>
               
               <div className="h-[260px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData.hourlyData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                       <defs>
                          <linearGradient id="colorAlertas" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#ea580c" stopOpacity={0.5}/>
                             <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                          </linearGradient>
                       </defs>
                       <XAxis dataKey="hora" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                       <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                       <Tooltip 
                         cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }}
                         contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }} 
                         itemStyle={{ color: '#f97316', fontWeight: 'bold' }}
                         labelStyle={{ color: '#a1a1aa', fontWeight: 'bold', marginBottom: '4px' }}
                       />
                       <Area 
                         type="monotone" 
                         dataKey="alertas" 
                         stroke="#ea580c" 
                         strokeWidth={3}
                         fillOpacity={1} 
                         fill="url(#colorAlertas)" 
                         animationDuration={1500}
                         animationEasing="ease-out"
                       />
                    </AreaChart>
                 </ResponsiveContainer>
               </div>
            </div>

            {/* Gráfica Derecha: Top 5 Líderes (BarChart) */}
            <div className="lg:col-span-2 bg-[#050505] border border-zinc-900 rounded-2xl p-6 transition-all hover:border-orange-500/30">
               <h3 className="text-zinc-100 font-semibold mb-1 flex items-center gap-2 text-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  Top Infractores
               </h3>
               <p className="text-zinc-500 text-sm mb-6">Haz <span className="text-orange-500 font-semibold">clic</span> en la barra para desglosar la unidad.</p>
               
               <div className="h-[260px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.topInfractors} layout="vertical" margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
                       <XAxis type="number" hide />
                       <YAxis 
                         type="category" 
                         dataKey="name" 
                         stroke="#a1a1aa" 
                         fontSize={11} 
                         tickLine={false} 
                         axisLine={false} 
                         width={95}
                       />
                       <Tooltip 
                         cursor={{fill: '#27272a', opacity: 0.4}}
                         contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', borderRadius: '12px', color: '#fff' }} 
                         itemStyle={{ color: '#f97316', fontWeight: 'bold' }}
                       />
                       <Bar 
                         dataKey="alertas" 
                         fill="#ea580c" 
                         radius={[0, 6, 6, 0]} 
                         barSize={24}
                         onClick={(data: any) => {
                           if(data && data.vehiculoId) {
                             setWeekendFilter({ searchQuery: data.vehiculoId });
                             window.scrollTo({ top: 300, behavior: 'smooth' }); // Pequeño scroll hacia los KPIs
                           }
                         }}
                         animationDuration={1500}
                         animationEasing="ease-out"
                       />
                    </BarChart>
                 </ResponsiveContainer>
               </div>
            </div>
          </div>

          {/* SECCIÓN C: Accordion By Unit */}
          <div className="space-y-4">
            {filteredProfiles.map((unit, i) => (
              <details key={i} className="group bg-[#0a0a0a] border border-zinc-900 rounded-2xl overflow-hidden hover:border-orange-500/30 transition-colors [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-[#111] transition-colors list-none">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-black border border-zinc-900 flex items-center justify-center shrink-0">
                      <Car className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-zinc-100 font-semibold">{unit.vehiculo}</h3>
                      <p className="text-zinc-500 text-sm">
                        {unit.matricula} • {unit.conductor || "Sin conductor"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm font-mono text-zinc-500">
                    <span className="bg-[#050505] text-zinc-400 border border-zinc-800 px-2 py-1 rounded">Dom: {unit.sundayEvents}</span>
                    <span className="bg-[#050505] text-zinc-400 border border-zinc-800 px-2 py-1 rounded">Sáb: {unit.saturdayEvents}</span>
                    <ChevronRight className="w-5 h-5 group-open:rotate-90 transition-transform" />
                  </div>
                </summary>

                <div className="border-t border-zinc-900 bg-black p-6 flex flex-col lg:flex-row gap-8">
                  
                  {/* Rutas (Izquierda - 40%) */}
                  <div className="lg:w-2/5">
                    <h4 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
                       <MapPin className="w-4 h-4" />
                       Rutas Más Frecuentadas
                    </h4>
                    <div className="space-y-3">
                      {unit.topRoutes.map((route, ri) => (
                        <div key={ri} className="bg-[#0a0a0a] border border-zinc-900 p-3 rounded-xl flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-zinc-300 text-sm font-medium truncate" title={route.direccion}>
                              {route.direccion}
                            </p>
                            <p className="text-zinc-500 text-xs mt-1">Horario típico: {Math.min(...route.hours)}:00 - {Math.max(...route.hours)}:59</p>
                          </div>
                          <div className="shrink-0 text-center bg-black border border-orange-900/30 rounded-lg px-2 py-1">
                            <span className="block text-lg font-bold text-orange-500 leading-none">{route.count}</span>
                            <span className="block text-[10px] text-zinc-600 uppercase mt-1">Veces</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cronología (Derecha - 60%) */}
                  <div className="lg:w-3/5">
                    <h4 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
                       <Clock className="w-4 h-4" />
                       Cronología de Eventos
                    </h4>
                    <div className="space-y-6">
                      {unit.weekendDays.map((wd, di) => {
                        const isDom = wd.diaNombre === "domingo";
                        const labelBg = "bg-[#0a0a0a] text-zinc-400 border-zinc-800";
                        const labelTxt = isDom ? "DOM" : "SÁB";

                        return (
                          <div key={di} className="relative pl-4 border-l border-orange-900/40">
                             <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-orange-500"></div>
                             <div className="flex items-center gap-2 mb-3">
                               <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${labelBg}`}>
                                 {labelTxt}
                               </span>
                               <span className="text-zinc-300 text-sm font-semibold">{wd.fecha}</span>
                               <span className="text-zinc-600 text-xs">— {wd.conductor || "Desconocido"}</span>
                             </div>

                             <div className="space-y-2">
                               {wd.eventos.map((ev, ei) => (
                                 <div key={ei} className="flex items-start gap-4 text-sm group/ev hover:bg-zinc-900/50 p-1.5 rounded-lg -ml-1.5 transition-colors">
                                    <span className="text-zinc-500 font-mono shrink-0 w-12 text-right">{ev.hora}</span>
                                    <span className="text-zinc-300 relative">
                                      {ev.direccion}
                                    </span>
                                 </div>
                               ))}
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </details>
            ))}
            {filteredProfiles.length === 0 && (
              <div className="text-center py-12 border border-zinc-800/50 rounded-2xl bg-zinc-900/20">
                <p className="text-zinc-500">No se encontraron unidades con estos filtros.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL PRINT PREVIEW GERENCIAL */}
      {showPreviewModal && weekendReport && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-100 w-full max-w-5xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-zinc-900 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Printer className="w-5 h-5 text-zinc-400" />
                Vista Previa del Documento Gerencial
              </h3>
              <button onClick={() => setShowPreviewModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* A4 Paper Container */}
            <div className="p-8 overflow-y-auto bg-zinc-200 flex-1 flex justify-center">
              <div className="bg-white w-full max-w-4xl min-h-[1056px] shadow-lg p-12 text-black font-sans relative">
                
                {/* A4 Header */}
                <div className="border-b-2 border-blue-900 pb-4 mb-8">
                  <h1 className="text-2xl font-bold text-blue-900 uppercase tracking-wide">Reporte Ejecutivo de Uso de Vehículos</h1>
                  <p className="text-sm text-gray-500 mt-1">Generado en Santo Grial Fleet Analytics • {new Date().toLocaleDateString()}</p>
                </div>

                {/* A4 Executive Summary */}
                <div className="grid grid-cols-4 gap-4 mb-10">
                  <div className="bg-gray-50 p-4 rounded border border-gray-200">
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Unidades Alertadas</p>
                    <p className="text-2xl font-bold text-gray-900">{weekendReport.summary.unitsWithAlerts}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded border border-gray-200">
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Total Movimientos</p>
                    <p className="text-2xl font-bold text-blue-600">{weekendReport.summary.totalAlertEvents}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded border border-gray-200">
                     <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Alertas Domingo</p>
                    <p className="text-2xl font-bold text-red-600">{weekendReport.summary.sundayEvents}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded border border-gray-200">
                     <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Alertas Sábado</p>
                    <p className="text-2xl font-bold text-amber-600">{weekendReport.summary.saturdayEvents}</p>
                  </div>
                </div>

                {/* A4 Table */}
                <h2 className="text-sm uppercase font-bold text-gray-900 mb-4 tracking-wider">Top Unidades con Mayor Incidencia</h2>
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-blue-900 text-white">
                      <th className="p-3 border border-blue-800 w-1/3">Unidad / Conductor</th>
                      <th className="p-3 border border-blue-800 text-center w-1/4">Gravedad de Abuso</th>
                      <th className="p-3 border border-blue-800">Foco Principal (Dirección)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.slice(0, 15).map((u, i) => {
                       const maxAlerts = filteredProfiles[0]?.totalEvents || 1;
                       const pct = Math.min(100, Math.max(5, (u.totalEvents / maxAlerts) * 100));
                       return (
                        <tr key={i} className="border-b border-gray-200">
                          <td className="p-3">
                            <span className="font-semibold block">{u.matricula || u.vehiculo}</span>
                            <span className="text-xs text-gray-500">{u.conductor}</span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold w-6 text-right">{u.totalEvents}</span>
                              <div className="w-full bg-gray-100 h-3 flex overflow-hidden rounded-sm">
                                <div className="bg-blue-500 h-full" style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-xs text-gray-600" title={u.topRoutes[0]?.direccion}>
                            {u.topRoutes[0]?.direccion || "N/A"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredProfiles.length > 15 && (
                  <p className="text-xs text-gray-400 mt-3 italic">* Mostrando el Top 15 de reincidentes. El documento Excel completo incluirá las {filteredProfiles.length} unidades y el desglose de fechas.</p>
                )}

              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-zinc-900 border-t border-zinc-800 p-5 flex justify-end gap-4 shrink-0">
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="px-5 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cerrar Vista Previa
              </button>
              <button 
                onClick={() => {
                  setShowPreviewModal(false);
                  handleExport();
                }}
                disabled={isExporting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all"
              >
                <FileSpreadsheet className="w-5 h-5" />
                Descargar Documento Maestro (.xlsx)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISTA PREVIA PPTX FLOTANTE */}
      {showPptxPreviewModal && weekendReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#050505]">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Presentation className="w-5 h-5 text-orange-500" /> Vista Previa del PPTX (Top 10 Fines de Semana)
                </h3>
                <p className="text-xs text-zinc-500">Muestra aproximada de cómo se verán las diapositivas generadas (Formato 16:9).</p>
              </div>
              <button 
                onClick={() => setShowPptxPreviewModal(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body - Canvas de PPTX */}
            <div className="flex-1 overflow-auto p-8 bg-zinc-950 flex flex-col items-center gap-12 custom-scrollbar">
              
              {/* SLIDE 1: PORTADA */}
              <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col items-center justify-center border border-zinc-200 shrink-0">
                <div className="absolute top-2 left-0 w-full h-1 bg-[#C00000]"></div>
                <h1 className="text-4xl font-bold text-[#19426B] font-['Verdana'] mb-4 text-center">Hallazgos – Uso en Fines de Semana</h1>
                <p className="text-2xl text-[#595959] font-['Verdana'] mb-2">Período Evaluado: {(localFrom && localTo) ? `${localFrom} al ${localTo}` : "Histórico completo"}</p>
                <p className="text-lg text-[#C00000] font-['Verdana'] font-bold">Top 10 Usuarios de Mayor Riesgo</p>
                <div className="absolute bottom-2 left-4 text-[10px] text-[#595959]">Reporte generado por AnalyticsGPS - {new Date().toLocaleDateString()}</div>
                <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 1</div>
              </div>

              {/* SLIDE 2: TOP 10 USUARIOS */}
              <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                <div className="absolute top-2 left-0 w-full h-1 bg-[#C00000]"></div>
                <h2 className="text-3xl font-bold text-[#19426B] font-['Verdana'] mb-4">Top 10: Usuarios Fines de Semana</h2>
                
                <table className="w-full text-left text-[11px] border-collapse mt-2">
                  <thead>
                    <tr className="bg-[#19426B] text-white">
                      <th className="p-2 border border-[#BFBFBF] text-center">Posición</th>
                      <th className="p-2 border border-[#BFBFBF]">Vehículo / Matrícula</th>
                      <th className="p-2 border border-[#BFBFBF]">Conductor</th>
                      <th className="p-2 border border-[#BFBFBF] bg-[#C00000] text-center">Eventos Fin de Semana</th>
                      <th className="p-2 border border-[#BFBFBF]">Ubicación Principal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.slice(0, 10).map((u, i) => (
                      <tr key={i}>
                        <td className="p-2 border border-[#BFBFBF] text-black text-center font-bold">#{i + 1}</td>
                        <td className="p-2 border border-[#BFBFBF] text-black">{u.vehiculo} <br/><span className="text-zinc-500 text-[9px]">{u.matricula}</span></td>
                        <td className="p-2 border border-[#BFBFBF] text-black">{u.conductor}</td>
                        <td className="p-2 border border-[#BFBFBF] text-[#C00000] text-center font-bold">{u.totalEvents}</td>
                        <td className="p-2 border border-[#BFBFBF] text-black truncate max-w-[200px]">{u.topRoutes[0]?.direccion || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                <div className="absolute inset-0 bg-white/30 flex items-center justify-center backdrop-blur-[1px] pointer-events-none">
                  <span className="bg-[#19426B] text-white px-4 py-2 rounded-full font-bold shadow-lg text-sm">El archivo final además generará 1 hoja de detalle para cada usuario del Top 3</span>
                </div>

                <div className="absolute bottom-2 left-4 text-[10px] text-[#595959]">Reporte generado por AnalyticsGPS - {new Date().toLocaleDateString()}</div>
                <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 2</div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3 bg-[#050505]">
              <button 
                onClick={() => setShowPptxPreviewModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={() => {
                  setShowPptxPreviewModal(false);
                  handleExportPptx();
                }}
                className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-orange-900/20"
              >
                <Presentation className="w-4 h-4" /> Exportar a PPTX Ahora
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
