import { RawTelemetryRow } from "./streaksAnalyzer";

// ============================================================
// STOP PROFILER — "Thermal Footprint Profiler"
// Escanea TODAS las paradas del CSV, agrupa por dirección,
// calcula un score de sospecha 0-100 y extrae coordenadas.
// ============================================================

export type StopClassification = "pernocta" | "personal" | "operativa" | "sin_clasificar";

export interface StopVisit {
  vehiculo: string;
  matricula: string;
  conductor: string;
  fecha: string;        // "2026-02-28"
  hora: string;         // "20:14"
  diaSemana: number;    // 0=Dom ... 6=Sab
  tiempoAparcadoSecs: number;
}

export interface StopProfile {
  address: string;             // Dirección normalizada display
  addressKey: string;          // Key para dedup (lowercase, sin espacios extras)
  lat: number;
  lng: number;
  geocerca: string;            // Geocerca asociada (puede ser vacía)
  totalVisits: number;
  uniqueVehicles: string[];    // Matrículas únicas
  uniqueConductors: string[];
  avgParkedSeconds: number;
  nightVisits: number;         // Visitas entre 22:00-06:00
  weekendVisits: number;       // Visitas sáb/dom
  hourDistribution: number[];  // Array[24] con conteos por hora
  firstSeen: string;
  lastSeen: string;
  suspicionScore: number;      // 0-100
  visits: StopVisit[];
}

export interface StopProfileReport {
  totalUniqueStops: number;
  highSuspicion: number;    // score >= 70
  mediumSuspicion: number;  // score 40-69
  lowSuspicion: number;     // score < 40
  totalVehiclesInvolved: number;
  stops: StopProfile[];
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

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseDurationToSeconds(durStr: string): number {
  if (!durStr) return 0;
  const match = durStr.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return parseInt(match[1] || "0", 10) * 3600 + parseInt(match[2] || "0", 10) * 60 + parseFloat(match[3] || "0");
}

const OFFICIAL_KEYWORDS = ["oficina", "base", "taller", "almacén", "almacen", "bodega"];

// ============================================================
// ALGORITMO PRINCIPAL
// ============================================================

export function profileStops(rawData: RawTelemetryRow[]): StopProfileReport {
  const stopMap = new Map<string, StopProfile>();
  const allVehicles = new Set<string>();

  for (const row of rawData) {
    const direccion = getField(row, "Dirección", "Direccion", "direccion", "Direccion").trim();
    if (!direccion) continue;

    const latStr = getField(row, "Latitud", "latitud", "Lat", "lat");
    const lngStr = getField(row, "Longitud", "longitud", "Lng", "lng", "Long", "long");
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;

    const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
    if (!horaInicial) continue;

    const eventDate = new Date(horaInicial);
    if (isNaN(eventDate.getTime())) continue;

    const matriculaRaw = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
    const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículo", "vehiculo").trim();
    const conductor = getField(row, "Conductor", "conductor").trim() || "Desconocido";
    const geocerca = getField(row, "Geocercas", "geocercas").trim();
    const tiempoAparcado = getField(row, "Tiempo aparcado ", "Tiempo aparcado", "tiempo aparcado");
    const secs = parseDurationToSeconds(tiempoAparcado);

    const addressKey = normalizeAddress(direccion);
    const hora = eventDate.getHours();
    const diaSemana = eventDate.getDay();
    const fechaStr = horaInicial.split(" ")[0];
    const horaStr = `${hora.toString().padStart(2, "0")}:${eventDate.getMinutes().toString().padStart(2, "0")}`;

    if (matriculaRaw) allVehicles.add(matriculaRaw);

    if (!stopMap.has(addressKey)) {
      stopMap.set(addressKey, {
        address: direccion,
        addressKey,
        lat,
        lng,
        geocerca: geocerca || "",
        totalVisits: 0,
        uniqueVehicles: [],
        uniqueConductors: [],
        avgParkedSeconds: 0,
        nightVisits: 0,
        weekendVisits: 0,
        hourDistribution: Array(24).fill(0),
        firstSeen: fechaStr,
        lastSeen: fechaStr,
        suspicionScore: 0,
        visits: [],
      });
    }

    const stop = stopMap.get(addressKey)!;
    stop.totalVisits += 1;
    stop.hourDistribution[hora] += 1;

    // Acumular para promedio
    stop.avgParkedSeconds += secs;

    // Coordenadas: promediar para centrar el mapa
    stop.lat = (stop.lat * (stop.totalVisits - 1) + lat) / stop.totalVisits;
    stop.lng = (stop.lng * (stop.totalVisits - 1) + lng) / stop.totalVisits;

    // Vehículos únicos
    if (matriculaRaw && !stop.uniqueVehicles.includes(matriculaRaw)) {
      stop.uniqueVehicles.push(matriculaRaw);
    }

    // Conductores únicos
    if (conductor !== "Desconocido" && !stop.uniqueConductors.includes(conductor)) {
      stop.uniqueConductors.push(conductor);
    }

    // Geocerca (usar la primera no vacía)
    if (!stop.geocerca && geocerca) {
      stop.geocerca = geocerca;
    }

    // Noche (22:00 - 06:00)
    if (hora >= 22 || hora < 6) {
      stop.nightVisits += 1;
    }

    // Fin de semana
    if (diaSemana === 0 || diaSemana === 6) {
      stop.weekendVisits += 1;
    }

    // Fechas extremas
    if (fechaStr < stop.firstSeen) stop.firstSeen = fechaStr;
    if (fechaStr > stop.lastSeen) stop.lastSeen = fechaStr;

    // Registrar visita individual
    stop.visits.push({
      vehiculo,
      matricula: matriculaRaw,
      conductor,
      fecha: fechaStr,
      hora: horaStr,
      diaSemana,
      tiempoAparcadoSecs: secs,
    });
  }

  // ============================================================
  // FASE 2: SCORING DE SOSPECHA
  // ============================================================
  const stopsArray: StopProfile[] = [];

  for (const stop of stopMap.values()) {
    // Calcular promedio de tiempo aparcado
    stop.avgParkedSeconds = stop.totalVisits > 0 ? stop.avgParkedSeconds / stop.totalVisits : 0;

    // ¿Es una geocerca oficial?
    const geoLow = stop.geocerca.toLowerCase();
    const addrLow = stop.addressKey;
    const isOfficial = OFFICIAL_KEYWORDS.some(kw => geoLow.includes(kw) || addrLow.includes(kw));

    if (isOfficial) {
      stop.suspicionScore = 0;
      stopsArray.push(stop);
      continue;
    }

    let score = 0;

    // Criterio 1: Visitas nocturnas (22:00-06:00) → +30
    const nightRatio = stop.totalVisits > 0 ? stop.nightVisits / stop.totalVisits : 0;
    if (nightRatio > 0.3) score += 30;
    else if (nightRatio > 0.1) score += 15;

    // Criterio 2: Visitas en fin de semana → +20
    const weekendRatio = stop.totalVisits > 0 ? stop.weekendVisits / stop.totalVisits : 0;
    if (weekendRatio > 0.3) score += 20;
    else if (weekendRatio > 0.1) score += 10;

    // Criterio 3: Solo 1 vehículo la visita → +15
    if (stop.uniqueVehicles.length === 1) score += 15;

    // Criterio 4: Tiempo aparcado promedio > 8h → +20
    if (stop.avgParkedSeconds > 8 * 3600) score += 20;
    else if (stop.avgParkedSeconds > 4 * 3600) score += 10;

    // Criterio 5: Recurrencia alta (>5 visitas) → +15
    if (stop.totalVisits > 10) score += 15;
    else if (stop.totalVisits > 5) score += 10;

    stop.suspicionScore = Math.min(100, Math.max(0, score));

    // Ordenar visitas por fecha/hora desc
    stop.visits.sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`));

    stopsArray.push(stop);
  }

  // Ordenar por score desc
  stopsArray.sort((a, b) => b.suspicionScore - a.suspicionScore);

  const highSuspicion = stopsArray.filter(s => s.suspicionScore >= 70).length;
  const mediumSuspicion = stopsArray.filter(s => s.suspicionScore >= 40 && s.suspicionScore < 70).length;
  const lowSuspicion = stopsArray.filter(s => s.suspicionScore < 40).length;

  return {
    totalUniqueStops: stopsArray.length,
    highSuspicion,
    mediumSuspicion,
    lowSuspicion,
    totalVehiclesInvolved: allVehicles.size,
    stops: stopsArray,
  };
}
