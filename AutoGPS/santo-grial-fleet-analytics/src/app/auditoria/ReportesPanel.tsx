"use client";

import { useState, useMemo } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { extractFilterOptions, buildReportData, ReportConfig, ReportData } from "@/lib/reportDataEngine";
import { generateExcelReport } from "@/lib/excelReportGenerator";
import { generatePptxReport } from "@/lib/pptxReportGenerator";
import { FileSpreadsheet, Presentation, Calendar, Car, MapPin, CheckCircle2, ChevronRight, Activity } from "lucide-react";

export function ReportesPanel() {
  const { rawParsedData } = useFleetStore();

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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPptxModal, setShowPptxModal] = useState(false);

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

  // Pre-calcular vista previa
  const previewData: ReportData | null = useMemo(() => {
    if (!options) return null;
    return buildReportData(rawParsedData, {
      ...config,
      dateFrom: config.dateFrom || options.minDate,
      dateTo: config.dateTo || options.maxDate
    });
  }, [rawParsedData, config, options]);

  const handleExportExcel = async () => {
    if (!previewData) return;
    setIsGenerating(true);
    try {
      await generateExcelReport(previewData, `Reporte_Detallado_${new Date().getTime()}.xlsx`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPptx = async () => {
    if (!previewData) return;
    setIsGenerating(true);
    try {
      await generatePptxReport(previewData, `Reporte_Ejecutivo_${new Date().getTime()}.pptx`);
    } finally {
      setIsGenerating(false);
    }
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

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMNA IZQUIERDA: CONFIGURACIÓN */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* PASO 1: MÓDULOS */}
          <div className="bg-[#050505] rounded-xl border border-zinc-800 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <span className="bg-orange-500/10 text-orange-500 w-6 h-6 rounded flex items-center justify-center text-sm">1</span>
              Módulos a Incluir
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className={`flex flex-col gap-2 p-4 rounded-xl border cursor-pointer transition-all ${config.includeWeekend ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${config.includeWeekend ? 'text-orange-500' : 'text-zinc-300'}`}>Fines de Semana</span>
                  <input type="checkbox" checked={config.includeWeekend} onChange={(e) => setConfig(c => ({...c, includeWeekend: e.target.checked}))} className="hidden" />
                  {config.includeWeekend && <CheckCircle2 className="w-5 h-5 text-orange-500" />}
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Alertas de uso en sábado y domingo, y horas acumuladas.</p>
              </label>

              <label className={`flex flex-col gap-2 p-4 rounded-xl border cursor-pointer transition-all ${config.includeStops ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${config.includeStops ? 'text-orange-500' : 'text-zinc-300'}`}>Ubicaciones</span>
                  <input type="checkbox" checked={config.includeStops} onChange={(e) => setConfig(c => ({...c, includeStops: e.target.checked}))} className="hidden" />
                  {config.includeStops && <CheckCircle2 className="w-5 h-5 text-orange-500" />}
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Paradas sospechosas, pernoctas y puntaje de riesgo.</p>
              </label>

              <label className={`flex flex-col gap-2 p-4 rounded-xl border cursor-pointer transition-all ${config.includeVehicles ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${config.includeVehicles ? 'text-orange-500' : 'text-zinc-300'}`}>Vehículos</span>
                  <input type="checkbox" checked={config.includeVehicles} onChange={(e) => setConfig(c => ({...c, includeVehicles: e.target.checked}))} className="hidden" />
                  {config.includeVehicles && <CheckCircle2 className="w-5 h-5 text-orange-500" />}
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Resumen individual de actividad por unidad.</p>
              </label>

              <label className={`flex flex-col gap-2 p-4 rounded-xl border cursor-pointer transition-all ${config.includeScanner ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${config.includeScanner ? 'text-orange-500' : 'text-zinc-300'}`}>Escáner Avanzado</span>
                  <input type="checkbox" checked={config.includeScanner} onChange={(e) => setConfig(c => ({...c, includeScanner: e.target.checked}))} className="hidden" />
                  {config.includeScanner && <CheckCircle2 className="w-5 h-5 text-orange-500" />}
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Busca por dirección, vehículo o conductor.</p>
              </label>
            </div>
          </div>

          {/* PASO 2: FILTROS */}
          <div className="bg-[#050505] rounded-xl border border-zinc-800 p-6 shadow-xl space-y-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="bg-orange-500/10 text-orange-500 w-6 h-6 rounded flex items-center justify-center text-sm">2</span>
              Filtros Avanzados
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Fechas */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Rango de Fechas
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
                  <Car className="w-4 h-4" /> Vehículos Específicos
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

              {/* Escáner Query */}
              {config.includeScanner && (
                <div className="md:col-span-2 space-y-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <label className="text-sm font-medium text-orange-400 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Búsqueda de Escáner
                  </label>
                  <p className="text-xs text-zinc-500">Ingresa parte de una dirección, matrícula, vehículo o nombre de conductor a buscar en el reporte.</p>
                  <input 
                    type="text" 
                    placeholder="Ej. 'Minatitlán', 'Tsuru', 'Juan'..."
                    value={config.scannerQuery} 
                    onChange={(e) => setConfig(c => ({...c, scannerQuery: e.target.value}))}
                    className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none"
                  />
                </div>
              )}
            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: VISTA PREVIA Y EXPORT */}
        <div className="space-y-6">
          
          <div className="bg-[#050505] rounded-xl border border-zinc-800 p-6 shadow-xl sticky top-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
              <span className="bg-orange-500/10 text-orange-500 w-6 h-6 rounded flex items-center justify-center text-sm">3</span>
              Vista Previa & Generar
            </h3>

            {previewData ? (
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-sm text-zinc-500">Registros a procesar</span>
                  <span className="text-sm font-mono text-white">{previewData.kpis.totalRegistrosFiltrados.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-sm text-zinc-500">Vehículos incluidos</span>
                  <span className="text-sm font-mono text-white">{previewData.kpis.totalVehiculos.toLocaleString()}</span>
                </div>
                
                {config.includeWeekend && (
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                    <span className="text-sm text-orange-500">Alertas Finde</span>
                    <span className="text-sm font-mono text-white">{previewData.kpis.totalAlertasFinde.toLocaleString()}</span>
                  </div>
                )}
                {config.includeStops && (
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                    <span className="text-sm text-orange-500">Paradas Sospechosas</span>
                    <span className="text-sm font-mono text-white">{previewData.kpis.totalParadasSospechosas.toLocaleString()}</span>
                  </div>
                )}
                {config.includeScanner && config.scannerQuery.length > 0 && (
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                    <span className="text-sm text-orange-500">Eventos Escáner</span>
                    <span className="text-sm font-mono text-white">{previewData.scannerEvents?.length.toLocaleString() || 0}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-sm text-zinc-500 mb-8">
                Calculando vista previa...
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => setShowPreviewModal(true)}
                disabled={!previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800/50 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-zinc-400" />
                  <div className="text-left">
                    <div className="text-sm">Vista Previa de Tablas</div>
                    <div className="text-[10px] opacity-70 font-normal">Revisa las filas antes de exportar</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={handleExportExcel}
                disabled={isGenerating || !previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-green-600/10 border border-green-600/30 hover:bg-green-600/20 text-green-500 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm">Descargar Excel</div>
                    <div className="text-[10px] opacity-70 font-normal">Reporte detallado multihola (.xlsx)</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              
              <hr className="border-zinc-800 my-2" />

              <button
                onClick={() => setShowPptxModal(true)}
                disabled={!previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800/50 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-3">
                  <Presentation className="w-5 h-5 text-zinc-400" />
                  <div className="text-left">
                    <div className="text-sm">Vista Previa de PPTX</div>
                    <div className="text-[10px] opacity-70 font-normal">Visualiza los slides gerenciales</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={handleExportPptx}
                disabled={isGenerating || !previewData || previewData.kpis.totalRegistrosFiltrados === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 text-orange-500 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-3">
                  <Presentation className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm">Descargar PPTX</div>
                    <div className="text-[10px] opacity-70 font-normal">Resumen ejecutivo gerencial (.pptx)</div>
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

      {/* MODAL VISTA PREVIA FLOTANTE */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#050505]">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-green-500" /> Vista Previa del Excel
                </h3>
                <p className="text-xs text-zinc-500">Mostrando una muestra de los datos que se exportarán (primeras 50 filas).</p>
              </div>
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6 space-y-8 custom-scrollbar">
              
              {/* Sección Fines de Semana */}
              {config.includeWeekend && previewData.weekendAlerts.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-orange-500 font-semibold text-sm border-b border-zinc-800 pb-2">Datos de Fin de Semana ({previewData.weekendAlerts.length} filas)</h4>
                  <div className="overflow-x-auto border border-zinc-800 rounded-lg custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 font-medium">Fecha</th>
                          <th className="px-4 py-3 font-medium">Vehículo</th>
                          <th className="px-4 py-3 font-medium">Conductor</th>
                          <th className="px-4 py-3 font-medium">Dirección</th>
                          <th className="px-4 py-3 font-medium text-right">Aparcado (h)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {previewData.weekendAlerts.slice(0, 50).map((row, i) => (
                          <tr key={i} className="hover:bg-zinc-800/30">
                            <td className="px-4 py-2 text-zinc-300">{row.fecha}</td>
                            <td className="px-4 py-2 text-zinc-300">{row.vehiculo} <span className="text-zinc-500 text-xs ml-2">{row.matricula}</span></td>
                            <td className="px-4 py-2 text-zinc-300">{row.conductor}</td>
                            <td className="px-4 py-2 text-zinc-400 text-xs truncate max-w-[200px]">{row.direccion}</td>
                            <td className="px-4 py-2 text-zinc-300 text-right font-mono">{Math.round(row.tiempoAparcadoSecs / 3600 * 10) / 10}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sección Escáner */}
              {config.includeScanner && previewData.scannerEvents && previewData.scannerEvents.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-red-500 font-semibold text-sm border-b border-zinc-800 pb-2">Resultados de Escáner ({previewData.scannerEvents.length} filas)</h4>
                  <div className="overflow-x-auto border border-zinc-800 rounded-lg custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 font-medium">Fecha/Hora</th>
                          <th className="px-4 py-3 font-medium">Vehículo</th>
                          <th className="px-4 py-3 font-medium">Conductor</th>
                          <th className="px-4 py-3 font-medium">Ubicación Detectada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {previewData.scannerEvents.slice(0, 50).map((row, i) => (
                          <tr key={i} className="hover:bg-zinc-800/30">
                            <td className="px-4 py-2 text-zinc-300">{row.fechaHora}</td>
                            <td className="px-4 py-2 text-zinc-300">{row.vehiculo}</td>
                            <td className="px-4 py-2 text-zinc-300">{row.conductor}</td>
                            <td className="px-4 py-2 text-zinc-400 text-xs">{row.direccion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3 bg-[#050505]">
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={() => {
                  setShowPreviewModal(false);
                  handleExportExcel();
                }}
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-green-900/20"
              >
                <FileSpreadsheet className="w-4 h-4" /> Exportar a Excel Ahora
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
                  <Presentation className="w-5 h-5 text-orange-500" /> Vista Previa de la Presentación
                </h3>
                <p className="text-xs text-zinc-500">Muestra aproximada de cómo se verán las diapositivas generadas (Formato 16:9).</p>
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
                <div className="absolute top-2 left-0 w-full h-1 bg-[#C00000]"></div>
                <h1 className="text-4xl font-bold text-[#19426B] font-['Verdana'] mb-4">Hallazgos – Telemetría GPS</h1>
                <p className="text-2xl text-[#595959] font-['Verdana'] mb-2">Período Evaluado: {previewData.meta.period}</p>
                <p className="text-lg text-[#008080] font-['Verdana']">Módulos Incluidos: {previewData.meta.sections.join(", ")}</p>
                <div className="absolute bottom-2 left-4 text-[10px] text-[#595959]">Reporte generado por AnalyticsGPS - {new Date().toLocaleDateString()}</div>
                <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 1</div>
              </div>

              {/* SLIDE 2: KPIs */}
              <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                <div className="absolute top-2 left-0 w-full h-1 bg-[#C00000]"></div>
                <h2 className="text-3xl font-bold text-[#19426B] font-['Verdana'] mb-8">Resumen Ejecutivo</h2>
                <div className="flex gap-6 justify-center">
                  <div className="w-1/3 bg-[#F3F6F9] border-2 border-[#35C9C2] p-6 text-center">
                    <div className="text-5xl font-bold text-[#19426B] mb-2">{previewData.kpis.totalVehiculos}</div>
                    <div className="text-sm text-[#595959]">Vehículos Filtrados</div>
                  </div>
                  {config.includeWeekend && (
                    <div className="w-1/3 bg-[#F3F6F9] border-2 border-[#35C9C2] p-6 text-center">
                      <div className="text-5xl font-bold text-[#19426B] mb-2">{previewData.kpis.totalAlertasFinde}</div>
                      <div className="text-sm text-[#595959]">Alertas Fin de Semana</div>
                    </div>
                  )}
                  {config.includeStops && (
                    <div className="w-1/3 bg-[#F3F6F9] border-2 border-[#35C9C2] p-6 text-center">
                      <div className="text-5xl font-bold text-[#C00000] mb-2">{previewData.kpis.totalParadasSospechosas}</div>
                      <div className="text-sm text-[#595959]">Paradas Sospechosas</div>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-2 left-4 text-[10px] text-[#595959]">Reporte generado por AnalyticsGPS - {new Date().toLocaleDateString()}</div>
                <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 2</div>
              </div>

              {/* SLIDE 3: VEHÍCULO DE RIESGO EJEMPLO */}
              {previewData.vehicleSummaries.length > 0 && (
                <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                  <div className="absolute top-2 left-0 w-full h-1 bg-[#C00000]"></div>
                  <h2 className="text-3xl font-bold text-[#19426B] font-['Verdana'] mb-2">Vehículo de Riesgo #1: {previewData.vehicleSummaries[0].vehiculo}</h2>
                  <p className="text-[#595959] font-bold text-sm mb-1">Matrícula: {previewData.vehicleSummaries[0].matricula} | Conductor: {previewData.vehicleSummaries[0].conductor}</p>
                  <p className="text-[#C00000] font-bold text-sm mb-6">Eventos en Fines de Semana: {previewData.vehicleSummaries[0].totalEventos} | Horas acumuladas: {previewData.vehicleSummaries[0].horasAcumuladas}h</p>
                  
                  {previewData.vehicleSummaries[0].top5WeekendLocations && (
                    <table className="w-full text-left text-sm border-collapse mt-2">
                      <thead>
                        <tr className="bg-[#19426B] text-white">
                          <th className="p-2 border border-[#595959]">Fecha/Hora</th>
                          <th className="p-2 border border-[#595959]">Dirección</th>
                          <th className="p-2 border border-[#595959] text-center">Tiempo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.vehicleSummaries[0].top5WeekendLocations.map((loc, i) => (
                          <tr key={i}>
                            <td className="p-2 border border-[#595959] text-black">{loc.fechaHora}</td>
                            <td className="p-2 border border-[#595959] text-black">{loc.direccion}</td>
                            <td className="p-2 border border-[#595959] text-black text-center">{Math.round(loc.tiempoSecs/60)} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  
                  <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] pointer-events-none">
                    <span className="bg-[#19426B] text-white px-4 py-2 rounded-full font-bold shadow-lg">El archivo final generará 1 hoja por vehículo</span>
                  </div>
                </div>
              )}

              {/* SLIDE 4: ESCÁNER DE AUDITORÍA */}
              {config.includeScanner && previewData.scannerEvents && previewData.scannerEvents.length > 0 && (
                <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                  <div className="absolute top-2 left-0 w-full h-1 bg-[#C00000]"></div>
                  <h2 className="text-3xl font-bold text-[#C00000] font-['Verdana'] mb-6">Resultados del Escáner</h2>
                  
                  <table className="w-full text-left text-[10px] border-collapse mt-2">
                    <thead>
                      <tr className="bg-[#C00000] text-white">
                        <th className="p-2 border border-[#595959]">Vehículo</th>
                        <th className="p-2 border border-[#595959]">Conductor</th>
                        <th className="p-2 border border-[#595959]">Fecha/Hora</th>
                        <th className="p-2 border border-[#595959]">Dirección</th>
                        <th className="p-2 border border-[#595959] text-center">Tiempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.scannerEvents.slice(0, 5).map((ev, i) => (
                        <tr key={i}>
                          <td className="p-2 border border-[#595959] text-black">{ev.vehiculo}</td>
                          <td className="p-2 border border-[#595959] text-black">{ev.conductor}</td>
                          <td className="p-2 border border-[#595959] text-black">{ev.fechaHora}</td>
                          <td className="p-2 border border-[#595959] text-black truncate max-w-[200px]">{ev.direccion}</td>
                          <td className="p-2 border border-[#595959] text-black text-center">{Math.round(ev.tiempoSecs/60)} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {previewData.scannerEvents.length > 5 && (
                    <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] pointer-events-none">
                      <span className="bg-[#C00000] text-white px-4 py-2 rounded-full font-bold shadow-lg">Mostrando 5 de {previewData.scannerEvents.length} registros</span>
                    </div>
                  )}

                  <div className="absolute bottom-2 left-4 text-[10px] text-[#595959]">Reporte generado por AnalyticsGPS - {new Date().toLocaleDateString()}</div>
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
                <Presentation className="w-4 h-4" /> Exportar a PPTX Ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
