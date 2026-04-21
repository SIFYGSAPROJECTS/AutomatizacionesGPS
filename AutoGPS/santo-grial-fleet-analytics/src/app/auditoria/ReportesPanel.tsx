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

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
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
                  <span className="text-sm font-mono text-white">{previewData.top5KmDrivers.length} detectados</span>
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
            </div>
            
            {isGenerating && (
              <p className="text-xs text-center text-zinc-500 mt-4 animate-pulse">Generando documento...</p>
            )}
          </div>

        </div>

      </div>

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
              {previewData.top5KmDrivers.length > 0 && (
                <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                  <div className="absolute top-2 left-0 w-full h-1 bg-[#19426B]"></div>
                  <h2 className="text-2xl font-bold text-[#19426B] font-['Arial'] mb-6">3. Top 5 Conductores: Mayor Kilometraje en Deshoras</h2>
                  
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
                      {previewData.top5KmDrivers.map((d, i) => (
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

              {/* SLIDE 5: ALERTA ROJA */}
              {previewData.topPersonalAbusers.length > 0 && (
                <div className="w-[800px] aspect-video bg-white shadow-lg relative flex flex-col border border-zinc-200 p-8 shrink-0">
                  <div className="absolute top-2 left-0 w-full h-1 bg-[#19426B]"></div>
                  <h2 className="text-3xl font-bold text-[#C00000] font-['Arial'] mb-2">4. ALERTA ROJA: Abuso de Uso Personal</h2>
                  <p className="text-[#595959] mb-6 text-[12px] font-bold">Conductores que usaron la unidad en deshoras y NUNCA se presentaron a una Geocerca el día posterior.</p>
                  
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#C00000] text-white">
                        <th className="p-2 border border-[#595959]">Conductor</th>
                        <th className="p-2 border border-[#595959] text-center">Pérdida $$</th>
                        <th className="p-2 border border-[#595959]">Ruta Documentada (Evidencia)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.topPersonalAbusers.map((d, i) => (
                        <tr key={i} className="border-b border-[#EAEAEA]">
                          <td className="p-2 border-r border-[#EAEAEA] text-black font-bold">{d.conductor} <br/><span className="text-[10px] text-[#595959] font-normal">{d.vehiculo}</span></td>
                          <td className="p-2 border-r border-[#EAEAEA] text-[#C00000] font-bold text-center text-lg">{formatMoney(d.gastoGasolina)}</td>
                          <td className="p-2 text-black text-[10px] truncate max-w-[250px]">
                            {d.rutas.length > 0 ? (
                              <div className="flex flex-col">
                                <span>De: {d.rutas[0].origen.substring(0,35)}...</span>
                                <span>A: {d.rutas[0].destino.substring(0,35)}...</span>
                              </div>
                            ) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="absolute bottom-2 right-4 text-[10px] text-[#595959]">Pág. 5</div>
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
