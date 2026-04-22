"use client";

import { useState, useMemo, useEffect } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { extractFilterOptions, buildReportData, ReportConfig, ReportData } from "@/lib/reportDataEngine";
import { injectValidatedHouses } from "@/lib/geofenceEngine";
import { generateExcelReport } from "@/lib/excelReportGenerator";
import { generatePptxReport } from "@/lib/pptxReportGenerator";
import { generateFinalMarkdownReport } from "@/lib/finalReportGenerator";
import { Printer, FileSpreadsheet, Presentation, Calendar, Car, MapPin, CheckCircle2, ChevronRight, Activity, FileText, Copy, X, ShieldCheck, Home, Users, Check, Building2, Trash2 } from "lucide-react";
import { detectPernoctas, DetectedHouse } from "@/lib/houseCensusEngine";
import dynamic from "next/dynamic";

const DynamicMap = dynamic(() => import("./CensusMap"), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-zinc-900 animate-pulse flex items-center justify-center text-zinc-500">Cargando mapa interactivo...</div>
});

export function ReportesPanel() {
  const { rawParsedData } = useFleetStore();
  const [detectedHouses, setDetectedHouses] = useState<DetectedHouse[]>([]);
  const [showCensus, setShowCensus] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHouse, setSelectedHouse] = useState<DetectedHouse | null>(null);

  // MEMORIA FORENSE: Cargar validaciones previas
  useEffect(() => {
    const saved = localStorage.getItem("santo_grial_census_v2");
    if (saved && detectedHouses.length > 0) {
      const savedData = JSON.parse(saved);
      setDetectedHouses(prev => prev.map(h => {
        const stored = savedData[h.id];
        if (stored) {
          return { ...h, confirmada: stored.confirmada, tipo: stored.tipo, descartada: stored.descartada };
        }
        return h;
      }));
    }
  }, [showCensus]);

  // Guardar cambios automáticamente
  const saveCensusProgress = (updated: DetectedHouse[]) => {
    const dataToSave = updated.reduce((acc: any, h) => {
      acc[h.id] = { confirmada: h.confirmada, tipo: h.tipo, descartada: h.descartada };
      return acc;
    }, {});
    localStorage.setItem("santo_grial_census_v2", JSON.stringify(dataToSave));
  };

  // Ejecutar censo al abrir
  const handleRunCensus = () => {
    if (rawParsedData) {
      let houses = detectPernoctas(rawParsedData);
      
      // Combinar con lo guardado en memoria
      const saved = localStorage.getItem("santo_grial_census_v2");
      if (saved) {
        const savedData = JSON.parse(saved);
        houses = houses.map(h => {
          const stored = savedData[h.id];
          return stored ? { ...h, confirmada: stored.confirmada, tipo: stored.tipo, descartada: stored.descartada } : h;
        });
      }

      setDetectedHouses(houses);
      setShowCensus(true);
      if (houses.length > 0) setSelectedHouse(houses[0]);
    }
  };

  const toggleConfirm = (id: string) => {
    setDetectedHouses(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, confirmada: !h.confirmada } : h);
      saveCensusProgress(updated);
      return updated;
    });
  };

  const toggleDiscard = (id: string) => {
    setDetectedHouses(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, descartada: !h.descartada } : h);
      saveCensusProgress(updated);
      return updated;
    });
  };

  const changeType = (id: string, type: any) => {
    setDetectedHouses(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, tipo: type } : h);
      saveCensusProgress(updated);
      return updated;
    });
  };

  const filteredHouses = detectedHouses.filter(h => 
    !h.descartada && (
      h.direccion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.unitStats.some(u => u.unit.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  const [config, setConfig] = useState<ReportConfig>({
    includeWeekend: true,
    includeStops: true,
    includeVehicles: false,
    includeScanner: false,
    scannerQuery: "",
    dateFrom: "",
    dateTo: "",
    selectedVehicles: [],
    selectedLocations: []
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [showPptxModal, setShowPptxModal] = useState(false);
  const [showMarkdownModal, setShowMarkdownModal] = useState(false);
  const [markdownText, setMarkdownText] = useState("");
  const [copied, setCopied] = useState(false);
  const [previewData, setPreviewData] = useState<ReportData | null>(null);

  // Extraer opciones únicas del CSV crudo para los filtros
  const options = useMemo(() => {
    if (!rawParsedData || rawParsedData.length === 0) return null;
    return extractFilterOptions(rawParsedData);
  }, [rawParsedData]);

  // Si no hay datos (CSV vacío), mostrar placeholder
  if (!rawParsedData || rawParsedData.length === 0) {
    return (
      <div className="bg-[#050505] rounded-2xl border border-zinc-800 p-10 text-center flex flex-col items-center">
        <Activity className="w-16 h-16 text-zinc-800 mb-4" />
        <h3 className="text-xl font-semibold text-zinc-300">No hay telemetría cargada</h3>
        <p className="text-zinc-500 mt-2">Ve al Dashboard y sube un archivo CSV para generar reportes.</p>
      </div>
    );
  }

  // Pre-calcular vista previa (ahora async por el motor de geocercas)
  useEffect(() => {
    if (!options || !rawParsedData) {
      setPreviewData(null);
      return;
    }
    let cancelled = false;
    buildReportData(rawParsedData, {
      ...config,
      dateFrom: config.dateFrom || options.minDate,
      dateTo: config.dateTo || options.maxDate
    }).then(data => {
      // Inyectar casas validadas al motor antes de refrescar la vista previa
      if (detectedHouses.length > 0) {
        injectValidatedHouses(detectedHouses);
      }
      if (!cancelled) setPreviewData(data);
    });
    return () => { cancelled = true; };
  }, [rawParsedData, config, options]);

  const handleExportPptx = async () => {
    if (!previewData) return;
    setIsGenerating(true);
    try {
      await generatePptxReport(previewData, `Reporte_Ejecutivo_${new Date().getTime()}.pptx`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMarkdown = async () => {
    if (!rawParsedData) return;
    setIsGenerating(true);
    try {
      const text = await generateFinalMarkdownReport(rawParsedData);
      setMarkdownText(text);
      setShowMarkdownModal(true);
      setCopied(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(markdownText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFilter = (type: 'vehicles' | 'locations', value: string) => {
    setConfig(prev => {
      const arr = prev[type === 'vehicles' ? 'selectedVehicles' : 'selectedLocations'];
      if (arr.includes(value)) {
        return { ...prev, [type === 'vehicles' ? 'selectedVehicles' : 'selectedLocations']: arr.filter(v => v !== value) };
      } else {
        return { ...prev, [type === 'vehicles' ? 'selectedVehicles' : 'selectedLocations']: [...arr, value] };
      }
    });
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* ASISTENTE DE CENSO 2.0 */}
      <div className="bg-gradient-to-br from-[#050505] to-black border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck className="w-7 h-7 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Asistente de Censo v2.0</h2>
              <p className="text-xs text-zinc-500">Filtrado riguroso: Solo paradas nocturnas recurrentes.</p>
            </div>
          </div>
          {!showCensus ? (
            <button 
              onClick={handleRunCensus}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-emerald-900/20"
            >
              Escanear Pernoctas
            </button>
          ) : (
            <div className="flex items-center gap-4">
               <div className="relative">
                 <input 
                   type="text" 
                   placeholder="Buscar unidad o placas..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="bg-black border border-zinc-800 rounded-lg px-4 py-2 text-xs text-white focus:border-emerald-500 outline-none w-64"
                 />
               </div>
               <button 
                onClick={() => setShowCensus(false)}
                className="text-zinc-500 text-sm font-bold hover:text-white"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>

        {showCensus && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-500">
            {/* COLUMNA IZQUIERDA: LISTA */}
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                  <p className="text-[8px] font-bold text-zinc-500 uppercase">Staff</p>
                  <h4 className="text-sm font-bold text-white">{detectedHouses.filter(h => h.tipo === "STAFF").length}</h4>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                  <p className="text-[8px] font-bold text-zinc-500 uppercase">Chofer</p>
                  <h4 className="text-sm font-bold text-white">{detectedHouses.filter(h => h.tipo === "CHOFER").length}</h4>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl border-emerald-500/20">
                  <p className="text-[8px] font-bold text-emerald-500 uppercase">OK</p>
                  <h4 className="text-sm font-bold text-emerald-500">{detectedHouses.filter(h => h.confirmada).length}</h4>
                </div>
              </div>

              <div className="max-h-[450px] overflow-auto pr-2 custom-scrollbar space-y-2">
                {filteredHouses.map((house) => (
                  <div 
                    key={house.id} 
                    onClick={() => setSelectedHouse(house)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedHouse?.id === house.id ? 'border-emerald-500 bg-emerald-500/5' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${house.tipo === 'STAFF' ? 'bg-blue-500/10 text-blue-500' : house.tipo === 'BASE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {house.tipo === 'STAFF' ? <Users className="w-5 h-5" /> : house.tipo === 'BASE' ? <Building2 className="w-5 h-5" /> : <Home className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <span className="text-zinc-100 font-bold text-[13px] block truncate mb-1">{house.direccion}</span>
                          <div className="flex flex-wrap gap-1">
                            {house.unitStats.map((stat, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] text-zinc-300 border border-zinc-700">
                                {stat.unit}: {stat.noches}n
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select 
                          value={house.tipo}
                          onChange={(e) => changeType(house.id, e.target.value as any)}
                          className="bg-black border border-zinc-700 text-[10px] text-zinc-300 rounded px-1.5 py-1 focus:outline-none"
                        >
                          <option value="STAFF">Staff</option>
                          <option value="CHOFER">Chofer</option>
                          <option value="BASE">Base</option>
                        </select>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleDiscard(house.id); }}
                          className="w-7 h-7 rounded flex items-center justify-center transition-all bg-zinc-800 text-zinc-500 hover:bg-red-500/20 hover:text-red-500"
                          title="Marcar como falla GPS / Descartar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleConfirm(house.id); }}
                          className={`w-7 h-7 rounded flex items-center justify-center transition-all ${house.confirmada ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMNA DERECHA: MAPA */}
            <div className="h-[550px] bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden relative">
               <DynamicMap 
                 center={selectedHouse ? [selectedHouse.lat, selectedHouse.lng] : (filteredHouses.length > 0 ? [filteredHouses[0].lat, filteredHouses[0].lng] : [23.63, -102.55])}
                 zoom={selectedHouse ? 16 : 5}
                 markers={detectedHouses.filter(h => !h.descartada).map(h => ({
                   lat: h.lat,
                   lng: h.lng,
                   title: h.direccion,
                   color: h.tipo === 'STAFF' ? '#3B82F6' : h.tipo === 'BASE' ? '#10B981' : '#F59E0B',
                   popup: `<strong>${h.direccion}</strong><br/>${h.unitStats.map(u => `${u.unit}: ${u.noches}n`).join('<br/>')}`
                 }))}
               />
               {selectedHouse && (
                 <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md border border-zinc-800 p-3 rounded-lg z-[1000] flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-emerald-500" />
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase leading-none mb-1">Punto Seleccionado</p>
                        <p className="text-xs text-white font-medium truncate max-w-[200px]">{selectedHouse.direccion}</p>
                      </div>
                   </div>
                   <div className="flex gap-2">
                      <span className="px-2 py-1 bg-zinc-800 rounded text-[9px] text-zinc-400 font-mono">LAT: {selectedHouse.lat.toFixed(5)}</span>
                      <span className="px-2 py-1 bg-zinc-800 rounded text-[9px] text-zinc-400 font-mono">LNG: {selectedHouse.lng.toFixed(5)}</span>
                   </div>
                 </div>
               )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMNA IZQUIERDA: CONFIGURACIÓN */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* PASO 1: MÓDULOS */}
          <div className="bg-[#050505] rounded-xl border border-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <span className="bg-orange-500/10 text-orange-500 w-6 h-6 rounded flex items-center justify-center text-sm">1</span>
              Módulos Activos (Gerencial)
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-2 p-4 rounded-xl border bg-orange-500/10 border-orange-500">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-orange-500 text-lg">Auditoría Directiva y Desgaste Financiero</span>
                  <CheckCircle2 className="w-5 h-5 text-orange-500" />
                </div>
                <p className="text-sm text-orange-400/80 leading-relaxed">Incluye cálculo de gastos, análisis de proyecto vs uso personal, y detección de abusos de fin de semana.</p>
              </div>
            </div>
          </div>

          {/* PASO 2: FILTROS */}
          <div className="bg-[#050505] rounded-xl border border-zinc-900 p-6 shadow-xl space-y-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="bg-orange-500/10 text-orange-500 w-6 h-6 rounded flex items-center justify-center text-sm">2</span>
              Rango de Análisis
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Fechas */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Período
                </label>
                <div className="flex gap-2">
                  <input 
                    type="date" 
                    value={config.dateFrom || options?.minDate || ""} 
                    onChange={(e) => setConfig(c => ({...c, dateFrom: e.target.value}))}
                    className="flex-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none css-date-picker"
                  />
                  <input 
                    type="date" 
                    value={config.dateTo || options?.maxDate || ""} 
                    onChange={(e) => setConfig(c => ({...c, dateTo: e.target.value}))}
                    className="flex-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none css-date-picker"
                  />
                </div>
              </div>

              {/* Vehículos rápidos */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Car className="w-4 h-4" /> Limitar a Vehículos (Opcional)
                </label>
                <div className="flex flex-wrap gap-1.5 h-24 overflow-y-auto pr-2 custom-scrollbar border border-zinc-800 rounded-lg p-2 bg-[#0a0a0a]">
                  {options?.vehicles.map(v => (
                    <button
                      key={v}
                      onClick={() => toggleFilter('vehicles', v)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${config.selectedVehicles.includes(v) ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                      {v}
                    </button>
                  ))}
                  {options?.vehicles.length === 0 && <span className="text-xs text-zinc-600 m-auto">Sin vehículos</span>}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: VISTA PREVIA Y EXPORT */}
        <div className="space-y-6">
          
          <div className="bg-[#050505] rounded-xl border border-zinc-900 p-6 shadow-xl sticky top-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
              <span className="bg-orange-500/10 text-orange-500 w-6 h-6 rounded flex items-center justify-center text-sm">3</span>
              Vista Previa & Generar
            </h3>

            {previewData ? (
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-sm text-zinc-500">Total KM Deshoras</span>
                  <span className="text-sm font-mono text-white">{Math.round(previewData.kpis.totalKmFinde).toLocaleString()} km</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-sm text-zinc-500">Pérdida Gasolina</span>
                  <span className="text-sm font-mono text-red-400 font-bold">{formatMoney(previewData.kpis.gastoGasolinaFinde)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-sm text-zinc-500">% Abuso Personal</span>
                  <span className="text-sm font-mono text-orange-400">{Math.round(previewData.kpis.porcentajePersonal)}%</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-sm text-zinc-500">Top Infractores</span>
                  <span className="text-sm font-mono text-white">{previewData.top10Drivers.length} detectados</span>
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-sm text-zinc-500 mb-8">
                Calculando vista previa...
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => setShowPptxModal(true)}
                disabled={!previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800/50 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-3">
                  <Presentation className="w-5 h-5 text-zinc-400" />
                  <div className="text-left">
                    <div className="text-sm">Previsualizar PPTX</div>
                    <div className="text-[10px] opacity-70 font-normal">Revisar slides gerenciales</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={handleExportPptx}
                disabled={isGenerating || !previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 text-orange-500 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-orange-900/10"
              >
                <div className="flex items-center gap-3">
                  <Presentation className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm">Descargar PowerPoint</div>
                    <div className="text-[10px] opacity-70 font-normal">Reporte Ejecutivo 16:9 (.pptx)</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={async () => {
                  if (!previewData) return;
                  setIsGenerating(true);
                  try {
                    await generateExcelReport(previewData, `Auditoria_GPS_${new Date().getTime()}.xlsx`);
                  } finally {
                    setIsGenerating(false);
                  }
                }}
                disabled={isGenerating || !previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-500 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-emerald-900/10"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm">Descargar Excel</div>
                    <div className="text-[10px] opacity-70 font-normal">Reporte Detallado (.xlsx)</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={handleGenerateMarkdown}
                disabled={isGenerating || !previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 text-blue-400 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-blue-900/10"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm">Reporte de Texto</div>
                    <div className="text-[10px] opacity-70 font-normal">Para copiar y pegar en correo</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
            
            {isGenerating && (
              <p className="text-xs text-center text-zinc-500 mt-4 animate-pulse">Generando documento...</p>
            )}
          </div>

        </div>

      </div>

      {/* MODAL REPORTE TEXTO / MARKDOWN */}
      {showMarkdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#050505]">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" /> Reporte Final de Auditoría
                </h3>
                <p className="text-xs text-zinc-500">Puedes copiar este texto para tu informe o correo electrónico.</p>
              </div>
              <button 
                onClick={() => setShowMarkdownModal(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6 bg-zinc-950">
              <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed custom-scrollbar bg-zinc-900/50 p-6 rounded-xl border border-zinc-800/50">
                {markdownText}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 bg-[#050505] flex justify-end">
              <button
                onClick={copyToClipboard}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${
                  copied 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                }`}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    ¡Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copiar al Portapapeles
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISTA PREVIA PPTX FLOTANTE */}
      {showPptxModal && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#050505]">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Presentation className="w-5 h-5 text-orange-500" /> Vista Previa de Slides Directivos
                </h3>
                <p className="text-xs text-zinc-500">Muestra aproximada de cómo se verán las diapositivas (Formato 16:9).</p>
              </div>
              <button 
                onClick={() => setShowPptxModal(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body - Canvas de PPTX */}
            <div className="flex-1 overflow-auto p-8 bg-zinc-950 flex flex-col items-center gap-12 custom-scrollbar">
              
              {/* SLIDE 1: PORTADA */}
              <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col items-center justify-center border border-zinc-200 shrink-0">
                <div className="absolute top-2 left-0 w-full h-1 bg-[#19426B]"></div>
                <h2 className="text-xl font-bold text-[#008080] font-['Arial'] tracking-widest mb-2">AUDITORÍA DE FLOTILLA</h2>
                <h1 className="text-4xl font-bold text-[#19426B] font-['Arial'] mb-4">Impacto Financiero por Deshoras</h1>
                <p className="text-xl text-[#595959] font-['Arial'] italic">Análisis de Fines de Semana: {previewData.meta.period}</p>
                <div className="absolute bottom-2 left-4 text-[10px] text-[#595959]">Auditoría Financiera y Operativa GPS - {new Date().toLocaleDateString()}</div>
                <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 1</div>
              </div>

              {/* SLIDE 2: IMPACTO FINANCIERO GLOBAL */}
              <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                <div className="absolute top-2 left-0 w-full h-1 bg-[#19426B]"></div>
                <h2 className="text-3xl font-bold text-[#19426B] font-['Arial'] mb-1">1. Impacto Financiero y Operativo</h2>
                <p className="text-[#595959] mb-8 text-sm">Costo acumulado del uso no autorizado de vehículos en fines de semana.</p>
                <div className="flex gap-6 justify-center">
                  <div className="w-1/3 bg-[#F3F6F9] border-2 border-[#35C9C2] p-6 text-center">
                    <div className="text-4xl font-bold text-[#C00000] mb-2">{formatMoney(previewData.kpis.gastoGasolinaFinde)}</div>
                    <div className="text-sm font-bold text-[#595959]">Pérdida Estimada en Gasolina</div>
                  </div>
                  <div className="w-1/3 bg-[#F3F6F9] border-2 border-[#35C9C2] p-6 text-center">
                    <div className="text-4xl font-bold text-[#19426B] mb-2">{Math.round(previewData.kpis.totalKmFinde).toLocaleString()} km</div>
                    <div className="text-sm font-bold text-[#595959]">Recorridos en Deshoras</div>
                  </div>
                  <div className="w-1/3 bg-[#F3F6F9] border-2 border-[#35C9C2] p-6 text-center">
                    <div className="text-4xl font-bold text-[#19426B] mb-2">{previewData.kpis.totalAlertasFinde}</div>
                    <div className="text-sm font-bold text-[#595959]">Viajes Detectados</div>
                  </div>
                </div>
                <div className="absolute bottom-6 left-8 text-xs text-[#595959] italic">Cálculo de gasolina basado en rendimiento estándar de 8 km/L a $24.00 MXN.</div>
                <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 2</div>
              </div>

              {/* SLIDE 3: PROYECTO VS PERSONAL */}
              <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                <div className="absolute top-2 left-0 w-full h-1 bg-[#19426B]"></div>
                <h2 className="text-3xl font-bold text-[#19426B] font-['Arial'] mb-1">2. Clasificación: Proyecto vs. Uso Personal</h2>
                <p className="text-[#595959] mb-8 text-[11px] leading-tight max-w-[700px]">Algoritmo de Validación: Los viajes se consideran 'Proyecto' si la unidad se presenta a una Geocerca oficial durante el fin de semana o el lunes por la mañana.</p>
                
                <div className="flex w-full h-12 bg-[#EAEAEA] rounded-md overflow-hidden mt-4">
                   <div style={{width: `${100 - previewData.kpis.porcentajePersonal}%`}} className="h-full bg-[#008080]"></div>
                   <div style={{width: `${previewData.kpis.porcentajePersonal}%`}} className="h-full bg-[#C00000]"></div>
                </div>
                <div className="flex justify-between w-full mt-2 font-bold text-lg">
                   <span className="text-[#008080]">{100 - Math.round(previewData.kpis.porcentajePersonal)}% Uso de Proyecto</span>
                   <span className="text-[#C00000]">{Math.round(previewData.kpis.porcentajePersonal)}% Uso Personal</span>
                </div>
                <p className="text-[#19426B] text-center mt-6 font-medium text-lg px-8">
                  De los {Math.round(previewData.kpis.totalKmFinde).toLocaleString()} km acumulados, el <span className="font-bold text-[#C00000]">{Math.round(previewData.kpis.porcentajePersonal)}%</span> representan viajes que NO tuvieron relación con un proyecto operativo.
                </p>
                <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 3</div>
              </div>

              {/* SLIDE 4: TOP CONDUCTORES */}
              {previewData.top10Drivers.length > 0 && (
                <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                  <div className="absolute top-2 left-0 w-full h-1 bg-[#19426B]"></div>
                  <h2 className="text-2xl font-bold text-[#19426B] font-['Arial'] mb-6">3. Top 10 Conductores: Mayor Kilometraje en Deshoras</h2>
                  
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#19426B] text-white">
                        <th className="p-2 border border-[#595959]">Conductor</th>
                        <th className="p-2 border border-[#595959] text-center">Días</th>
                        <th className="p-2 border border-[#595959] text-center">Km Finde</th>
                        <th className="p-2 border border-[#595959] text-center">Gasto Est.</th>
                        <th className="p-2 border border-[#595959]">Ruta Principal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.top10Drivers.map((d: any, i: number) => (
                        <tr key={i} className="border-b border-[#EAEAEA]">
                          <td className="p-2 border-r border-[#EAEAEA] text-black font-bold">{d.conductor} <br/><span className="text-[10px] text-[#595959] font-normal">{d.vehiculo}</span></td>
                          <td className="p-2 border-r border-[#EAEAEA] text-black text-center">{d.diasUsoFinde.size}</td>
                          <td className="p-2 border-r border-[#EAEAEA] text-[#C00000] font-bold text-center">{Math.round(d.totalKmFinde)} km</td>
                          <td className="p-2 border-r border-[#EAEAEA] text-black font-bold text-center">{formatMoney(d.gastoGasolina)}</td>
                          <td className="p-2 text-black text-[10px] truncate max-w-[150px]">
                            {d.rutas.length > 0 ? `${d.rutas[0].origen.substring(0,20)}... -> ${d.rutas[0].destino.substring(0,20)}...` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 4</div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3 bg-[#050505]">
              <button 
                onClick={() => setShowPptxModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={() => {
                  setShowPptxModal(false);
                  handleExportPptx();
                }}
                className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-orange-900/20"
              >
                <Presentation className="w-4 h-4" /> Generar .PPTX
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
