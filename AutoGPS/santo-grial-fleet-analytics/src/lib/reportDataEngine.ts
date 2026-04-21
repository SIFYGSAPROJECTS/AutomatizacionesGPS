/**
 * Report Data Engine (Versión Ejecutiva / Directiva)
 * Motor central que analiza la telemetría para extraer KPIs financieros y clasificar
 * el uso de fin de semana entre "Proyecto" y "Personal", rastreando orígenes, destinos,
 * y revisando el comportamiento del Lunes posterior.
 */

export interface RawTelemetryRow {
  [key: string]: any;
}

export interface ReportConfig {
  includeWeekend: boolean;
  includeStops: boolean;
  includeVehicles: boolean;
  dateFrom: string;
  dateTo: string;
  selectedVehicles: string[];
  selectedLocations: string[];
  includeScanner: boolean;
  scannerQuery: string;
}

// Estructura de Rutas Exactas
export interface ExecutiveRoute {
  fecha: string;
  hora: string;
  origen: string;
  destino: string;
  distancia: number;
  geocercaDestino: string;
}

// Estadísticas de Conductor (Top Infractores)
export interface ExecutiveDriverStat {
  conductor: string;
  vehiculo: string;
  totalKmFinde: number;
  diasUsoFinde: Set<string>;
  isPersonalAbuse: boolean; // True si NO visitó geocerca ni en finde ni en el lunes posterior
  rutas: ExecutiveRoute[];
  gastoGasolina: number;
}

export interface ReportKPIs {
  totalRegistrosFiltrados: number;
  totalVehiculos: number;
  totalAlertasFinde: number; // Viajes en fin de semana
  totalKmFinde: number;
  gastoGasolinaFinde: number;
  porcentajePersonal: number; // % de km que fueron puro uso personal
  totalParadasSospechosas: number;
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
  top5KmDrivers: ExecutiveDriverStat[];
  topPersonalAbusers: ExecutiveDriverStat[];
  // Mantenemos estas para compatibilidad con el modal de UI
  weekendAlerts: any[];
  stopSummaries: any[];
  vehicleSummaries: any[];
  scannerEvents: any[];
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

function extractDate(fechaHora: string): string {
  if (!fechaHora) return "";
  const parts = fechaHora.trim().split(" ");
  return parts[0] || "";
}

function extractTime(horaStr: string): string {
  if (!horaStr) return "";
  // Si la hora viene con fecha "1899-12-30 16:03:00.000"
  const parts = horaStr.trim().split(" ");
  if (parts.length > 1 && parts[1].includes(":")) {
    return parts[1];
  }
  return parts[0] || "";
}

function parseDateRobust(dateStr: string): Date {
  if (!dateStr) return new Date("Invalid");
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
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

function getUTCDayRobust(dateStr: string): number {
  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.getUTCDay();
  }
  const d = parseDateRobust(dateStr);
  if (!isNaN(d.getTime())) {
    return d.getUTCDay();
  }
  return -1;
}

// ============================================================
// ALGORITMO PRINCIPAL
// ============================================================

export function buildReportData(rawData: RawTelemetryRow[], config: ReportConfig): ReportData {
  const fuelEfficiency = 8; // km/L
  const fuelPrice = 24; // $/L

  // 1. Preparar y ordenar datos cronológicamente por vehículo
  const processableRows = rawData.map(row => {
    let fecha = getField(row, "fecha", "date", "Hora inicial ");
    let hora = getField(row, "hora", "Hora inicial");
    const vehiculo = getField(row, "vehiculo", "Vehículo", "matricula", "Matrícula");
    
    // Limpiar fecha y hora
    const dateOnly = extractDate(fecha);
    const timeOnly = extractTime(hora) || extractTime(fecha);
    
    let timestamp = 0;
    if (dateOnly && timeOnly) {
      timestamp = new Date(`${dateOnly}T${timeOnly}Z`).getTime();
      if (isNaN(timestamp)) {
        timestamp = new Date(`${dateOnly} ${timeOnly}`).getTime();
      }
    }
    if (isNaN(timestamp) || timestamp === 0) {
      timestamp = new Date(fecha).getTime() || 0;
    }
    
    return { row, fecha: dateOnly, hora: timeOnly, vehiculo, timestamp };
  }).sort((a, b) => a.timestamp - b.timestamp);

  // Mapa de orígenes
  const vehicleOrigins: Record<string, string> = {};
  
  // Estructuras de agrupación
  const driverStatsMap = new Map<string, ExecutiveDriverStat>();
  
  // Agrupar filas por vehículo para análisis del "Lunes posterior"
  const vehicleTimeline = new Map<string, any[]>();
  
  processableRows.forEach(({ row, fecha, hora, vehiculo, timestamp }) => {
    const conductor = getField(row, "conductor") || "Desconocido";
    if (!vehiculo) return;

    const distanciaStr = getField(row, "distancia (km)", "distancia", "km");
    const lugar = getField(row, "destino", "lugar", "direccion", "dirección", "Dirección");
    const origenFila = getField(row, "origen", "Origen");
    const geocerca = getField(row, "geocercas", "Geocercas", "privado", "trabajo"); // intentar buscar en varias col
    const dist = parseFloat(distanciaStr) || 0;

    let dateOnly = fecha;
    let dayOfWeek = getUTCDayRobust(`${dateOnly}T12:00:00Z`); // Forzar UTC mediodía para evitar saltos de zona horaria

    if (!vehicleTimeline.has(vehiculo)) vehicleTimeline.set(vehiculo, []);
    
    const timeEvent = {
      timestamp, dateOnly, dayOfWeek,
      conductor, vehiculo, dist, lugar, geocerca,
      origen: origenFila || vehicleOrigins[vehiculo] || "Punto de Partida",
      hora: hora
    };

    vehicleTimeline.get(vehiculo)!.push(timeEvent);
    vehicleOrigins[vehiculo] = lugar;
  });

  // 2. Analizar Timeline y aplicar Algoritmo de "Lunes"
  for (const [vehiculo, events] of vehicleTimeline.entries()) {
    
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      
      // Filtrar fechas si config lo requiere
      if (config.dateFrom && ev.dateOnly < config.dateFrom) continue;
      if (config.dateTo && ev.dateOnly > config.dateTo) continue;

      // Solo nos importan los viajes en fin de semana (Sábado = 6, Domingo = 0)
      if (ev.dayOfWeek === 6 || ev.dayOfWeek === 0) {
        
        // Determinar si es "Uso Personal Puro" buscando geocercas ese mismo finde o el lunes
        let isPersonalAbuse = true;
        
        // Nueva regla: Para considerarse "Proyecto", debe visitar una geocerca O un lugar
        // que contenga la palabra clave del proyecto (por defecto, asume Veracruz o sus zonas).
        const VERACRUZ_KEYWORDS = ["veracruz", "valente diaz", "valente díaz", "boca del rio", "boca del río", "proyecto"];
        
        for (let j = i; j < events.length; j++) {
          const futureEv = events[j];
          if (futureEv.dayOfWeek !== 6 && futureEv.dayOfWeek !== 0 && futureEv.dayOfWeek !== 1) {
             break;
          }
          
          const searchString = `${futureEv.geocerca} ${futureEv.lugar} ${futureEv.origen}`.toLowerCase();
          const matchesProject = VERACRUZ_KEYWORDS.some(kw => searchString.includes(kw));
          const hasGeofence = futureEv.geocerca && futureEv.geocerca.trim() !== "";
          const isMondayMorning = futureEv.dayOfWeek === 1 && parseInt(futureEv.hora.split(":")[0]) <= 10;
          
          // Solo es Proyecto válido si hace match con las keywords del proyecto en Veracruz
          // Si tiene geocerca pero no es Veracruz, igual se marca como Uso Personal (Advertencia)
          if (matchesProject || (hasGeofence && matchesProject)) {
            isPersonalAbuse = false;
            break;
          }
        }

        // Registrar estadísticas
        const driverKey = `${ev.conductor}_${vehiculo}`;
        if (!driverStatsMap.has(driverKey)) {
          driverStatsMap.set(driverKey, {
            conductor: ev.conductor,
            vehiculo: ev.vehiculo,
            totalKmFinde: 0,
            diasUsoFinde: new Set<string>(),
            isPersonalAbuse: true, // asume que es personal hasta que se demuestre lo contrario en la suma
            rutas: [],
            gastoGasolina: 0
          });
        }
        
        const stat = driverStatsMap.get(driverKey)!;
        stat.totalKmFinde += ev.dist;
        if (ev.dateOnly) stat.diasUsoFinde.add(ev.dateOnly);
        
        // Si al menos UN viaje de su fin de semana tocó geocerca, se salva de ser "Abuso Personal Puro"
        if (!isPersonalAbuse) {
          stat.isPersonalAbuse = false;
        }

        stat.rutas.push({
          fecha: ev.dateOnly,
          hora: ev.hora,
          origen: ev.origen,
          destino: ev.lugar,
          distancia: ev.dist,
          geocercaDestino: ev.geocerca
        });
      }
    }
  }

  // 3. Convertir Map a Array y calcular gastos
  const allDriverStats = Array.from(driverStatsMap.values()).map(stat => {
    stat.gastoGasolina = (stat.totalKmFinde / fuelEfficiency) * fuelPrice;
    // Ordenar rutas internas de mayor a menor distancia
    stat.rutas.sort((a, b) => b.distancia - a.distancia);
    return stat;
  }).filter(s => s.totalKmFinde > 0); // Solo los que se movieron

  // 4. Rankings
  // Top 5 Km Drivers (Independientemente de si fue proyecto o personal)
  const top5KmDrivers = [...allDriverStats].sort((a, b) => b.totalKmFinde - a.totalKmFinde).slice(0, 5);
  
  // Top Abusadores Personales (UsoPersonal = true, ordenados por Gasto/Km)
  const topPersonalAbusers = [...allDriverStats]
    .filter(s => s.isPersonalAbuse)
    .sort((a, b) => b.gastoGasolina - a.gastoGasolina)
    .slice(0, 5);

  // 5. KPIs Globales
  let totalKmFindeGlobal = 0;
  let totalKmPersonalGlobal = 0;
  let totalAlertasFinde = 0;
  
  allDriverStats.forEach(s => {
    totalKmFindeGlobal += s.totalKmFinde;
    totalAlertasFinde += s.rutas.length;
    if (s.isPersonalAbuse) {
      totalKmPersonalGlobal += s.totalKmFinde;
    }
  });

  const kpis: ReportKPIs = {
    totalRegistrosFiltrados: processableRows.length,
    totalVehiculos: vehicleTimeline.size,
    totalAlertasFinde,
    totalKmFinde: totalKmFindeGlobal,
    gastoGasolinaFinde: (totalKmFindeGlobal / fuelEfficiency) * fuelPrice,
    porcentajePersonal: totalKmFindeGlobal > 0 ? (totalKmPersonalGlobal / totalKmFindeGlobal) * 100 : 0,
    totalParadasSospechosas: 0, // Placeholder
    periodoDesde: config.dateFrom,
    periodoHasta: config.dateTo,
  };

  return {
    meta: {
      period: `${config.dateFrom} a ${config.dateTo}`,
      generatedAt: new Date().toISOString(),
      totalRecords: processableRows.length,
      sections: ["Auditoría Directiva", "Proyecto vs Personal"],
    },
    kpis,
    top5KmDrivers,
    topPersonalAbusers,
    weekendAlerts: [], stopSummaries: [], vehicleSummaries: [], scannerEvents: []
  };
}

export function extractFilterOptions(rawData: RawTelemetryRow[]) {
  const vehicles = new Set<string>();
  const locations = new Set<string>();
  let minDate = "9999-12-31";
  let maxDate = "0000-01-01";

  for (const row of rawData) {
    const mat = getField(row, "vehiculo", "Vehículo", "Matrícula", "Matricula", "matrícula", "matricula");
    if (mat) vehicles.add(mat);

    const geo = getField(row, "Geocercas", "geocercas").trim();
    if (geo) locations.add(geo);

    const fecha = getField(row, "fecha", "date", "Hora inicial ");
    const dateStr = extractDate(fecha);
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
