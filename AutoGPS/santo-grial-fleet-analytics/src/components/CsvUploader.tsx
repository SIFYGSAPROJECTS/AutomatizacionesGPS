"use client";

import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { UploadCloud, FileText, CheckCircle, Save, Activity, Plus, Printer, FileSpreadsheet, X, MapPin, ArrowDown, ArrowUp, Calendar as CalendarIcon, Trash2, FolderSync, RefreshCw, Search, Layers, Radio, VideoOff, AlertTriangle, ChevronDown, ChevronUp, Car, Check } from "lucide-react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { processStreaks, RawTelemetryRow, StreakReportRow } from "@/lib/streaksAnalyzer";
import { format, differenceInDays, subDays, startOfMonth, endOfMonth, startOfYesterday, endOfYesterday } from "date-fns";
import dictionary from "@/lib/dictionary.json";
import { useFleetStore } from "@/store/useFleetStore";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import { importRawTelemetry, clearAllTelemetry } from "@/lib/db";
import { parseNavixyReport } from "@/lib/navixyXlsxParser";
import { getFileHash, normalizeLocationName, parseDateRobust } from "@/lib/utils";
import { 
  getVehicleEquipment, 
  updateVehicleEquipmentOverride, 
  enrichStreakReportWithActiveUnits, 
  cleanIdentifier,
  getActiveUnitsWithoutGps,
  DEFAULT_ACTIVE_FLEET,
  MISSING_GEOCERCA_LABEL 
} from "@/lib/fleetEquipment";

interface TableCellInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onSave'> {
  value: string | number;
  onSave: (val: any) => void;
}

const TableCellInput = memo(({ value: initialValue, onSave, ...props }: TableCellInputProps) => {
  const [val, setVal] = useState(initialValue);

  useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  const handleBlur = () => {
    if (val !== initialValue) {
      onSave(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setVal(newVal);
    // Si es tipo date, guardamos inmediatamente para recalcular al seleccionar la fecha en el calendario
    if (props.type === "date") {
      onSave(newVal);
    }
  };

  return (
    <input
      {...props}
      value={val}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
});
TableCellInput.displayName = "TableCellInput";

const IS_OFFLINE_MODE = false;

export function CsvUploader() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
  // Filtros de Fecha, Búsqueda y Equipamiento
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState<'all' | 'pending' | 'sinGps' | 'sinCamara'>('all');
  const [equipmentVersion, setEquipmentVersion] = useState(0);

  // Vistas: Por Unidades (Agrupada) o Tabla Completa
  const [activeTab, setActiveTab] = useState<'units' | 'table'>('units');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  const toggleUnitExpand = (key: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllUnits = () => {
    if (expandedUnits.size > 0) {
      setExpandedUnits(new Set());
    } else {
      setExpandedUnits(new Set(unitSummaries.map(u => u.key)));
    }
  };

  const handleToggleCamara = (consecutivo: string) => {
    const eq = getVehicleEquipment(consecutivo);
    if (!eq) return;
    const newHasCamara = !eq.hasCamara;
    updateVehicleEquipmentOverride(consecutivo, { hasCamara: newHasCamara });
    setEquipmentVersion(v => v + 1);
  };

  // Estado de Ordenamiento
  const [sortConfig, setSortConfig] = useState<{ key: keyof StreakReportRow; direction: 'asc' | 'desc' } | null>(null);

  // Zustand Global Store
  const { rawParsedData, streakReport, setFleetData, setStreakReport, availableMonths } = useFleetStore();
  const { addSnapshot } = useAnalysisHistory();

  // Auto-calcular y enriquecer reporte si hay telemetría cargada pero no hay reporte activo
  useEffect(() => {
    if (!streakReport && rawParsedData && rawParsedData.length > 0) {
      const reportResult = processStreaks(rawParsedData as any);
      const allDates = reportResult.report.flatMap((r: any) => [r.Inicio, r.Fin]).filter(Boolean).sort();
      const dateFrom = allDates[0] || filterDateFrom || "";
      const dateTo = allDates[allDates.length - 1] || filterDateTo || "";
      const enriched = enrichStreakReportWithActiveUnits(reportResult.report, dateFrom, dateTo);
      setStreakReport(enriched);
      setFleetData(rawParsedData, enriched, reportResult.auditTrail);
    }
  }, [rawParsedData, streakReport]);

  // Auto-enriquecer si hay un reporte cargado y falta alguna de las 61 unidades de la flota activa
  useEffect(() => {
    if (streakReport && streakReport.length > 0) {
      const existing = new Set(streakReport.map(r => cleanIdentifier(r.Consecutivo)));
      const existingP = new Set(streakReport.map(r => cleanIdentifier(r.Placas)));
      const hasMissing = DEFAULT_ACTIVE_FLEET.some(u => {
        const c = cleanIdentifier(u.consecutivo);
        const p = cleanIdentifier(u.placas);
        return !existing.has(c) && !existingP.has(p);
      });
      if (hasMissing) {
        const enriched = enrichStreakReportWithActiveUnits(streakReport, filterDateFrom, filterDateTo);
        setStreakReport(enriched);
      }
    }
  }, [streakReport?.length]);

  const [manualRacha, setManualRacha] = useState({
    Geocerca: "",
    Placas: "",
    Consecutivo: "",
    Vehículo: "",
    Inicio: "",
    Fin: "",
  });

  const [isSyncingFolder, setIsSyncingFolder] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const autoUpdateDictionary = async (rawData: any[]) => {
    try {
      const geocercasSet = new Set<string>();
      const placasSet = new Set<string>();
      const consecutivosSet = new Set<string>();
      const vehiculosSet = new Set<string>();
      const unidadesMap = new Map<string, { Placas: string; Consecutivo: string; Vehículo: string; Mes?: string }>();

      rawData.forEach((row: any) => {
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

        // Extraer mes del evento para la asignación mensual
        const fechaStr = findKey("Inicio", "Hora inicial", "Hora de finalización", "fecha", "Inicio ");
        let eventMonth = "";
        if (fechaStr) {
          const parsed = parseDateRobust(fechaStr);
          if (parsed && !isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, "0");
            eventMonth = `${y}-${m}`;
          }
        }

        if (placas) {
          const key = eventMonth ? `${placas}_${eventMonth}` : placas;
          unidadesMap.set(key, {
            Placas: placas,
            Consecutivo: consecutivo,
            Vehículo: vehiculo,
            ...(eventMonth ? { Mes: eventMonth } : {})
          });
        }
      });

      if (!IS_OFFLINE_MODE) {
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
        console.log("✅ Diccionario auto-actualizado con nuevas entidades.");
      }
    } catch (e) {
      console.warn("⚠️ No se pudo actualizar el diccionario:", e);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setUploadProgress(`Cargando ${files.length} archivos...`);

    try {
      const allParsedRows: Record<string, string>[] = [];
      let totalSize = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        totalSize += file.size;
        setUploadProgress(`Procesando archivo ${i + 1} de ${files.length}: ${file.name}`);

        let rawRows: Record<string, string>[] = [];
        if (file.name.toLowerCase().endsWith(".xlsx")) {
          rawRows = await parseNavixyReport(file);
        } else {
          rawRows = await new Promise<Record<string, string>[]>((resolve, reject) => {
            Papa.parse<RawTelemetryRow>(file, {
              header: true,
              skipEmptyLines: true,
              complete: (results) => resolve(results.data as Record<string, string>[]),
              error: (err) => reject(err),
            });
          });
        }

        allParsedRows.push(...rawRows);
      }

      if (allParsedRows.length === 0) throw new Error("No se encontraron registros en los archivos subidos.");

      setUploadProgress("Importando a base de datos local...");
      await importRawTelemetry(allParsedRows);
      await useFleetStore.getState().scanAvailableMonths();

      setUploadProgress("Analizando desvíos y rachas...");
      const reportResult = processStreaks(allParsedRows as any);
      
      const allDates = reportResult.report.flatMap((r: any) => [r.Inicio, r.Fin]).filter(Boolean).sort();
      const dateFrom = allDates[0] || "";
      const dateTo = allDates[allDates.length - 1] || "";
      const fileMonth = dateFrom ? dateFrom.slice(0, 7) : format(new Date(), "yyyy-MM");
      const enrichedReport = enrichStreakReportWithActiveUnits(reportResult.report, dateFrom, dateTo);

      setFleetData(allParsedRows, enrichedReport, reportResult.auditTrail);

      // Auto-aprendizaje del diccionario en base a los archivos cargados
      await autoUpdateDictionary(allParsedRows);

      if (dateFrom && dateTo) {
        useFleetStore.getState().setGlobalDateRange({ from: dateFrom, to: dateTo });
      } else {
        useFleetStore.getState().setGlobalDateRange({ from: `${fileMonth}-01`, to: `${fileMonth}-31` });
      }

      try {
        const geocercasUnicas = new Set(reportResult.report.map((r: any) => r.Geocerca));
        const vehiculosUnicos = new Set(reportResult.report.map((r: any) => r.Placas));
        let totalDays = 0;
        if (dateFrom && dateTo) {
          const d1 = new Date(dateFrom + "T00:00:00");
          const d2 = new Date(dateTo + "T00:00:00");
          totalDays = Math.max(1, differenceInDays(d2, d1) + 1);
        }
        addSnapshot(
          {
            fileName: files.length === 1 ? files[0].name : `${files.length} archivos cargados en lote`,
            fileSizeKB: Math.round(totalSize / 1024),
            totalRows: allParsedRows.length,
            streaksFound: reportResult.report.length,
            uniqueGeocercas: geocercasUnicas.size,
            uniqueVehicles: vehiculosUnicos.size,
            dateRangeFrom: dateFrom || `${fileMonth}-01`,
            dateRangeTo: dateTo || `${fileMonth}-31`,
            totalDaysAnalyzed: totalDays,
          },
          { streakReport: enrichedReport, auditTrail: reportResult.auditTrail }
        );
      } catch (e) {
        console.warn("⚠️ No se pudo guardar snapshot:", e);
      }

      setUploadProgress("");
      alert(`✨ Éxito: Se procesaron ${files.length} archivos y se importaron ${allParsedRows.length} registros.`);
    } catch (e) {
      console.error("Error importando lote de archivos:", e);
      alert("Hubo un error al procesar o guardar los archivos.");
    } finally {
      setIsProcessing(false);
      setUploadProgress("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const handleLocalSync = async () => {
    setIsSyncingFolder(true);
    try {
      const resp = await fetch("/api/reports/process-local-folder", {
        method: "POST",
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || "Error al sincronizar");
      }

      const result = await resp.json();
      const rawRows = result.rawRows;

      if (rawRows.length === 0) {
        alert("No se encontraron registros de telemetría válidos en la carpeta local.");
        return;
      }

      await importRawTelemetry(rawRows);
      await useFleetStore.getState().scanAvailableMonths();

      const reportResult = processStreaks(rawRows);
      const allDates = reportResult.report.flatMap((r: any) => [r.Inicio, r.Fin]).filter(Boolean).sort();
      const dateFrom = allDates[0] || "";
      const dateTo = allDates[allDates.length - 1] || "";
      const fileMonth = dateFrom ? dateFrom.slice(0, 7) : format(new Date(), "yyyy-MM");
      const enrichedReport = enrichStreakReportWithActiveUnits(reportResult.report, dateFrom, dateTo);

      setFleetData(rawRows, enrichedReport, reportResult.auditTrail);

      // Auto-aprendizaje del diccionario en base a los reportes sincronizados
      await autoUpdateDictionary(rawRows);

      if (dateFrom && dateTo) {
        useFleetStore.getState().setGlobalDateRange({ from: dateFrom, to: dateTo });
      } else {
        useFleetStore.getState().setGlobalDateRange({ from: `${fileMonth}-01`, to: `${fileMonth}-31` });
      }

      try {
        const geocercasUnicas = new Set(reportResult.report.map((r: any) => r.Geocerca));
        const vehiculosUnicos = new Set(reportResult.report.map((r: any) => r.Placas));
        let totalDays = 0;
        if (dateFrom && dateTo) {
          const d1 = new Date(dateFrom + "T00:00:00");
          const d2 = new Date(dateTo + "T00:00:00");
          totalDays = Math.max(1, differenceInDays(d2, d1) + 1);
        }
        addSnapshot(
          {
            fileName: `Sincronización de Carpeta (${result.filesProcessed.length} archivos)`,
            fileSizeKB: 0,
            totalRows: rawRows.length,
            streaksFound: reportResult.report.length,
            uniqueGeocercas: geocercasUnicas.size,
            uniqueVehicles: vehiculosUnicos.size,
            dateRangeFrom: dateFrom || `${fileMonth}-01`,
            dateRangeTo: dateTo || `${fileMonth}-31`,
            totalDaysAnalyzed: totalDays,
          },
          { streakReport: enrichedReport, auditTrail: reportResult.auditTrail }
        );
      } catch (e) {
        console.warn("⚠️ No se pudo guardar snapshot de sincronización:", e);
      }

      alert(`✨ Sincronización Exitosa:\n\n- Archivos procesados: ${result.filesProcessed.length}\n- Registros cargados: ${result.totalRecords}\n\nLos datos ya están disponibles en los paneles.`);
    } catch (e: any) {
      console.error("Error sincronizando carpeta:", e);
      alert(`Error al sincronizar la carpeta local:\n${e.message}`);
    } finally {
      setIsSyncingFolder(false);
    }
  };

  const handleProcessTelemtry = () => {
    const rawData = useFleetStore.getState().rawParsedData;
    if (!rawData) return;
    setIsProcessing(true);
    setTimeout(async () => {
      // El nuevo processStreaks devuelve report y auditTrail
      const reportResult = processStreaks(rawData as any);
      const allDates = reportResult.report.flatMap(r => [r.Inicio, r.Fin]).filter(Boolean).sort();
      const dateFrom = allDates[0] || "";
      const dateTo = allDates[allDates.length - 1] || "";
      const enrichedReport = enrichStreakReportWithActiveUnits(reportResult.report, dateFrom, dateTo);
      setStreakReport(enrichedReport);
      setFleetData(rawData, enrichedReport, reportResult.auditTrail);

      // === SNAPSHOT AL HISTORIAL ===
      try {
        const geocercasUnicas = new Set(reportResult.report.map(r => r.Geocerca));
        const vehiculosUnicos = new Set(reportResult.report.map(r => r.Placas));
        let totalDays = 0;
        if (dateFrom && dateTo) {
          const d1 = new Date(dateFrom + "T00:00:00");
          const d2 = new Date(dateTo + "T00:00:00");
          totalDays = Math.max(1, differenceInDays(d2, d1) + 1);
        }
        addSnapshot(
          {
            fileName: "Reprocesamiento Local",
            fileSizeKB: 0,
            totalRows: rawData.length,
            streaksFound: reportResult.report.length,
            uniqueGeocercas: geocercasUnicas.size,
            uniqueVehicles: vehiculosUnicos.size,
            dateRangeFrom: dateFrom,
            dateRangeTo: dateTo,
            totalDaysAnalyzed: totalDays,
          },
          { streakReport: enrichedReport, auditTrail: reportResult.auditTrail }
        );
        console.log("📸 Snapshot de reprocesamiento guardado.");
      } catch (e) {
        console.warn("⚠️ No se pudo guardar snapshot:", e);
      }

      // === AUTO-APRENDIZAJE DEL DICCIONARIO ===
      await autoUpdateDictionary(rawData);

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

  // Lógica de Filtrado por Fecha, Búsqueda, Equipamiento y Ordenamiento
  const filteredStreakReport = useMemo(() => {
    return (streakReport || []).filter(row => {
      // 1. Filtro de Fechas (Comprueba si el intervalo de la racha intersecta la ventana seleccionada)
      if (filterDateFrom && row.Fin < filterDateFrom) return false;
      if (filterDateTo && row.Inicio > filterDateTo) return false;

      // 2. Filtro de Búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = 
          (row.Geocerca || "").toLowerCase().includes(q) ||
          (row.Placas || "").toLowerCase().includes(q) ||
          (row.Consecutivo || "").toLowerCase().includes(q) ||
          (row.Vehículo || "").toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 3. Filtro de Equipamiento / Pendientes
      if (equipmentFilter === 'pending') {
        return row.Geocerca.startsWith("⚠️") || row.Geocerca.includes("FALTA ASIGNAR");
      }
      if (equipmentFilter === 'sinGps') {
        const eq = getVehicleEquipment(row.Consecutivo || row.Placas);
        return eq && !eq.hasGps;
      }
      if (equipmentFilter === 'sinCamara') {
        const eq = getVehicleEquipment(row.Consecutivo || row.Placas);
        return eq && !eq.hasCamara;
      }

      return true;
    }).sort((a, b) => {
      if (!sortConfig) {
        // Mostrar advertencias de geocerca arriba por defecto
        const aWarn = a.Geocerca.startsWith("⚠️") || a.Geocerca.includes("FALTA ASIGNAR");
        const bWarn = b.Geocerca.startsWith("⚠️") || b.Geocerca.includes("FALTA ASIGNAR");
        if (aWarn && !bWarn) return -1;
        if (!aWarn && bWarn) return 1;
        return 0;
      }
      const { key, direction } = sortConfig;
      const valA = a[key];
      const valB = b[key];

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [streakReport, filterDateFrom, filterDateTo, sortConfig, searchQuery, equipmentFilter, equipmentVersion]);

  const pendingCount = useMemo(() => {
    return (streakReport || []).filter(r => r.Geocerca.startsWith("⚠️") || r.Geocerca.includes("FALTA ASIGNAR")).length;
  }, [streakReport]);

  const sinGpsCount = useMemo(() => {
    return (streakReport || []).filter(r => {
      const eq = getVehicleEquipment(r.Consecutivo || r.Placas);
      return eq && !eq.hasGps;
    }).length;
  }, [streakReport, equipmentVersion]);

  const sinCamaraCount = useMemo(() => {
    return (streakReport || []).filter(r => {
      const eq = getVehicleEquipment(r.Consecutivo || r.Placas);
      return eq && !eq.hasCamara;
    }).length;
  }, [streakReport, equipmentVersion]);

  // Agrupación ejecutiva por Unidad (Métricas de Asistencia y Geocercas)
  const unitSummaries = useMemo(() => {
    if (!filteredStreakReport) return [];

    const map = new Map<string, {
      key: string;
      consecutivo: string;
      placas: string;
      vehiculo: string;
      rachas: StreakReportRow[];
      diasEnGeocerca: number;
      diasSinGeocerca: number;
      geocercasSet: Set<string>;
      hasPendingGeocerca: boolean;
    }>();

    filteredStreakReport.forEach(r => {
      const c = r.Consecutivo?.trim() || "";
      const p = r.Placas?.trim() || "";
      const key = cleanIdentifier(c) || cleanIdentifier(p) || r.Vehículo || "DESCONOCIDO";

      if (!map.has(key)) {
        map.set(key, {
          key,
          consecutivo: c,
          placas: p,
          vehiculo: r.Vehículo || "",
          rachas: [],
          diasEnGeocerca: 0,
          diasSinGeocerca: 0,
          geocercasSet: new Set<string>(),
          hasPendingGeocerca: false,
        });
      }

      const item = map.get(key)!;
      item.rachas.push(r);
      const isMissing = r.Geocerca.startsWith("⚠️") || r.Geocerca.includes("FALTA ASIGNAR");
      const dias = Number(r["Días asistidos"]) || 0;
      if (isMissing) {
        item.diasSinGeocerca += dias;
        item.hasPendingGeocerca = true;
      } else {
        item.diasEnGeocerca += dias;
        if (r.Geocerca) item.geocercasSet.add(r.Geocerca);
      }
    });

    const list = Array.from(map.values()).map(item => ({
      ...item,
      geocercasUnicas: Array.from(item.geocercasSet),
      equipment: getVehicleEquipment(item.consecutivo || item.placas),
      totalDias: item.diasEnGeocerca + item.diasSinGeocerca,
    }));

    // Ordenar: primero las que tienen geocercas pendientes de asignar, luego por consecutivo
    list.sort((a, b) => {
      if (a.hasPendingGeocerca && !b.hasPendingGeocerca) return -1;
      if (!a.hasPendingGeocerca && b.hasPendingGeocerca) return 1;
      return (a.consecutivo || a.placas).localeCompare(b.consecutivo || b.placas, undefined, { numeric: true });
    });

    return list;
  }, [filteredStreakReport, equipmentVersion]);

  const unitsWithPending = useMemo(() => {
    return unitSummaries.filter(u => u.hasPendingGeocerca).length;
  }, [unitSummaries]);

  const handleSort = (key: keyof StreakReportRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const setQuickRange = (type: '7d' | 'thisMonth' | 'lastMonth' | 'all') => {
    const today = new Date();
    if (type === '7d') {
      setFilterDateFrom(format(subDays(today, 7), "yyyy-MM-dd"));
      setFilterDateTo(format(today, "yyyy-MM-dd"));
    } else if (type === 'thisMonth') {
      setFilterDateFrom(format(startOfMonth(today), "yyyy-MM-dd"));
      setFilterDateTo(format(endOfMonth(today), "yyyy-MM-dd"));
    } else if (type === 'lastMonth') {
      const lastMonth = subDays(startOfMonth(today), 1);
      setFilterDateFrom(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
      setFilterDateTo(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
    } else {
      setFilterDateFrom("");
      setFilterDateTo("");
    }
  };

  const getSortIcon = (key: keyof StreakReportRow) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowDown className="w-3 h-3 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-orange-500" /> : <ArrowDown className="w-3 h-3 text-orange-500" />;
  };

  const totalRachas = streakReport ? streakReport.length : 0;
  const geocercasUnicas = streakReport ? new Set(streakReport.map(r => r.Geocerca)).size : 0;
  const unidadesUnicas = streakReport ? new Set(streakReport.map(r => r.Vehículo)).size : 0;

  const handleCellEdit = (originalRow: StreakReportRow, field: keyof StreakReportRow, value: string | number) => {
    if (!streakReport) return;
    const index = streakReport.indexOf(originalRow);
    if (index === -1) return;

    const updated = [...streakReport];
    const row = { ...updated[index], [field]: value };

    // Si se edita la fecha de Inicio o de Fin, recalculamos los días y el Periodo formateado
    if (field === 'Inicio' || field === 'Fin') {
      if (row.Inicio && row.Fin) {
        const start = new Date(row.Inicio + "T00:00:00");
        const end = new Date(row.Fin + "T00:00:00");
        
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diasCalendario = differenceInDays(end, start) + 1;
          if (diasCalendario >= 0) {
            row["Días asistidos"] = diasCalendario;
            row["Días calendario"] = diasCalendario;
            row.Periodo = `${format(start, "dd/MM/yyyy")} - ${format(end, "dd/MM/yyyy")}`;
          }
        }
      }
    }

    updated[index] = row;
    setStreakReport(updated);
  };

  const handleDeleteRow = (rowToDelete: StreakReportRow) => {
    if (!streakReport) return;
    if (confirm("¿Estás seguro de eliminar esta racha?")) {
      const updated = streakReport.filter(r => r !== rowToDelete);
      setStreakReport(updated);
    }
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
    filteredStreakReport.forEach(r => {
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
         const geoVal = String(row.getCell(1).value || '');
         const isPending = geoVal.includes("FALTA ASIGNAR") || geoVal.startsWith("⚠️");

         row.eachCell(cell => {
           cell.alignment = { vertical: 'middle' };
           cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
           if (isPending) {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2E9' } };
           }
         });
         if (isPending) {
           row.getCell(1).font = { color: { argb: 'FFC2410C' }, bold: true, name: 'Calibri' };
         }
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

    if (!IS_OFFLINE_MODE) {
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Columna 1: Subir archivos manuales (Arrastrar/Seleccionar) */}
          <div 
            className={`relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-2xl transition-all duration-300 min-h-[300px]
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
              multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              onChange={handleChange}
            />
            
            {isProcessing ? (
              <div className="flex flex-col items-center text-center animate-in fade-in zoom-in duration-300 z-10">
                <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4 animate-spin">
                  <RefreshCw className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-1">Procesando Lote de Archivos</h3>
                <p className="text-zinc-400 text-xs max-w-xs px-4">
                  {uploadProgress}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center pointer-events-none">
                <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mb-4 border border-zinc-800 shadow-xl">
                  <UploadCloud className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">Subir Archivos</h3>
                <p className="text-zinc-500 text-xs max-w-xs">
                  Arrastra y suelta uno o **múltiples archivos CSV o XLSX** aquí, o haz clic para seleccionarlos.
                </p>
              </div>
            )}
          </div>

          {/* Columna 2: Sincronización Automática desde Carpeta Local */}
          <div className="flex flex-col items-center justify-center p-10 border-2 border-solid border-zinc-800 bg-[#050505] hover:bg-[#0a0a0a] rounded-2xl transition-all duration-300 hover:border-orange-500/50 min-h-[300px]">
            {isSyncingFolder ? (
              <div className="flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4 animate-spin">
                  <RefreshCw className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-1">Sincronizando Carpeta Local</h3>
                <p className="text-zinc-400 text-xs max-w-xs">
                  Escaneando subcarpetas de OneDrive y ejecutando limpieza de PowerQuery...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mb-4 border border-zinc-800 shadow-xl">
                  <FolderSync className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">Sincronizar Carpeta Local</h3>
                <p className="text-zinc-500 text-xs max-w-xs mb-6">
                  Extrae automáticamente todos los reportes Excel crudos colocados en su carpeta local de tableros de forma centralizada.
                </p>
                <button 
                  onClick={handleLocalSync}
                  className="relative px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-black rounded-xl font-bold transition-all shadow-lg shadow-orange-600/20 group overflow-hidden text-xs"
                >
                  <span className="relative flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Sincronizar Directorio
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

      {/* BOTÓN DE LIMPIEZA PROFUNDA (Visible si hay meses disponibles o datos en el store) */}
      {(rawParsedData && rawParsedData.length > 0 || availableMonths.length > 0) && (
        <div className="flex justify-end px-2">
          <button 
            onClick={async () => {
              if (confirm("⚠️ ¿ESTÁS SEGURO? Esto borrará TODO el historial de telemetría de todos los meses. Tus geocercas y vehículos NO se borrarán.")) {
                await clearAllTelemetry();
                useFleetStore.getState().clearData();
                await useFleetStore.getState().scanAvailableMonths();
                alert("✨ Sistema purgado. Ahora puedes subir los archivos de Enero a Marzo desde cero.");
              }
            }}
            className="flex items-center gap-2 text-[10px] font-black text-zinc-600 hover:text-red-500 transition-colors uppercase tracking-widest"
          >
            <Trash2 className="w-3 h-3" />
            Purgar Todo el Historial de Telemetría
          </button>
        </div>
      )}

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
            
            <div className="flex flex-wrap items-center gap-3">
               {/* PRESETS RÁPIDOS */}
               <div className="flex bg-zinc-900/50 border border-zinc-800 rounded-lg p-1 gap-1">
                 <button onClick={() => setQuickRange('7d')} className="px-3 py-1 text-[10px] font-bold text-zinc-400 hover:text-orange-500 hover:bg-zinc-800 rounded transition-all">ÚLT. 7 DÍAS</button>
                 <button onClick={() => setQuickRange('thisMonth')} className="px-3 py-1 text-[10px] font-bold text-zinc-400 hover:text-orange-500 hover:bg-zinc-800 rounded transition-all">ESTE MES</button>
                 <button onClick={() => setQuickRange('lastMonth')} className="px-3 py-1 text-[10px] font-bold text-zinc-400 hover:text-orange-500 hover:bg-zinc-800 rounded transition-all">MES PASADO</button>
                 <button onClick={() => setQuickRange('all')} className="px-3 py-1 text-[10px] font-bold text-orange-500 hover:bg-orange-500/10 rounded transition-all">TODOS</button>
               </div>

               {/* FILTROS DE FECHA */}
               <div className="flex items-center gap-2 bg-[#0a0a0a] border border-zinc-800 rounded-lg px-3 py-1.5 shadow-sm">
                  <CalendarIcon className="w-4 h-4 text-orange-500" />
                  <input 
                    type="date" 
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="bg-transparent text-xs text-zinc-300 outline-none css-date-picker"
                  />
                  <span className="text-zinc-600">—</span>
                  <input 
                    type="date" 
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="bg-transparent text-xs text-zinc-300 outline-none css-date-picker"
                  />
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

          {/* BARRA DE FILTROS RÁPIDOS Y ESTADO DE FLOTA */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0a0a0a] border border-zinc-800 p-3 rounded-xl">
            {/* Buscador en vivo */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar unidad, placas, modelo o geocerca..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#111] border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 rounded-lg pl-9 pr-8 py-2 outline-none focus:border-orange-500/50"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Chips de filtro */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setEquipmentFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  equipmentFilter === 'all'
                    ? "bg-zinc-800 text-white border border-zinc-700 shadow"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent"
                }`}
              >
                Todos ({filteredStreakReport.length})
              </button>

              <button
                onClick={() => setEquipmentFilter('pending')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  equipmentFilter === 'pending'
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow"
                    : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent"
                }`}
              >
                <span>⚠️ Falta Geocerca</span>
                <span className="bg-amber-500/30 text-amber-200 px-1.5 py-0.2 rounded-full text-[10px]">
                  {pendingCount}
                </span>
              </button>

              <button
                onClick={() => setEquipmentFilter('sinGps')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  equipmentFilter === 'sinGps'
                    ? "bg-orange-500/20 text-orange-300 border border-orange-500/50 shadow"
                    : "text-orange-400/80 hover:text-orange-300 hover:bg-orange-500/10 border border-transparent"
                }`}
              >
                <span>🛰️ Sin GPS</span>
                <span className="bg-orange-500/30 text-orange-200 px-1.5 py-0.2 rounded-full text-[10px]">
                  {sinGpsCount}
                </span>
              </button>

              <button
                onClick={() => setEquipmentFilter('sinCamara')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  equipmentFilter === 'sinCamara'
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow"
                    : "text-purple-400/80 hover:text-purple-300 hover:bg-purple-500/10 border border-transparent"
                }`}
              >
                <span>📷 Sin Cámara</span>
                <span className="bg-purple-500/30 text-purple-200 px-1.5 py-0.2 rounded-full text-[10px]">
                  {sinCamaraCount}
                </span>
              </button>

              {/* Botón sincronizar flota activa */}
              <button
                onClick={() => {
                  if (!streakReport) return;
                  const enriched = enrichStreakReportWithActiveUnits(streakReport, filterDateFrom, filterDateTo);
                  setStreakReport(enriched);
                }}
                title="Sincronizar e incluir en la tabla todas las unidades activas en flota"
                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 text-zinc-300 hover:text-emerald-400 rounded-lg text-xs font-medium transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sincronizar Flota (61)</span>
              </button>
            </div>
          </div>

          {/* SELECTOR DE VISTA: POR UNIDADES O TABLA COMPLETA */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0a0a0a] border border-zinc-800 p-2.5 rounded-xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('units')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'units'
                    ? "bg-orange-500 text-black shadow-lg shadow-orange-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Car className="w-4 h-4" />
                <span>Vista por Unidades ({unitSummaries.length})</span>
                {unitsWithPending > 0 && (
                  <span className="bg-black/30 text-black px-1.5 py-0.5 rounded-full text-[10px]">
                    {unitsWithPending} pend.
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('table')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'table'
                    ? "bg-orange-500 text-black shadow-lg shadow-orange-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Tabla Completa ({filteredStreakReport.length} rachas)</span>
              </button>
            </div>

            {activeTab === 'units' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAllUnits}
                  className="text-xs text-zinc-400 hover:text-orange-400 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 transition-colors"
                >
                  {expandedUnits.size > 0 ? "▲ Colapsar todos los desgloses" : "▼ Desglosar todas las unidades"}
                </button>
              </div>
            )}
          </div>

          {/* VISTA 1: POR UNIDADES CON DESGLOSE ACORDEÓN */}
          {activeTab === 'units' && (
            <div className="space-y-4">
              {unitSummaries.length === 0 ? (
                <div className="p-8 text-center bg-[#0a0a0a] border border-zinc-800 rounded-xl text-zinc-400 text-sm">
                  No se encontraron unidades con los filtros seleccionados.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {unitSummaries.map((unit) => {
                    const isExpanded = expandedUnits.has(unit.key);
                    const eq = unit.equipment;
                    return (
                      <div
                        key={unit.key}
                        className={`bg-[#0a0a0a] border rounded-xl overflow-hidden transition-all shadow-md ${
                          unit.hasPendingGeocerca
                            ? "border-amber-500/50 hover:border-amber-500 shadow-amber-950/20"
                            : "border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        {/* CABECERA DE LA TARJETA DE UNIDAD */}
                        <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Info Unidad */}
                          <div className="flex items-start sm:items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              unit.hasPendingGeocerca 
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400" 
                                : "bg-zinc-900 border-zinc-800 text-zinc-300"
                            }`}>
                              <Car className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-black text-white tracking-wide">
                                  {unit.consecutivo || unit.placas}
                                </span>
                                {unit.placas && unit.consecutivo && (
                                  <span className="text-xs font-mono font-semibold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                    {unit.placas}
                                  </span>
                                )}
                                {eq?.activa && (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    Activa
                                  </span>
                                )}
                                {eq && !eq.hasGps && (
                                  <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-medium">
                                    🛰️ Sin GPS
                                  </span>
                                )}
                                {eq && !eq.hasCamara && (
                                  <button
                                    onClick={() => handleToggleCamara(unit.consecutivo)}
                                    title="Clic para marcar con cámara"
                                    className="text-[10px] bg-purple-500/15 text-purple-300 hover:text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded font-medium"
                                  >
                                    📷 Sin Cámara
                                  </button>
                                )}
                                {unit.hasPendingGeocerca && (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-bold">
                                    ⚠️ Requiere Asignar Geocerca
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400 mt-1">
                                {unit.vehiculo && <span className="text-zinc-300 font-medium">{unit.vehiculo}</span>}
                                {eq?.conductor && eq.conductor !== "Sin Asignar" && (
                                  <span className="text-zinc-500 italic">• Conductor: {eq.conductor}</span>
                                )}
                                {eq?.departamento && <span className="text-zinc-600">• {eq.departamento}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Métricas de Asistencia: Cuántos días en geocercas vs cuántos sin geocerca */}
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 bg-[#111] border border-zinc-800 rounded-xl px-3.5 py-2">
                              <div className="text-left">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">En Geocerca</div>
                                <div className="text-sm font-black text-emerald-400">
                                  {unit.diasEnGeocerca} <span className="text-xs font-normal text-zinc-400">días</span>
                                </div>
                              </div>
                              <span className="text-zinc-700">|</span>
                              <div className="text-left">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Sin Geocerca</div>
                                <div className={`text-sm font-black ${unit.diasSinGeocerca > 0 ? "text-amber-400 font-bold" : "text-zinc-400"}`}>
                                  {unit.diasSinGeocerca} <span className="text-xs font-normal text-zinc-400">días</span>
                                </div>
                              </div>
                              <span className="text-zinc-700">|</span>
                              <div className="text-left">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Geocercas</div>
                                <div className="text-sm font-black text-orange-400" title={unit.geocercasUnicas.join(", ")}>
                                  {unit.geocercasUnicas.length}
                                </div>
                              </div>
                            </div>

                            {/* Botón de Desglose */}
                            <button
                              type="button"
                              onClick={() => toggleUnitExpand(unit.key)}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                                isExpanded
                                  ? "bg-orange-500/10 border-orange-500/50 text-orange-400 shadow-sm"
                                  : "bg-zinc-900 border-zinc-800 hover:border-orange-500/40 text-zinc-200 hover:text-white"
                              }`}
                            >
                              <span>{isExpanded ? "Ocultar desglose" : "Desglosar geocercas"}</span>
                              <span className="bg-black/40 text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">
                                {unit.rachas.length}
                              </span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-orange-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                            </button>
                          </div>
                        </div>

                        {/* PANEL DESPLEGABLE DE DESGLOSE POR UNIDAD */}
                        {isExpanded && (
                          <div className="border-t border-zinc-800/80 bg-black/40 p-4 sm:p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between">
                              <h5 className="text-xs uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-orange-500" />
                                Detalle de periodos y geocercas registradas ({unit.rachas.length} tramos)
                              </h5>
                              <span className="text-[11px] text-zinc-500">
                                Puedes escribir o cambiar la geocerca directamente en cada renglón
                              </span>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-[#080808]">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-[#121212] text-zinc-500 border-b border-zinc-800 uppercase tracking-widest text-[9px]">
                                  <tr>
                                    <th className="px-3 py-2.5">Geocerca Asignada</th>
                                    <th className="px-3 py-2.5">Inicio</th>
                                    <th className="px-3 py-2.5">Fin</th>
                                    <th className="px-3 py-2.5">Periodo</th>
                                    <th className="px-3 py-2.5 text-center">Días Asist.</th>
                                    <th className="px-3 py-2.5 text-center">Días Cal.</th>
                                    <th className="px-3 py-2.5 text-center">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/40">
                                  {unit.rachas.map((row, rIdx) => {
                                    const isMissing = row.Geocerca.startsWith("⚠️") || row.Geocerca.includes("FALTA ASIGNAR");
                                    return (
                                      <tr
                                        key={rIdx}
                                        className={`transition-colors ${
                                          isMissing 
                                            ? "bg-amber-950/30 hover:bg-amber-950/40 border-l-4 border-l-amber-500" 
                                            : "hover:bg-zinc-900/60 border-l-4 border-l-transparent"
                                        }`}
                                      >
                                        <td className="px-3 py-2 whitespace-nowrap min-w-[260px]">
                                          <div className="flex items-center gap-1.5">
                                            {isMissing ? (
                                              <span className="text-amber-400 font-bold shrink-0">⚠️</span>
                                            ) : (
                                              <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                            )}
                                            <TableCellInput
                                              list="geocercas-list"
                                              value={row.Geocerca}
                                              onSave={(val) => handleCellEdit(row, 'Geocerca', val)}
                                              placeholder="Asignar geocerca..."
                                              className={`w-full bg-[#141414] border rounded px-2.5 py-1 text-xs outline-none transition-all ${
                                                isMissing
                                                  ? "border-amber-500/60 text-amber-300 font-bold focus:border-amber-400"
                                                  : "border-zinc-800 text-zinc-200 focus:border-orange-500/60"
                                              }`}
                                            />
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          <TableCellInput
                                            type="date"
                                            value={row.Inicio}
                                            onSave={(val) => handleCellEdit(row, 'Inicio', val)}
                                            className="bg-transparent border border-transparent hover:border-zinc-800 focus:border-orange-500/50 rounded px-2 py-0.5 text-zinc-300 outline-none css-date-picker"
                                          />
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          <TableCellInput
                                            type="date"
                                            value={row.Fin}
                                            onSave={(val) => handleCellEdit(row, 'Fin', val)}
                                            className="bg-transparent border border-transparent hover:border-zinc-800 focus:border-orange-500/50 rounded px-2 py-0.5 text-zinc-300 outline-none css-date-picker"
                                          />
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-zinc-400 font-mono">
                                          {row.Periodo}
                                        </td>
                                        <td className="px-3 py-2 text-center whitespace-nowrap font-bold text-orange-400">
                                          <TableCellInput
                                            type="number"
                                            value={row["Días asistidos"]}
                                            onSave={(val) => handleCellEdit(row, 'Días asistidos', parseInt(val) || 0)}
                                            className="w-12 text-center bg-transparent border border-transparent focus:border-orange-500/50 rounded py-0.5 text-orange-400 font-bold text-xs"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-center whitespace-nowrap text-zinc-400">
                                          <TableCellInput
                                            type="number"
                                            value={row["Días calendario"]}
                                            onSave={(val) => handleCellEdit(row, 'Días calendario', parseInt(val) || 0)}
                                            className="w-12 text-center bg-transparent border border-transparent focus:border-orange-500/50 rounded py-0.5 text-zinc-400 text-xs"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-center whitespace-nowrap">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteRow(row)}
                                            className="text-zinc-600 hover:text-red-400 p-1 rounded transition-colors"
                                            title="Eliminar este periodo"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VISTA 2: TABLA COMPLETA TRADICIONAL */}
          {activeTab === 'table' && (
            <>
              {/* VISTA DESKTOP: Tabla auto-layout, columnas se ajustan al contenido */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800 bg-[#050505] shadow-xl">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-zinc-500 bg-[#0a0a0a] border-b border-zinc-800 uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Geocerca')}>
                    <div className="flex items-center gap-2">Geocerca {getSortIcon('Geocerca')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Placas')}>
                    <div className="flex items-center gap-2">Placas {getSortIcon('Placas')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Consecutivo')}>
                    <div className="flex items-center gap-2">Consecutivo {getSortIcon('Consecutivo')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Vehículo')}>
                    <div className="flex items-center gap-2">Vehículo / Equipamiento {getSortIcon('Vehículo')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Inicio')}>
                    <div className="flex items-center gap-2">Inicio {getSortIcon('Inicio')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Fin')}>
                    <div className="flex items-center gap-2">Fin {getSortIcon('Fin')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Periodo')}>
                    <div className="flex items-center gap-2">Periodo {getSortIcon('Periodo')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap text-center cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Días asistidos')}>
                    <div className="flex items-center justify-center gap-2">Días Asis. {getSortIcon('Días asistidos')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap text-center cursor-pointer hover:bg-zinc-900 transition-colors" onClick={() => handleSort('Días calendario')}>
                    <div className="flex items-center justify-center gap-2">Días Cal. {getSortIcon('Días calendario')}</div>
                  </th>
                  <th className="px-4 py-3.5 font-medium whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">Acciones</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredStreakReport.map((row, i) => {
                  const isMissingGeo = row.Geocerca.startsWith("⚠️") || row.Geocerca.includes("FALTA ASIGNAR");
                  const eq = getVehicleEquipment(row.Consecutivo || row.Placas);
                  return (
                    <tr 
                      key={i} 
                      className={`transition-colors text-zinc-300 ${
                        isMissingGeo 
                          ? "bg-amber-950/20 border-l-4 border-l-amber-500 hover:bg-amber-950/30" 
                          : "hover:bg-zinc-900/70 border-l-4 border-l-transparent"
                      }`}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isMissingGeo && (
                            <span className="text-amber-500 shrink-0 text-base" title="Recordatorio: Falta asignar la geocerca oficial de este proyecto">
                              ⚠️
                            </span>
                          )}
                          <TableCellInput 
                            list="geocercas-list" 
                            value={row.Geocerca} 
                            onSave={(val) => handleCellEdit(row, 'Geocerca', val)} 
                            size={Math.max(row.Geocerca.length, 14)} 
                            className={`bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-sm ${
                              isMissingGeo ? "text-amber-400 font-bold placeholder:text-amber-500/60" : "text-orange-500 font-medium"
                            }`} 
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <TableCellInput list="placas-list" value={row.Placas} onSave={(val) => handleCellEdit(row, 'Placas', val)} size={Math.max(row.Placas.length, 8)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-sm font-mono" />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <TableCellInput list="consecutivos-list" value={row.Consecutivo} onSave={(val) => handleCellEdit(row, 'Consecutivo', val)} size={Math.max(row.Consecutivo.length, 8)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-zinc-200 font-bold text-sm" />
                          {eq?.activa && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Activa
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <TableCellInput list="vehiculos-list" value={row.Vehículo} onSave={(val) => handleCellEdit(row, 'Vehículo', val)} size={Math.max(row.Vehículo.length, 12)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-zinc-300 text-sm" />
                          
                          {/* BADGES VISUALES DE EQUIPAMIENTO: SIN GPS / SIN CÁMARA */}
                          <div className="flex items-center gap-1.5">
                            {eq && !eq.hasGps && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium shadow-sm" title="Unidad operativa sin dispositivo GPS instalado">
                                🛰️ Sin GPS
                              </span>
                            )}
                            {eq && !eq.hasCamara && (
                              <button 
                                onClick={() => handleToggleCamara(row.Consecutivo)}
                                title="Haz clic para marcar con cámara instalada"
                                className="inline-flex items-center gap-1 text-[10px] bg-purple-500/15 text-purple-400 hover:text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-medium transition-colors shadow-sm"
                              >
                                📷 Sin Cámara
                              </button>
                            )}
                            {eq && eq.hasCamara && (
                              <button
                                onClick={() => handleToggleCamara(row.Consecutivo)}
                                title="Cámara instalada (clic para marcar como sin cámara)"
                                className="opacity-0 hover:opacity-100 transition-opacity text-[10px] text-zinc-500 hover:text-purple-400"
                              >
                                + Marcar sin cámara
                              </button>
                            )}
                            {eq?.conductor && eq.conductor !== "Sin Asignar" && (
                              <span className="text-[10px] text-zinc-500 italic max-w-[150px] truncate" title={`Asignado a: ${eq.conductor}`}>
                                • {eq.conductor}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <TableCellInput type="date" value={row.Inicio} onSave={(val) => handleCellEdit(row, 'Inicio', val)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-sm css-date-picker" />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <TableCellInput type="date" value={row.Fin} onSave={(val) => handleCellEdit(row, 'Fin', val)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-sm css-date-picker" />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <TableCellInput value={row.Periodo} onSave={(val) => handleCellEdit(row, 'Periodo', val)} size={Math.max(row.Periodo.length, 15)} className="bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded px-2 py-1 transition-all text-zinc-400 text-sm" />
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <TableCellInput type="number" value={row["Días asistidos"]} onSave={(val) => handleCellEdit(row, 'Días asistidos', parseInt(val) || 0)} className="w-14 text-center bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded py-1 transition-all text-orange-500 font-bold text-sm" />
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <TableCellInput type="number" value={row["Días calendario"]} onSave={(val) => handleCellEdit(row, 'Días calendario', parseInt(val) || 0)} className="w-14 text-center bg-transparent border border-transparent focus:border-orange-500/50 focus:bg-[#111] outline-none rounded py-1 transition-all text-zinc-300 font-bold text-sm" />
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <button 
                          onClick={() => handleDeleteRow(row)} 
                          title="Eliminar racha"
                          className="text-zinc-500 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* VISTA MOBILE: Cards apiladas */}
          <div className="md:hidden space-y-3">
            {filteredStreakReport.map((row, i) => {
              const isMissingGeo = row.Geocerca.startsWith("⚠️") || row.Geocerca.includes("FALTA ASIGNAR");
              const eq = getVehicleEquipment(row.Consecutivo || row.Placas);
              return (
                <div 
                  key={i} 
                  className={`bg-[#0a0a0a] border rounded-xl p-4 space-y-3 transition-colors ${
                    isMissingGeo ? "border-amber-500/50 bg-amber-950/20 shadow-lg shadow-amber-950/20" : "border-zinc-800 hover:border-orange-500/30"
                  }`}
                >
                  {/* Badges de estado superior */}
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {eq?.activa && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
                          Activa
                        </span>
                      )}
                      {eq && !eq.hasGps && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-medium">
                          🛰️ Sin GPS
                        </span>
                      )}
                      {eq && !eq.hasCamara && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-medium">
                          📷 Sin Cámara
                        </span>
                      )}
                    </div>
                    {eq?.conductor && eq.conductor !== "Sin Asignar" && (
                      <span className="text-[10px] text-zinc-400 truncate max-w-[140px] italic">
                        {eq.conductor}
                      </span>
                    )}
                  </div>

                  {/* Geocerca + badges días */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 flex items-center gap-1.5">
                      {isMissingGeo && <span className="text-amber-500 text-sm">⚠️</span>}
                      <TableCellInput 
                        list="geocercas-list" 
                        value={row.Geocerca} 
                        onSave={(val) => handleCellEdit(row, 'Geocerca', val)} 
                        className={`flex-1 bg-transparent font-semibold text-sm outline-none border-b border-transparent focus:border-orange-500/50 pb-0.5 ${
                          isMissingGeo ? "text-amber-400 font-bold" : "text-orange-500"
                        }`} 
                      />
                    </div>
                    <div className="flex gap-1.5 shrink-0 items-center">
                      <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-mono font-bold">{row["Días asistidos"]}d</span>
                      <span className="text-[10px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded font-mono">{row["Días calendario"]}cal</span>
                      <button onClick={() => handleDeleteRow(row)} className="text-zinc-500 hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors ml-1" title="Eliminar racha">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Placas + Consecutivo + Vehículo */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Placas</p>
                      <TableCellInput list="placas-list" value={row.Placas} onSave={(val) => handleCellEdit(row, 'Placas', val)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Consecutivo</p>
                      <TableCellInput list="consecutivos-list" value={row.Consecutivo} onSave={(val) => handleCellEdit(row, 'Consecutivo', val)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-400 outline-none focus:border-orange-500/50" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Vehículo</p>
                      <TableCellInput list="vehiculos-list" value={row.Vehículo} onSave={(val) => handleCellEdit(row, 'Vehículo', val)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-400 outline-none focus:border-orange-500/50" />
                    </div>
                  </div>
                  {/* Fechas */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Inicio</p>
                      <TableCellInput type="date" value={row.Inicio} onSave={(val) => handleCellEdit(row, 'Inicio', val)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 css-date-picker" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Fin</p>
                      <TableCellInput type="date" value={row.Fin} onSave={(val) => handleCellEdit(row, 'Fin', val)} className="w-full bg-[#111] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 css-date-picker" />
                    </div>
                  </div>
                  {/* Periodo */}
                  <div className="text-[10px] text-zinc-500 font-mono bg-[#050505] border border-zinc-900 rounded px-2 py-1.5">
                    {row.Periodo}
                  </div>
                </div>
              );
            })}
          </div>
          </>
          )}
          
          {/* BOTONES DE NAVEGACIÓN RÁPIDA (SCROLL) */}
          <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-[100]">
            <button 
              onClick={() => {
                const container = document.getElementById('santo-grial-main-scroll');
                if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="p-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full text-zinc-400 hover:text-orange-500 hover:border-orange-500/50 shadow-2xl transition-all group"
              title="Ir al inicio"
            >
              <ArrowUp className="w-6 h-6 group-hover:-translate-y-1 transition-transform" />
            </button>
            <button 
              onClick={() => {
                const container = document.getElementById('santo-grial-main-scroll');
                if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
              }}
              className="p-3 bg-orange-600/90 backdrop-blur-md border border-orange-400/50 rounded-full text-black shadow-2xl shadow-orange-600/20 hover:bg-orange-500 transition-all group"
              title="Ir al final"
            >
              <ArrowDown className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
            </button>
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
