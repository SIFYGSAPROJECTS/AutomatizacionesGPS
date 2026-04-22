"use client";

import { useState } from "react";
import { UploadCloud, FileText, CheckCircle, Save, Activity, Plus, Printer, FileSpreadsheet, X, MapPin } from "lucide-react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { processStreaks, RawTelemetryRow, StreakReportRow } from "@/lib/streaksAnalyzer";
import { format, differenceInDays } from "date-fns";
import dictionary from "@/lib/dictionary.json";
import { useFleetStore } from "@/store/useFleetStore";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import { importRawTelemetry } from "@/lib/db";
import { parseNavixyReport } from "@/lib/navixyXlsxParser";

export function CsvUploader() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
  // Zustand Global Store
  const { rawParsedData, streakReport, setFleetData, setStreakReport } = useFleetStore();
  const { addSnapshot } = useAnalysisHistory();

  const [manualRacha, setManualRacha] = useState({
    Geocerca: "",
    Placas: "",
    Consecutivo: "",
    Vehículo: "",
    Inicio: "",
    Fin: "",
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const processFile = async (file: File) => {
    setFile(file);
    // Limpiamos el global momentaneamente hasta procesarlo
    setStreakReport(null as any); // hack bypass null para borrar UI rápido
    
    setIsProcessing(true);

    try {
      let rawRows: Record<string, string>[] = [];

      if (file.name.toLowerCase().endsWith(".xlsx")) {
        console.log("Procesando reporte agrupado XLSX de Navixy...");
        rawRows = await parseNavixyReport(file);
      } else {
        console.log("Procesando CSV plano...");
        rawRows = await new Promise<Record<string, string>[]>((resolve, reject) => {
          Papa.parse<RawTelemetryRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as Record<string, string>[]),
            error: (err) => reject(err),
          });
        });
      }

      console.log(`Iniciando inyección masiva en IndexedDB con ${rawRows.length} registros...`);
      await importRawTelemetry(rawRows);
      console.log("Inyección completada.");
      
      await useFleetStore.getState().scanAvailableMonths();
      
      const range = useFleetStore.getState().globalDateRange;
      if (range) {
        await useFleetStore.getState().loadDataFromDb(range.from, range.to);
      }
    } catch (e) {
      console.error("Error importando archivo:", e);
      alert("Hubo un error al procesar o guardar el archivo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
  };

  const handleProcessTelemtry = () => {
    const rawData = useFleetStore.getState().rawParsedData;
    if (!rawData) return;
    setIsProcessing(true);
    setTimeout(async () => {
      // El nuevo processStreaks devuelve report y auditTrail
      const { report, auditTrail } = processStreaks(rawData);
      setFleetData(rawData, report, auditTrail);

      // === SNAPSHOT AL HISTORIAL ===
      try {
        const geocercasUnicas = new Set(report.map(r => r.Geocerca));
        const vehiculosUnicos = new Set(report.map(r => r.Placas));
        const allDates = report.flatMap(r => [r.Inicio, r.Fin]).filter(Boolean).sort();
        const dateFrom = allDates[0] || "";
        const dateTo = allDates[allDates.length - 1] || "";
        let totalDays = 0;
        if (dateFrom && dateTo) {
          const d1 = new Date(dateFrom + "T00:00:00");
          const d2 = new Date(dateTo + "T00:00:00");
          totalDays = Math.max(1, differenceInDays(d2, d1) + 1);
        }
        addSnapshot(
          {
            fileName: file?.name || "Desconocido",
            fileSizeKB: file ? Math.round(file.size / 1024) : 0,
            totalRows: rawData.length,
            streaksFound: report.length,
            uniqueGeocercas: geocercasUnicas.size,
            uniqueVehicles: vehiculosUnicos.size,
            dateRangeFrom: dateFrom,
            dateRangeTo: dateTo,
            totalDaysAnalyzed: totalDays,
          },
          { streakReport: report, auditTrail }
        );
        console.log("📸 Snapshot + reporte completo guardados en historial.");
      } catch (e) {
        console.warn("⚠️ No se pudo guardar snapshot:", e);
      }

      // === AUTO-APRENDIZAJE DEL DICCIONARIO ===
      // Extraer entidades únicas del CSV para mergear al dictionary.json
      try {
        const geocercasSet = new Set<string>();
        const placasSet = new Set<string>();
        const consecutivosSet = new Set<string>();
        const vehiculosSet = new Set<string>();
        const unidadesMap = new Map<string, { Placas: string; Consecutivo: string; Vehículo: string }>();

        rawData.forEach((row: any) => {
          // Buscar campos con tolerancia de headers
          const keys = Object.keys(row);
          const findKey = (...candidates: string[]) => {
            for (const c of candidates) {
              if (row[c] !== undefined) return row[c];
            }
            for (const c of candidates) {
              const norm = c.trim().toLowerCase();
              const found = keys.find(k => k.trim().toLowerCase() === norm);
              if (found && row[found] !== undefined) return row[found];
            }
            return "";
          };

          const geo = findKey("Geocercas", "geocercas").trim();
          if (geo) geocercasSet.add(geo);

          const matricula = findKey("Matrícula", "Matricula", "matrícula");
          const parts = (matricula || "").split(" ");
          const placas = parts[0]?.trim() || "";
          const consecutivo = parts[1]?.trim() || "";
          const vehiculo = findKey("Vehículo", "Vehiculo", "vehículo", "vehiculo").trim();

          if (placas) placasSet.add(placas);
          if (consecutivo) consecutivosSet.add(consecutivo);
          if (vehiculo) vehiculosSet.add(vehiculo);

          if (placas) {
            unidadesMap.set(placas, { Placas: placas, Consecutivo: consecutivo, Vehículo: vehiculo });
          }
        });

        await fetch("/api/dictionary/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            geocercas: Array.from(geocercasSet),
            placas: Array.from(placasSet),
            consecutivos: Array.from(consecutivosSet),
            vehiculos: Array.from(vehiculosSet),
            unidadesRelacionales: Array.from(unidadesMap.values()),
          }),
        });
        console.log("✅ Diccionario auto-actualizado con nuevas entidades del CSV.");
      } catch (e) {
        console.warn("⚠️ No se pudo actualizar el diccionario:", e);
      }

      setIsProcessing(false);
    }, 600);
  };

  const handleManualChange = (field: string, value: string) => {
    let updates: Record<string, string> = { [field]: value };
    
    if (field === 'Consecutivo' && value.length >= 3) {
      const unit = dictionary.unidadesRelacionales.find(u => u.Consecutivo === value);
      if (unit) {
        updates.Placas = unit.Placas;
        updates.Vehículo = unit.Vehículo;
      }
    } else if (field === 'Placas' && value.length >= 5) {
      const unit = dictionary.unidadesRelacionales.find(u => u.Placas === value);
      if (unit) {
        updates.Consecutivo = unit.Consecutivo;
        updates.Vehículo = unit.Vehículo;
      }
    }
    
    setManualRacha(prev => ({ ...prev, ...updates }));
  };

  const handleAddManualRacha = (e: React.FormEvent) => {
    e.preventDefault();
    if (!streakReport) return;

    const start = new Date(manualRacha.Inicio);
    const end = new Date(manualRacha.Fin);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return alert("Fechas inválidas.");

    const diasCalendario = differenceInDays(end, start) + 1;
    if (diasCalendario < 0) return alert("La fecha de fin no puede ser menor a la de inicio.");

    const newRow: StreakReportRow = {
      Geocerca: manualRacha.Geocerca,
      Placas: manualRacha.Placas,
      Consecutivo: manualRacha.Consecutivo || "N/A",
      "Vehículo": manualRacha.Vehículo,
      Inicio: manualRacha.Inicio,
      Fin: manualRacha.Fin,
      Periodo: `${format(start, "dd/MM/yyyy")} - ${format(end, "dd/MM/yyyy")}`,
      "Días asistidos": diasCalendario,
      "Días calendario": diasCalendario,
    };

    const updated = [...streakReport, newRow].sort((a, b) => {
       const geoComp = a.Geocerca.localeCompare(b.Geocerca);
       if (geoComp !== 0) return geoComp;
       return a.Inicio.localeCompare(b.Inicio);
    });
    setStreakReport(updated);
    setManualRacha({ Geocerca: "", Placas: "", Consecutivo: "", Vehículo: "", Inicio: "", Fin: "" });
  };

  const totalRachas = streakReport ? streakReport.length : 0;
  const geocercasUnicas = streakReport ? new Set(streakReport.map(r => r.Geocerca)).size : 0;
  const unidadesUnicas = streakReport ? new Set(streakReport.map(r => r.Vehículo)).size : 0;

  const handleCellEdit = (index: number, field: keyof StreakReportRow, value: string | number) => {
    if (!streakReport) return;
    const updated = [...streakReport];
    updated[index] = { ...updated[index], [field]: value };
    setStreakReport(updated);
  };

  const handleExportExcel = async () => {
    if (!streakReport) return;
    setIsExporting(true);
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Santo Grial Fleet Analytics";
    const sheet = workbook.addWorksheet("Análisis de Rachas");

    // Configuración de impresión
    sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 99 };
    sheet.headerFooter = {
      oddFooter: "&LGenerado: Santo Grial Fleet Analytics&C&P de &N&RFecha: &D &T"
    };

    // Título Gerencial
    sheet.mergeCells('A1:I3');
    const titleCell = sheet.getCell('A1');
    titleCell.value = "REPORTE EJECUTIVO DE ASISTENCIA Y RACHAS EN GEOCERCAS";
    titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Cabeceras en Fila 4
    sheet.getRow(4).values = [
      "Geocerca", "Placas", "Consecutivo", "Vehículo", "Inicio", "Fin", "Periodo", "Días asistidos", "Días calendario"
    ];
    
    sheet.columns = [
      { key: "geocerca", width: 28 },
      { key: "placas", width: 14 },
      { key: "consecutivo", width: 14 },
      { key: "vehiculo", width: 32 },
      { key: "inicio", width: 15 },
      { key: "fin", width: 15 },
      { key: "periodo", width: 28 },
      { key: "diasAsistidos", width: 16 },
      { key: "diasCalendario", width: 16 },
    ];
    
    // Inserción de datos a partir de la fila 5
    streakReport.forEach(r => {
      sheet.addRow({
         geocerca: r.Geocerca,
         placas: r.Placas,
         consecutivo: r.Consecutivo,
         vehiculo: r.Vehículo,
         inicio: r.Inicio,
         fin: r.Fin,
         periodo: r.Periodo,
         diasAsistidos: r["Días asistidos"],
         diasCalendario: r["Días calendario"],
      });
    });

    // Formato de Header (Fila 4)
    const headerRow = sheet.getRow(4);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
        left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
        bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
        right: { style: 'thin', color: { argb: 'FFBFDBFE' } }
      };
    });

    // Formato de Datos
    sheet.eachRow((row, rowNumber) => {
       if(rowNumber > 4) {
         row.eachCell(cell => {
           cell.alignment = { vertical: 'middle' };
           cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
         });
         row.getCell(8).alignment = { horizontal: 'center' };
         row.getCell(9).alignment = { horizontal: 'center' };
         row.height = 20;
       }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const downloadName = `Analisis_Rachas_${format(new Date(), "dd-MM-yyyy_HH-mm")}.xlsx`;
    link.setAttribute("download", downloadName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    try {
      const base64Buffer = Buffer.from(buffer).toString('base64');
      await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excelBase64: base64Buffer }),
      });
    } catch(e) {
      console.warn("Error backend backup", e);
    }
    
    setIsExporting(false);
  };

  return (
    <div className="w-full space-y-8">
      <datalist id="geocercas-list">
        {dictionary.geocercas.map((g, i) => <option key={i} value={g} />)}
      </datalist>
      <datalist id="placas-list">
        {dictionary.placas.map((p, i) => <option key={i} value={p} />)}
      </datalist>
      <datalist id="consecutivos-list">
        {dictionary.consecutivos.map((c, i) => <option key={i} value={c} />)}
      </datalist>
      <datalist id="vehiculos-list">
        {dictionary.vehiculos.map((v, i) => <option key={i} value={v} />)}
      </datalist>

      <div 
        className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl transition-all duration-300
        ${dragActive 
          ? "border-orange-500 bg-orange-500/10 shadow-[0_0_40px_rgba(249,115,22,0.15)]" 
          : "border-zinc-800 bg-[#050505] hover:bg-[#0a0a0a] hover:border-orange-500/50"
        }
      `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          accept=".csv, .xlsx" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
          onChange={handleChange}
        />
        
        {file ? (
          <div className="flex flex-col items-center text-center animate-in fade-in zoom-in duration-300 z-10">
            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4 ring-4 ring-orange-500/20">
              <CheckCircle className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-1">{file.name}</h3>
            <p className="text-zinc-400 text-sm mb-6">
              {(file.size / 1024).toFixed(2)} KB • {rawParsedData?.length || 0} registros en memoria global
            </p>
            
            {!streakReport && (
              <button 
                onClick={handleProcessTelemtry}
                disabled={!rawParsedData || isProcessing}
                className="relative px-8 py-3 bg-orange-600 hover:bg-orange-500 text-black rounded-xl font-bold transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                <span className="relative flex items-center gap-2">
                  {isProcessing ? (
                    <>
                      <Activity className="w-5 h-5 animate-pulse" />
                      Auditando Rachas Globales...
                    </>
                  ) : (
                    <>
                      <Activity className="w-5 h-5" />
                      Procesar Telemetría
                    </>
                  )}
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center pointer-events-none">
            <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mb-5 border border-zinc-800 shadow-xl">
              <UploadCloud className="w-10 h-10 text-orange-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-200 mb-2">Sube tu Archivo de Telemetría o Rutas</h3>
            <p className="text-zinc-500 max-w-md">
              Arrastra y suelta tu archivo <b>CSV</b> o <b>XLSX</b> aquí. El sistema detectará automáticamente si es un archivo plano o un reporte agrupado y lo procesará mágicamente.
            </p>
          </div>
        )}
      </div>

      {streakReport && streakReport.length > 0 && (
        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500 mt-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h4 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-500" />
                Análisis de Rachas Generado
              </h4>
              <p className="text-sm text-zinc-400">
                Se encontraron {streakReport.length} agrupaciones. Puedes ver el Rastro Oculto en el menú "Auditoría".
              </p>
            </div>
            
            <button 
              onClick={() => setShowPreviewModal(true)}
              disabled={isExporting}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0a0a0a] text-orange-500 border border-orange-500/30 hover:bg-[#111] hover:border-orange-500/50 rounded-lg transition-colors font-medium text-sm shadow-lg disabled:opacity-50"
            >
               {isExporting ? <Activity className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
               Vista Previa / Exportar
            </button>
          </div>

          <div className="p-5 border border-zinc-800 bg-[#0a0a0a] rounded-xl">
             <h5 className="text-sm font-medium text-orange-500 mb-4 flex items-center gap-2">
               <Plus className="w-4 h-4" />
               Añadir Racha Manual (Predictiva)
             </h5>
             <form onSubmit={handleAddManualRacha} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-4 items-end">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs text-zinc-400">Geocerca</label>
                  <input required list="geocercas-list" placeholder="Ej. LUGAR X" value={manualRacha.Geocerca} onChange={(e) => handleManualChange('Geocerca', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Placas</label>
                  <input required list="placas-list" placeholder="ABC-123" value={manualRacha.Placas} onChange={(e) => handleManualChange('Placas', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 focus:bg-[#1a1a1a]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Consecutivo</label>
                  <input list="consecutivos-list" placeholder="AVH-000" value={manualRacha.Consecutivo} onChange={(e) => handleManualChange('Consecutivo', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 focus:bg-[#1a1a1a]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Vehículo</label>
                  <input list="vehiculos-list" placeholder="Modelo" value={manualRacha.Vehículo} onChange={(e) => handleManualChange('Vehículo', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 focus:bg-[#1a1a1a]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">F. Inicio</label>
                  <input required type="date" value={manualRacha.Inicio} onChange={(e) => handleManualChange('Inicio', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 css-date-picker" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">F. Fin</label>
                  <input required type="date" value={manualRacha.Fin} onChange={(e) => handleManualChange('Fin', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 css-date-picker" />
                </div>
                <div className="md:col-span-7 flex justify-end mt-2">
                  <button type="submit" className="px-5 py-2 bg-zinc-900 border border-zinc-700 hover:border-orange-500 text-sm text-zinc-300 hover:text-orange-500 rounded-lg font-medium transition-colors">
                     Añadir a la tabla
                  </button>
                </div>
             </form>
          </div>

          {/* VISTA DESKTOP: Tabla auto-layout, columnas se ajustan al contenido */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800 bg-[#050505] shadow-xl">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-zinc-500 bg-[#0a0a0a] border-b border-zinc-800 uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap">Geocerca</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap">Placas</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap">Consecutivo</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap">Vehículo</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap">Inicio</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap">Fin</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap">Periodo</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap text-center">Días Asis.</th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap text-center">Días Cal.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {streakReport.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-900/70 transition-colors text-zinc-300">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <input list="geocercas-list" value={row.Geocerca} onChange={(e) => handleCellEdit(i, 'Geocerca', e.target.value)} size={Math.max(row.Geocerca.length, 12)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-orange-500 font-medium text-sm" />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <input list="placas-list" value={row.Placas} onChange={(e) => handleCellEdit(i, 'Placas', e.target.value)} size={Math.max(row.Placas.length, 8)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-sm" />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <input list="consecutivos-list" value={row.Consecutivo} onChange={(e) => handleCellEdit(i, 'Consecutivo', e.target.value)} size={Math.max(row.Consecutivo.length, 8)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-zinc-500 text-sm" />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <input list="vehiculos-list" value={row.Vehículo} onChange={(e) => handleCellEdit(i, 'Vehículo', e.target.value)} size={Math.max(row.Vehículo.length, 12)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-zinc-400 text-sm" />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <input type="date" value={row.Inicio} onChange={(e) => handleCellEdit(i, 'Inicio', e.target.value)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-sm css-date-picker" />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <input type="date" value={row.Fin} onChange={(e) => handleCellEdit(i, 'Fin', e.target.value)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-sm css-date-picker" />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <input value={row.Periodo} onChange={(e) => handleCellEdit(i, 'Periodo', e.target.value)} size={Math.max(row.Periodo.length, 15)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-zinc-400 text-sm" />
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <input type="number" value={row["Días asistidos"]} onChange={(e) => handleCellEdit(i, 'Días asistidos', parseInt(e.target.value) || 0)} className="w-14 text-center bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded py-1 transition-all text-orange-500 font-bold text-sm" />
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <input type="number" value={row["Días calendario"]} onChange={(e) => handleCellEdit(i, 'Días calendario', parseInt(e.target.value) || 0)} className="w-14 text-center bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded py-1 transition-all text-zinc-300 font-bold text-sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* VISTA MOBILE: Cards apiladas */}
          <div className="md:hidden space-y-3">
            {streakReport.map((row, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-4 space-y-3 hover:border-orange-500/30 transition-colors">
                {/* Geocerca + badges días */}
                <div className="flex items-start justify-between gap-2">
                  <input list="geocercas-list" value={row.Geocerca} onChange={(e) => handleCellEdit(i, 'Geocerca', e.target.value)} className="flex-1 bg-transparent text-orange-500 font-semibold text-sm outline-none border-b border-transparent focus:border-orange-500/50 pb-0.5" />
                  <div className="flex gap-1.5 shrink-0">
                    <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-mono font-bold">{row["Días asistidos"]}d</span>
                    <span className="text-[10px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded font-mono">{row["Días calendario"]}cal</span>
                  </div>
                </div>
                {/* Placas + Consecutivo + Vehículo */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Placas</p>
                    <input list="placas-list" value={row.Placas} onChange={(e) => handleCellEdit(i, 'Placas', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Consecutivo</p>
                    <input list="consecutivos-list" value={row.Consecutivo} onChange={(e) => handleCellEdit(i, 'Consecutivo', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-400 outline-none focus:border-orange-500/50" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Vehículo</p>
                    <input list="vehiculos-list" value={row.Vehículo} onChange={(e) => handleCellEdit(i, 'Vehículo', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-400 outline-none focus:border-orange-500/50" />
                  </div>
                </div>
                {/* Fechas */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Inicio</p>
                    <input type="date" value={row.Inicio} onChange={(e) => handleCellEdit(i, 'Inicio', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 css-date-picker" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Fin</p>
                    <input type="date" value={row.Fin} onChange={(e) => handleCellEdit(i, 'Fin', e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 css-date-picker" />
                  </div>
                </div>
                {/* Periodo */}
                <div className="text-[10px] text-zinc-500 font-mono bg-[#050505] border border-zinc-900 rounded px-2 py-1.5">
                  {row.Periodo}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html: `
        <input[type="date"]::-webkit-calendar-picker-indicator {
            filter: invert(1);
        }
      `}} />

      {/* MODAL PRINT PREVIEW GERENCIAL PARA RACHAS GLOBALES */}
      {showPreviewModal && streakReport && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-100 w-full max-w-5xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-zinc-900 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Printer className="w-5 h-5 text-zinc-400" />
                Vista Previa del Documento Maestro
              </h3>
              <button onClick={() => setShowPreviewModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* A4 Paper Context */}
            <div className="p-8 overflow-y-auto bg-zinc-200 flex-1 flex justify-center">
              <div className="bg-white w-full max-w-4xl min-h-[1056px] shadow-lg p-12 text-black font-sans relative">
                
                {/* Header Formal */}
                <div className="border-b-2 border-blue-900 pb-4 mb-8">
                  <h1 className="text-2xl font-bold text-blue-900 uppercase tracking-wide">Reporte Ejecutivo de Asistencia y Rachas</h1>
                  <p className="text-sm text-gray-500 mt-1">Generado en Santo Grial Fleet Analytics • {new Date().toLocaleDateString()}</p>
                </div>

                {/* KPI Boxes */}
                <div className="grid grid-cols-3 gap-6 mb-10">
                  <div className="bg-gray-50 p-5 rounded border border-gray-200 text-center">
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Rachas Generadas</p>
                    <p className="text-3xl font-bold text-blue-600">{totalRachas}</p>
                  </div>
                  <div className="bg-gray-50 p-5 rounded border border-gray-200 text-center">
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Geocercas Impactadas</p>
                    <p className="text-3xl font-bold text-gray-900">{geocercasUnicas}</p>
                  </div>
                  <div className="bg-gray-50 p-5 rounded border border-gray-200 text-center">
                     <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Unidades Participantes</p>
                    <p className="text-3xl font-bold text-gray-900">{unidadesUnicas}</p>
                  </div>
                </div>

                {/* Table Sim */}
                <h2 className="text-sm uppercase font-bold text-gray-900 mb-4 tracking-wider">Top Agrupaciones de Cobertura</h2>
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-blue-900 text-white">
                      <th className="p-3 border border-blue-800 w-1/3">Geocerca Base</th>
                      <th className="p-3 border border-blue-800 w-1/3">Identificador / Vehículo</th>
                      <th className="p-3 border border-blue-800 text-center">Días Asistidos</th>
                      <th className="p-3 border border-blue-800">Periodo de Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streakReport.slice(0, 15).map((r, i) => (
                       <tr key={i} className="border-b border-gray-200">
                          <td className="p-3 font-semibold text-gray-800 flex items-center gap-2">
                             <MapPin className="w-4 h-4 text-blue-600" />
                             {r.Geocerca}
                          </td>
                          <td className="p-3">
                             <span className="font-semibold text-gray-900 block">{r.Vehículo}</span>
                             <span className="text-xs text-gray-500 block">{r.Placas}</span>
                          </td>
                          <td className="p-3">
                             <div className="flex justify-center items-center">
                               <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded font-bold">{r["Días asistidos"]}</span>
                             </div>
                          </td>
                          <td className="p-3 text-xs text-gray-600 font-mono">
                             {r.Periodo}
                          </td>
                       </tr>
                    ))}
                  </tbody>
                </table>
                
                {totalRachas > 15 && (
                  <p className="text-xs text-gray-400 mt-4 italic">* Mostrando vista abreviada (15 récords). El archivo Excel descargado incluirá los {totalRachas} registros intactos para su facturación.</p>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-zinc-900 border-t border-zinc-800 p-5 flex justify-end gap-4 shrink-0">
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="px-5 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cerrar Previsualización
              </button>
              <button 
                onClick={() => {
                  setShowPreviewModal(false);
                  handleExportExcel();
                }}
                disabled={isExporting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all"
              >
                <FileSpreadsheet className="w-5 h-5" />
                Descargar Documento Operativo (.xlsx)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
