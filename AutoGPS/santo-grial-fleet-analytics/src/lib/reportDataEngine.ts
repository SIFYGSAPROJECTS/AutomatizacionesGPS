/**
 * Report Data Engine
 * Motor central que filtra rawParsedData según la configuración del usuario
 * y prepara estructuras listas para los generadores de Excel y PPTX.
 */

import { RawTelemetryRow } from "./streaksAnalyzer";

// ============================================================
// TIPOS
// ============================================================

export interface ReportConfig {
  includeWeekend: boolean;
  includeStops: boolean;
  includeVehicles: boolean;
  dateFrom: string;       // YYYY-MM-DD
  dateTo: string;         // YYYY-MM-DD
  selectedVehicles: string[];   // vacío = todos
  selectedLocations: string[];  // vacío = todas
  includeScanner: boolean;
  scannerQuery: string;         // búsqueda para dirección, vehículo o conductor
}

export interface WeekendAlertRow {
  fecha: string;
  diaSemana: string;
  matricula: string;
  vehiculo: string;
  conductor: string;
  direccion: string;
  geocerca: string;
  horaInicial: string;
  tiempoAparcadoSecs: number;
}

export interface StopSummaryRow {
  direccion: string;
  geocerca: string;
  lat: number;
  lng: number;
  totalVisitas: number;
  vehiculosUnicos: number;
  visitasNocturnas: number;
  visitasFinDeSemana: number;
  promedioAparcadoSecs: number;
  suspicionScore: number;
}

export interface VehicleSummaryRow {
  matricula: string;
  vehiculo: string;
  conductor: string;
  totalEventos: number;
  eventosSabado: number;
  eventosDomingo: number;
  ubicacionesVisitadas: number;
  horasAcumuladas: number;
  topUbicacion: string;
  top5WeekendLocations: { direccion: string; fechaHora: string; tiempoSecs: number }[];
}

export interface ScannerEvent {
  vehiculo: string;
  conductor: string;
  direccion: string;
  fechaHora: string;
  tiempoSecs: number;
}

export interface ReportKPIs {
  totalRegistrosFiltrados: number;
  totalVehiculos: number;
  totalAlertasFinde: number;
  totalParadasSospechosas: number;
  horasAcumuladasFinde: number;
  periodoDesde: string;
  periodoHasta: string;
}

export interface ReportData {
  meta: {
    period: string;
    generatedAt: string;
    totalRecords: number;
    sections: string[];
  };
  kpis: ReportKPIs;
  weekendAlerts: WeekendAlertRow[];
  stopSummaries: StopSummaryRow[];
  vehicleSummaries: VehicleSummaryRow[];
  scannerEvents: ScannerEvent[];
}

// ============================================================
// UTILIDADES
// ============================================================

function getField(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  const rowKeys = Object.keys(row);
  for (const c of candidates) {
    const cNorm = c.trim().toLowerCase();
    const found = rowKeys.find(k => k.trim().toLowerCase() === cNorm);
    if (found !== undefined && row[found] !== undefined) return row[found];
  }
  return "";
}

function parseDurationToSeconds(durStr: string): number {
  if (!durStr) return 0;
  const s = durStr.trim().toLowerCase();
  
  // Format: "1d 04:30:00" or "1 days 04:30:00"
  let days = 0;
  let timeStr = s;
  const dayMatch = s.match(/^(\d+)\s*(?:d|day|days|días|dias)\s*(.*)$/);
  if (dayMatch) {
    days = parseInt(dayMatch[1], 10);
    timeStr = dayMatch[2].trim();
  }
  
  // Format: "1h 30m 45s"
  const textMatch = timeStr.match(/(?:(\d+)\s*h\w*)?\s*(?:(\d+)\s*m\w*)?\s*(?:(\d+(?:\.\d+)?)\s*s\w*)?/);
  if (textMatch && (textMatch[1] || textMatch[2] || textMatch[3]) && !timeStr.includes(':')) {
    const h = parseInt(textMatch[1] || "0", 10);
    const m = parseInt(textMatch[2] || "0", 10);
    const sec = parseFloat(textMatch[3] || "0");
    return (days * 86400) + (h * 3600) + (m * 60) + sec;
  }
  
  // Format: HH:MM:SS or MM:SS
  const parts = timeStr.split(':').map(p => parseFloat(p) || 0);
  if (parts.length === 3) {
    return (days * 86400) + (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  } else if (parts.length === 2) {
    // Assume HH:MM if it looks like a typical duration without seconds, but GPS standard is often HH:MM:SS
    // Si la primer parte es mayor a 59, probablemente era MM:SS, sino, asumimos HH:MM por si acaso.
    return (days * 86400) + (parts[0] * 3600) + (parts[1] * 60); 
  } else if (parts.length === 1) {
    return (days * 86400) + parts[0];
  }
  
  return 0;
}

function parseDateRobust(dateStr: string): Date {
  if (!dateStr) return new Date("Invalid");
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Fallback for DD/MM/YYYY HH:MM:SS
  const match = dateStr.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const h = parseInt(match[4], 10);
    const m = parseInt(match[5], 10);
    const s = match[6] ? parseInt(match[6], 10) : 0;
    return new Date(year, month, day, h, m, s);
  }
  return new Date("Invalid");
}

function getStopDurationSeconds(row: Record<string, string>): number {
  // 1. Try explicit duration column
  const durStr = getField(row, "Tiempo aparcado ", "Tiempo aparcado", "tiempo aparcado", "Duración", "Duracion", "duracion");
  if (durStr) {
    const parsed = parseDurationToSeconds(durStr);
    if (parsed > 0) return parsed;
  }
  
  // 2. Fallback to math (Hora final - Hora inicial)
  const hInicio = getField(row, "Hora inicial ", "Hora inicial", "hora inicial", "Inicio");
  const hFinal = getField(row, "Hora final ", "Hora final", "hora final", "Fin", "Final");
  
  if (hInicio && hFinal) {
    const t1 = parseDateRobust(hInicio).getTime();
    const t2 = parseDateRobust(hFinal).getTime();
    if (!isNaN(t1) && !isNaN(t2) && t2 > t1) {
      return (t2 - t1) / 1000;
    }
  }
  
  return 0;
}

function extractDate(horaInicial: string): string {
  // "2026-02-28 08:22:00" → "2026-02-28"
  const parts = horaInicial.trim().split(" ");
  return parts[0] || "";
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][day] || "";
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

// ============================================================
// ALGORITMO PRINCIPAL
// ============================================================

export function buildReportData(rawData: RawTelemetryRow[], config: ReportConfig): ReportData {
  const sections: string[] = [];
  if (config.includeWeekend) sections.push("Fines de Semana");
  if (config.includeStops) sections.push("Ubicaciones");
  if (config.includeVehicles) sections.push("Vehículos");
  if (config.includeScanner && config.scannerQuery.trim().length > 0) sections.push("Escáner de Auditoría");

  // 1. Filtrar registros por fecha
  const filtered = rawData.filter(row => {
    const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
    if (!horaInicial) return false;
    const dateStr = extractDate(horaInicial);
    if (!dateStr) return false;
    if (config.dateFrom && dateStr < config.dateFrom) return false;
    if (config.dateTo && dateStr > config.dateTo) return false;

    // Filtrar por vehículos seleccionados
    if (config.selectedVehicles.length > 0) {
      const mat = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
      if (!config.selectedVehicles.some(v => mat.includes(v))) return false;
    }

    return true;
  });

  // ============================================================
  // WEEKEND ALERTS
  // ============================================================
  const weekendAlerts: WeekendAlertRow[] = [];
  if (config.includeWeekend) {
    for (const row of filtered) {
      const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
      const dateStr = extractDate(horaInicial);
      if (!isWeekend(dateStr)) continue;

      const direccion = getField(row, "Dirección", "Direccion", "direccion").trim();
      const geocerca = getField(row, "Geocercas", "geocercas").trim();

      // Filtrar por ubicaciones si se seleccionaron
      if (config.selectedLocations.length > 0) {
        const match = config.selectedLocations.some(loc =>
          direccion.toLowerCase().includes(loc.toLowerCase()) ||
          geocerca.toLowerCase().includes(loc.toLowerCase())
        );
        if (!match) continue;
      }

      const matricula = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
      const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículo", "vehiculo").trim();
      const conductor = getField(row, "Conductor", "conductor").trim() || "Desconocido";
      const tiempoAparcado = getField(row, "Tiempo aparcado ", "Tiempo aparcado", "tiempo aparcado");

      weekendAlerts.push({
        fecha: dateStr,
        diaSemana: getDayName(dateStr),
        matricula,
        vehiculo,
        conductor,
        direccion,
        geocerca,
        horaInicial,
        tiempoAparcadoSecs: getStopDurationSeconds(row),
      });
    }
    weekendAlerts.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // ============================================================
  // STOP SUMMARIES (by address)
  // ============================================================
  const stopSummaries: StopSummaryRow[] = [];
  if (config.includeStops) {
    const stopMap = new Map<string, {
      direccion: string; geocerca: string; lat: number; lng: number;
      totalVisitas: number; vehiculos: Set<string>; nightVisits: number;
      weekendVisits: number; totalSecs: number; count: number;
    }>();

    for (const row of filtered) {
      const direccion = getField(row, "Dirección", "Direccion", "direccion").trim();
      if (!direccion) continue;

      const latStr = getField(row, "Latitud", "latitud", "Lat");
      const lngStr = getField(row, "Longitud", "longitud", "Lng", "Long");
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (isNaN(lat) || isNaN(lng)) continue;

      const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
      const eventDate = new Date(horaInicial);
      if (isNaN(eventDate.getTime())) continue;

      const key = direccion.toLowerCase().replace(/\s+/g, " ");
      const geocerca = getField(row, "Geocercas", "geocercas").trim();
      const matricula = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
      const secs = getStopDurationSeconds(row);
      const hora = eventDate.getHours();
      const dia = eventDate.getDay();

      if (!stopMap.has(key)) {
        stopMap.set(key, { direccion, geocerca, lat, lng, totalVisitas: 0, vehiculos: new Set(), nightVisits: 0, weekendVisits: 0, totalSecs: 0, count: 0 });
      }
      const s = stopMap.get(key)!;
      s.totalVisitas++;
      s.count++;
      s.totalSecs += secs;
      if (matricula) s.vehiculos.add(matricula);
      if (hora >= 22 || hora < 6) s.nightVisits++;
      if (dia === 0 || dia === 6) s.weekendVisits++;
    }

    for (const s of stopMap.values()) {
      // Score simple
      let score = 0;
      const nightRatio = s.totalVisitas > 0 ? s.nightVisits / s.totalVisitas : 0;
      if (nightRatio > 0.3) score += 30; else if (nightRatio > 0.1) score += 15;
      const weekendRatio = s.totalVisitas > 0 ? s.weekendVisits / s.totalVisitas : 0;
      if (weekendRatio > 0.3) score += 20; else if (weekendRatio > 0.1) score += 10;
      if (s.vehiculos.size === 1) score += 15;
      const avgSecs = s.count > 0 ? s.totalSecs / s.count : 0;
      if (avgSecs > 8 * 3600) score += 20; else if (avgSecs > 4 * 3600) score += 10;
      if (s.totalVisitas > 10) score += 15; else if (s.totalVisitas > 5) score += 10;

      stopSummaries.push({
        direccion: s.direccion,
        geocerca: s.geocerca,
        lat: s.lat,
        lng: s.lng,
        totalVisitas: s.totalVisitas,
        vehiculosUnicos: s.vehiculos.size,
        visitasNocturnas: s.nightVisits,
        visitasFinDeSemana: s.weekendVisits,
        promedioAparcadoSecs: avgSecs,
        suspicionScore: Math.min(100, score),
      });
    }
    stopSummaries.sort((a, b) => b.suspicionScore - a.suspicionScore);
  }

  // ============================================================
  // VEHICLE SUMMARIES
  // ============================================================
  const vehicleSummaries: VehicleSummaryRow[] = [];
  if (config.includeVehicles) {
    const vMap = new Map<string, {
      matricula: string; vehiculo: string; conductor: string;
      total: number; sat: number; sun: number;
      ubicaciones: Set<string>; totalSecs: number;
      topLoc: Map<string, number>;
      rawVisits: { direccion: string; fechaHora: string; tiempoSecs: number }[];
    }>();

    for (const row of filtered) {
      const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
      const dateStr = extractDate(horaInicial);
      const eventDate = new Date(horaInicial);
      if (isNaN(eventDate.getTime())) continue;
      if (!isWeekend(dateStr)) continue;

      const matricula = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
      if (!matricula) continue;

      const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículo", "vehiculo").trim();
      const conductor = getField(row, "Conductor", "conductor").trim() || "Desconocido";
      const direccion = getField(row, "Dirección", "Direccion", "direccion").trim();
      const secs = getStopDurationSeconds(row);
      const dia = eventDate.getDay();

      if (!vMap.has(matricula)) {
        vMap.set(matricula, { matricula, vehiculo, conductor, total: 0, sat: 0, sun: 0, ubicaciones: new Set(), totalSecs: 0, topLoc: new Map(), rawVisits: [] });
      }
      const v = vMap.get(matricula)!;
      v.total++;
      if (dia === 6) v.sat++;
      if (dia === 0) v.sun++;
      if (direccion) v.ubicaciones.add(direccion.toLowerCase());
      v.totalSecs += secs;
      v.topLoc.set(direccion, (v.topLoc.get(direccion) || 0) + 1);
      if (!v.conductor || v.conductor === "Desconocido") v.conductor = conductor;
      if (direccion) {
        v.rawVisits.push({ direccion, fechaHora: horaInicial, tiempoSecs: secs });
      }
    }

    for (const v of vMap.values()) {
      let topUbicacion = "";
      let topCount = 0;
      for (const [loc, cnt] of v.topLoc.entries()) {
        if (cnt > topCount) { topCount = cnt; topUbicacion = loc; }
      }

      // Obtener top 5 ubicaciones visitadas por este vehículo
      const top5WeekendLocations = v.rawVisits
        .sort((a, b) => b.tiempoSecs - a.tiempoSecs)
        .slice(0, 5);

      vehicleSummaries.push({
        matricula: v.matricula,
        vehiculo: v.vehiculo,
        conductor: v.conductor,
        totalEventos: v.total,
        eventosSabado: v.sat,
        eventosDomingo: v.sun,
        ubicacionesVisitadas: v.ubicaciones.size,
        horasAcumuladas: Math.round(v.totalSecs / 3600 * 10) / 10,
        topUbicacion,
        top5WeekendLocations,
      });
    }
    vehicleSummaries.sort((a, b) => b.totalEventos - a.totalEventos);
  }

  // ============================================================
  // SCANNER DE AUDITORÍA
  // ============================================================
  const scannerEvents: ScannerEvent[] = [];
  if (config.includeScanner && config.scannerQuery.trim().length > 0) {
    const query = config.scannerQuery.toLowerCase();
    for (const row of filtered) {
      const direccion = getField(row, "Dirección", "Direccion", "direccion").trim();
      const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículo", "vehiculo").trim();
      const conductor = getField(row, "Conductor", "conductor").trim();
      
      const match = direccion.toLowerCase().includes(query) || 
                    vehiculo.toLowerCase().includes(query) || 
                    conductor.toLowerCase().includes(query);
                    
      if (match) {
        const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
        
        scannerEvents.push({
          vehiculo: vehiculo || getField(row, "Matrícula", "Matricula", "matrícula", "matricula"),
          conductor: conductor || "Desconocido",
          direccion,
          fechaHora: horaInicial,
          tiempoSecs: getStopDurationSeconds(row),
        });
      }
    }
    // Ordenar por duración descendente
    scannerEvents.sort((a, b) => b.tiempoSecs - a.tiempoSecs);
  }

  // ============================================================
  // KPIs
  // ============================================================
  const totalHorasFinde = weekendAlerts.reduce((s, a) => s + a.tiempoAparcadoSecs, 0) / 3600;
  const kpis: ReportKPIs = {
    totalRegistrosFiltrados: filtered.length,
    totalVehiculos: new Set(filtered.map(r => getField(r, "Matrícula", "Matricula", "matrícula", "matricula")).filter(Boolean)).size,
    totalAlertasFinde: weekendAlerts.length,
    totalParadasSospechosas: stopSummaries.filter(s => s.suspicionScore >= 40).length,
    horasAcumuladasFinde: Math.round(totalHorasFinde * 10) / 10,
    periodoDesde: config.dateFrom,
    periodoHasta: config.dateTo,
  };

  return {
    meta: {
      period: `${config.dateFrom} a ${config.dateTo}`,
      generatedAt: new Date().toISOString(),
      totalRecords: filtered.length,
      sections,
    },
    kpis,
    weekendAlerts,
    stopSummaries,
    vehicleSummaries,
    scannerEvents,
  };
}

/** Utilidad: extraer lista de vehículos y rangos de fecha del CSV crudo */
export function extractFilterOptions(rawData: RawTelemetryRow[]) {
  const vehicles = new Set<string>();
  const locations = new Set<string>();
  let minDate = "9999-12-31";
  let maxDate = "0000-01-01";

  for (const row of rawData) {
    const mat = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
    if (mat) vehicles.add(mat);

    const geo = getField(row, "Geocercas", "geocercas").trim();
    if (geo) locations.add(geo);

    const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
    const dateStr = extractDate(horaInicial);
    if (dateStr && dateStr < minDate) minDate = dateStr;
    if (dateStr && dateStr > maxDate) maxDate = dateStr;
  }

  return {
    vehicles: Array.from(vehicles).sort(),
    locations: Array.from(locations).sort(),
    minDate: minDate === "9999-12-31" ? "" : minDate,
    maxDate: maxDate === "0000-01-01" ? "" : maxDate,
  };
}
