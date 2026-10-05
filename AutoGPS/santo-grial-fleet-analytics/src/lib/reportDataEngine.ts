/**
 * Report Data Engine (Versión Ejecutiva / Directiva)
 * Motor central que analiza la telemetría para extraer KPIs financieros y clasificar
 * el uso de fin de semana entre "Proyecto" y "Personal".
 * 
 * v3.0 — Ahora usa el Motor de Proximidad Geográfica (Haversine) para determinar
 * si un vehículo estuvo cerca de una geocerca oficial. Si lo estuvo → Justificado.
 */

import { loadGeofences, checkProximity } from "./geofenceEngine";
import { parseDateRobust } from "./utils";

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
  velMax: number;
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
  velMax: number;
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
  top10Drivers: ExecutiveDriverStat[];
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
  const parts = horaStr.trim().split(" ");
  let time = parts[0] || "";
  if (parts.length > 1 && parts[1].includes(":")) {
    time = parts[1];
  }
  
  const lower = horaStr.toLowerCase();
  if (lower.includes("p.") || lower.includes("pm")) {
    const hParts = time.split(":");
    let h = parseInt(hParts[0], 10);
    if (h < 12) h += 12;
    hParts[0] = h.toString().padStart(2, '0');
    time = hParts.join(":");
  } else if (lower.includes("a.") || lower.includes("am")) {
    const hParts = time.split(":");
    let h = parseInt(hParts[0], 10);
    if (h === 12) h = 0;
    hParts[0] = h.toString().padStart(2, '0');
    time = hParts.join(":");
  }
  return time;
}


function getUTCDayRobust(dateStr: string): number {
  const d = parseDateRobust(dateStr);
  if (!isNaN(d.getTime())) {
    return d.getUTCDay();
  }
  return -1;
}

// ============================================================
// ALGORITMO PRINCIPAL
// ============================================================

export async function buildReportData(rawData: RawTelemetryRow[], config: ReportConfig): Promise<ReportData> {
  const fuelEfficiency = 8; // km/L
  const fuelPrice = 24; // $/L
  const PROXIMITY_RADIUS_KM = 0.5; // Radio muy estricto (500m) para evitar falsos positivos en ciudades

  // 0. Cargar geocercas oficiales (desde /public/objects.csv)
  const geofences = await loadGeofences();
  console.log(`[ReportEngine] Geocercas disponibles para proximidad: ${geofences.length}`);

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
    const velMaxStr = getField(row, "vel. máxima", "vel maxima", "velocidad maxima");
    const lugar = getField(row, "destino", "lugar", "direccion", "dirección", "Dirección");
    const origenFila = getField(row, "origen", "Origen");
    const geocerca = getField(row, "geocercas", "Geocercas", "privado", "trabajo"); // intentar buscar en varias col
    const dist = parseFloat(distanciaStr) || 0;
    const velMax = parseFloat(velMaxStr) || 0;

    let dateOnly = fecha;
    let dayOfWeek = getUTCDayRobust(`${dateOnly}T12:00:00Z`); // Forzar UTC mediodía para evitar saltos de zona horaria

    if (!vehicleTimeline.has(vehiculo)) vehicleTimeline.set(vehiculo, []);
    
    const timeEvent = {
      timestamp, dateOnly, dayOfWeek,
      conductor, vehiculo, dist, velMax, lugar, geocerca,
      origen: origenFila || vehicleOrigins[vehiculo] || "Punto de Partida",
      hora: hora,
      lat: parseFloat(String(getField(row, "Latitud", "latitud", "lat")).replace(/[^\d.-]/g, '')),
      lng: parseFloat(String(getField(row, "Longitud", "longitud", "lng", "lon")).replace(/[^\d.-]/g, '')),
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
        
        // Nueva regla: Sábado solo cuenta después de las 15:00 (3 PM)
        if (ev.dayOfWeek === 6) {
           const hourStr = ev.hora.split(":")[0];
           const hour = parseInt(hourStr || "0", 10);
           if (hour < 15) continue;
        }
        
        // Determinar si es "Uso Personal Puro"
        // ALGORITMO v5: Basado estrictamente en Geocercas y Pernoctas Detectadas
        let isPersonalAbuse = true;

        const geocercaLow = (ev.geocerca || "").toLowerCase();
        const isAtWork = geocercaLow.length > 0; // Cualquier geocerca es trabajo
        const isAtBase = geocercaLow.includes("oficina"); // Solo las que dicen oficina son base
        
        // ─── CAPA 1: Geocerca Directa ───
        if (isAtWork) {
          isPersonalAbuse = false;
        }

        // ─── CAPA 2: Proximidad GPS y Regreso a Base ───
        if (isPersonalAbuse) {
          for (let j = i; j < events.length; j++) {
            const futureEv = events[j];
            if (futureEv.dayOfWeek !== 6 && futureEv.dayOfWeek !== 0 && futureEv.dayOfWeek !== 1) break;
            
            const futureGeoLow = (futureEv.geocerca || "").toLowerCase();
            const futureIsBase = futureGeoLow.includes("oficina");

            // Si el viaje del domingo termina en la OFICINA (Base), se justifica como retorno
            if (ev.dayOfWeek === 0 && futureIsBase) {
              isPersonalAbuse = false;
              break;
            }

            // Proximidad GPS a geocercas conocidas (Layer 1 original)
            if (!isNaN(futureEv.lat) && !isNaN(futureEv.lng)) {
              const proximity = checkProximity(futureEv.lat, futureEv.lng, PROXIMITY_RADIUS_KM);
              if (proximity.isNearGeofence) {
                const geoName = proximity.nearestGeofence.toLowerCase();
                const IGNORE_GEOFENCES = ["casa", "privado", "hogar", "oxxo", "gasolinera", "7-eleven", "7 eleven", "super", "tienda", "domicilio"];
                if (!IGNORE_GEOFENCES.some(ig => geoName.includes(ig))) {
                  isPersonalAbuse = false;
                  break;
                }
              }
            }
          }
        }

        // Registrar estadísticas (independientemente de si es abuso o no, para tener la bitácora)
        const driverKey = `${ev.conductor}_${vehiculo}`;
        if (!driverStatsMap.has(driverKey)) {
          driverStatsMap.set(driverKey, {
            conductor: ev.conductor,
            vehiculo: ev.vehiculo,
            totalKmFinde: 0,
            diasUsoFinde: new Set<string>(),
            isPersonalAbuse: true, // asume que es personal hasta que se demuestre lo contrario en la suma
            rutas: [],
            gastoGasolina: 0,
            velMax: 0
          });
        }
        
        const stat = driverStatsMap.get(driverKey)!;
        stat.totalKmFinde += ev.dist;
        if (ev.velMax > stat.velMax) stat.velMax = ev.velMax;
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
          geocercaDestino: ev.geocerca,
          velMax: ev.velMax
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
  // Top 10 — SOLO los que reprobaron las 3 capas de justificación
  const abusadores = allDriverStats.filter(s => s.isPersonalAbuse);
  const top10Drivers = [...abusadores].sort((a, b) => b.totalKmFinde - a.totalKmFinde).slice(0, 10);
  
  console.log(`[ReportEngine] Total vehículos fin de semana: ${allDriverStats.length}, Justificados: ${allDriverStats.length - abusadores.length}, Abusadores: ${abusadores.length}`);

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
    top10Drivers,
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
