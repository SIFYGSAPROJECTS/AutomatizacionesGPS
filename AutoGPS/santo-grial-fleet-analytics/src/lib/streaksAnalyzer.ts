import { format, differenceInDays, isValid } from "date-fns";
import { parseDateRobust } from "./utils";

// Usamos Record genérico en vez de interface rígida para tolerar cualquier CSV
export type RawTelemetryRow = Record<string, string>;

export interface StreakReportRow {
  Geocerca: string;
  Placas: string;
  Consecutivo: string;
  "Vehículo": string;
  Inicio: string;
  Fin: string;
  Periodo: string;
  "Días asistidos": number;
  "Días calendario": number;
}

export interface AuditDailyRecord {
  date: string;
  winnerGeocerca: string;
  totalWinnerSeconds: number;
  geocercasVisited: { geocerca: string; seconds: number }[];
}

export interface AuditVehicleMap {
  placas: string;
  consecutivo: string;
  vehiculo: string;
  days: AuditDailyRecord[];
}

export interface AuditTrailType {
  byVehicle: Record<string, AuditVehicleMap>;
  byGeocerca: Record<string, { vehiculos: Record<string, string[]>; totalDaysWon: number }>;
}

export interface AnalysisResult {
  report: StreakReportRow[];
  auditTrail: AuditTrailType;
}

// ============================================================
// NORMALIZADOR FLEXIBLE DE CAMPOS
// Busca la llave correcta en el objeto sin importar espacios
// trailing/leading ni mayúsculas/minúsculas exactas.
// ============================================================
function getField(row: Record<string, string>, ...candidates: string[]): string {
  // Primero: intento directo con las llaves candidatas
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  // Segundo: intento fuzzy (trim + lowercase)
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
  const value = durStr.trim().toLowerCase();
  const dayPrefix = value.match(/^(\d+)\s*(?:d|day|days|días|dias)\s*(.*)$/);
  const days = dayPrefix ? Number(dayPrefix[1]) : 0;
  const time = dayPrefix ? dayPrefix[2].trim() : value;
  const unitMatch = time.match(/(?:(\d+(?:[.,]\d+)?)\s*h\w*)?\s*(?:(\d+(?:[.,]\d+)?)\s*m\w*)?\s*(?:(\d+(?:[.,]\d+)?)\s*s\w*)?/);
  if (unitMatch && (unitMatch[1] || unitMatch[2] || unitMatch[3]) && !time.includes(":")) {
    return days * 86400 + Number((unitMatch[1] || "0").replace(",", ".")) * 3600 + Number((unitMatch[2] || "0").replace(",", ".")) * 60 + Number((unitMatch[3] || "0").replace(",", "."));
  }
  const parts = time.split(":");
  if (parts.length === 3 && parts.every(part => /^\d+(?:[.,]\d+)?$/.test(part.trim()))) {
    return days * 86400 + Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2].replace(",", "."));
  }
  if (parts.length === 2 && parts.every(part => /^\d+$/.test(part.trim()))) {
    return days * 86400 + Number(parts[0]) * 3600 + Number(parts[1]) * 60;
  }
  const numeric = Number(value.replace(",", "."));
  // Excel can represent durations as a fraction of a day.
  return Number.isFinite(numeric) && numeric >= 0 && numeric < 1 ? numeric * 86400 : days * 86400;
}

function normalizeDate(value: string): string {
  const parsed = parseDateRobust(value);
  if (!isValid(parsed)) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function splitGeofences(value: string): string[] {
  return Array.from(new Set(value.split(/[;|\n\r]+/).map(name => name.trim()).filter(Boolean)));
}

function isAdministrativeGeofence(name: string): boolean {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return normalized.includes("BASE") || normalized.includes("OFICINA");
}

export function processStreaks(rawRows: RawTelemetryRow[]): AnalysisResult {
  // 1. Extraer TODA la información, incluso si no hay geocerca (para detectar KM en tránsito)
  const vehicleDailyData: Record<string, Record<string, Record<string, number>>> = {};
  const vehicleDailyKm: Record<string, Record<string, number>> = {};
  const vehicleMeta: Record<string, { placas: string, consecutivo: string, vehiculo: string }> = {};

  rawRows.forEach(row => {
    const matricula = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
    if (!matricula) return;

    const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial", "Inicio", "inicio");
    if (!horaInicial) return;
    
    const isoDateStr = normalizeDate(horaInicial);
    if (!isoDateStr) return;

    const parts = (matricula || "").split(" ");
    const placas = parts[0] || "";
    const consecutivo = parts[1] || "";
    const vehiculoName = getField(row, "Vehículo", "Vehiculo", "vehículo", "vehiculo").trim() || matricula;
    // Vehicle display names can change between reports. Key by the operational
    // identifiers so those rows remain part of one vehicle's history.
    const normalizeIdentifier = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
    const vKey = normalizeIdentifier(placas)
      || [normalizeIdentifier(consecutivo), normalizeIdentifier(vehiculoName)].filter(Boolean).join("|");
    
    if (!vehicleMeta[vKey]) {
      vehicleMeta[vKey] = { placas, consecutivo, vehiculo: vehiculoName };
    } else {
      if (!vehicleMeta[vKey].placas && placas) vehicleMeta[vKey].placas = placas;
      if (!vehicleMeta[vKey].consecutivo && consecutivo) vehicleMeta[vKey].consecutivo = consecutivo;
      if ((!vehicleMeta[vKey].vehiculo || vehicleMeta[vKey].vehiculo === vehicleMeta[vKey].placas) && vehiculoName) {
        vehicleMeta[vKey].vehiculo = vehiculoName;
      }
    }

    // Sumar KM del día (Crucial para el tránsito)
    const distStr = getField(row, "Distancia (km)", "Distancia", "distancia", "km").replace(/[^\d.-]/g, '');
    const dist = parseFloat(distStr) || 0;
    if (!vehicleDailyKm[vKey]) vehicleDailyKm[vKey] = {};
    vehicleDailyKm[vKey][isoDateStr] = (vehicleDailyKm[vKey][isoDateStr] || 0) + dist;

    // Procesar Geocerca (Si existe)
    const geocercas = splitGeofences(getField(row, "Geocercas", "geocercas", "Geocerca"));
    if (geocercas.length) {
      // Filtrar bases/oficinas de la racha de "Asistencia" si es necesario, 
      // pero para el cálculo interno las necesitamos.
      const tiempoAparcado = getField(row, "Tiempo aparcado ", "Tiempo aparcado", "tiempo aparcado");
      const parsedSecs = parseDurationToSeconds(tiempoAparcado);
      // Keep a minimal positive weight when Navixy omits dwell time so presence
      // is still counted and does not disappear from that day's attendance.
      const secs = parsedSecs > 0 ? parsedSecs : 1;

      if (!vehicleDailyData[vKey]) vehicleDailyData[vKey] = {};
      if (!vehicleDailyData[vKey][isoDateStr]) vehicleDailyData[vKey][isoDateStr] = {};
      for (const geocerca of geocercas) {
        if (!vehicleDailyData[vKey][isoDateStr][geocerca]) vehicleDailyData[vKey][isoDateStr][geocerca] = 0;
        vehicleDailyData[vKey][isoDateStr][geocerca] = Math.min(vehicleDailyData[vKey][isoDateStr][geocerca] + secs, 86400);
      }
    }
  });

  const report: StreakReportRow[] = [];
  const auditTrail: AuditTrailType = {
    byVehicle: {},
    byGeocerca: {}
  };

  // Obtener lista global de todos los días procesados para cada vehículo
  const allVKeys = new Set([...Object.keys(vehicleDailyData), ...Object.keys(vehicleDailyKm)]);

  for (const vKey of Array.from(allVKeys)) {
    const meta = vehicleMeta[vKey];
    const dailyMap = vehicleDailyData[vKey] || {};
    const kmMap = vehicleDailyKm[vKey] || {};
    
    // Todos los días donde hubo o geocerca o movimiento
    const sortedDays = Array.from(new Set([...Object.keys(dailyMap), ...Object.keys(kmMap)])).sort();

    auditTrail.byVehicle[vKey] = { ...meta, days: [] };

    // 2. Pre-procesar días para asignar ganadores y detectar tránsitos
    const daySequence: { day: string, geo: string, secs: number, km: number }[] = [];
    
    for (const day of sortedDays) {
      const geoMap = dailyMap[day] || {};
      const km = kmMap[day] || 0;
      let winnerGeo = "";
      let maxSecs = -1;
      const geocercasVisited = [];

      for (const [geo, secs] of Object.entries(geoMap)) {
        geocercasVisited.push({ geocerca: geo, seconds: secs });

        // FILTRO DE RACHAS: Solo geocercas operativas ganan la racha
        const isAdmin = isAdministrativeGeofence(geo);

        if (!isAdmin && (secs > maxSecs || (secs === maxSecs && (!winnerGeo || geo.localeCompare(winnerGeo, "es") < 0)))) {
          winnerGeo = geo;
          maxSecs = secs;
        }
      }

      // Si no ganó una geocerca operativa (estuvo en base/oficina o paradas fuera de geocerca),
      // lo marcamos como tránsito para que el efecto imán lo resuelva con proyectos cercanos
      // o se identifique como "⚠️ FALTA ASIGNAR GEOCERCA" si no tiene proyecto asignado.
      if (!winnerGeo) {
        winnerGeo = "[EN TRÁNSITO / VIAJE]";
        maxSecs = 1; // Valor nominal
      }

      daySequence.push({ day, geo: winnerGeo, secs: maxSecs, km });
      
      // Registrar en auditoría
      auditTrail.byVehicle[vKey].days.push({
        date: day,
        winnerGeocerca: winnerGeo !== "[EN TRÁNSITO / VIAJE]" ? winnerGeo : (geocercasVisited[0]?.geocerca || "En Base / Fuera de Geocerca"),
        totalWinnerSeconds: maxSecs,
        geocercasVisited: geocercasVisited.sort((a,b) => b.seconds - a.seconds)
      });
    }

    // 3. Lógica de Fusión "Efecto Imán Inteligente":
    // Asigna tránsitos y fines de semana a la geocerca operativa si el intervalo es cercano (<= 3 días).
    // Si la estancia en base/sin geocerca es prolongada (> 3 días) o la unidad nunca visitó geocercas de proyecto,
    // se mantiene como "⚠️ FALTA ASIGNAR GEOCERCA" para alerta operativa y recordatorio al usuario.
    const finalSequence = daySequence.map(d => ({ ...d }));
    const MAX_MAGNET_GAP_DAYS = 3;

    const getDayDiff = (d1Str: string, d2Str: string): number => {
      try {
        const d1 = new Date(`${d1Str}T00:00:00`);
        const d2 = new Date(`${d2Str}T00:00:00`);
        return Math.abs(differenceInDays(d2, d1));
      } catch {
        return Infinity;
      }
    };

    for (let i = 0; i < finalSequence.length; i++) {
      if (finalSequence[i].geo === "[EN TRÁNSITO / VIAJE]") {
        // Buscar hacia atrás (Origen operativo previo)
        let prevGeo = "";
        let prevDist = Infinity;
        for (let k = i - 1; k >= 0; k--) {
          if (finalSequence[k].geo !== "[EN TRÁNSITO / VIAJE]" && !finalSequence[k].geo.startsWith("⚠️")) {
            prevGeo = finalSequence[k].geo;
            prevDist = getDayDiff(finalSequence[k].day, finalSequence[i].day);
            break;
          }
        }

        // Buscar hacia adelante (Destino operativo próximo)
        let nextGeo = "";
        let nextDist = Infinity;
        for (let j = i + 1; j < finalSequence.length; j++) {
          if (finalSequence[j].geo !== "[EN TRÁNSITO / VIAJE]" && !finalSequence[j].geo.startsWith("⚠️")) {
            nextGeo = finalSequence[j].geo;
            nextDist = getDayDiff(finalSequence[i].day, finalSequence[j].day);
            break;
          }
        }

        // Si está en medio del mismo proyecto con brecha razonable (ej: fin de semana viernes-lunes)
        if (prevGeo && nextGeo && prevGeo === nextGeo && (prevDist + nextDist) <= (MAX_MAGNET_GAP_DAYS + 1)) {
          finalSequence[i].geo = prevGeo;
        } else if (nextGeo && nextDist <= MAX_MAGNET_GAP_DAYS) {
          finalSequence[i].geo = nextGeo;
        } else if (prevGeo && prevDist <= MAX_MAGNET_GAP_DAYS) {
          finalSequence[i].geo = prevGeo;
        } else {
          finalSequence[i].geo = "⚠️ FALTA ASIGNAR GEOCERCA";
        }
      }
    }

    // La regla operativa es una sola geocerca ganadora por unidad y día.
    // La auditoría conserva todas las visitas candidatas; las rachas cuentan
    // únicamente la ganadora (máximo tiempo acumulado de permanencia).
    let currentStreak: {
      geocerca: string;
      startISO: string;
      lastISO: string;
      diasAsistidos: number;
    } | null = null;

    for (const d of finalSequence) {
      const geo = d.geo;
      if (!auditTrail.byGeocerca[geo]) {
        auditTrail.byGeocerca[geo] = { vehiculos: {}, totalDaysWon: 0 };
      }
      const tagVehiculo = meta.consecutivo ? `[${meta.consecutivo}] ${meta.placas}` : meta.placas;
      if (!auditTrail.byGeocerca[geo].vehiculos[tagVehiculo]) {
        auditTrail.byGeocerca[geo].vehiculos[tagVehiculo] = [];
      }
      auditTrail.byGeocerca[geo].vehiculos[tagVehiculo].push(d.day);
      auditTrail.byGeocerca[geo].totalDaysWon += 1;

      if (!currentStreak) {
        currentStreak = { geocerca: geo, startISO: d.day, lastISO: d.day, diasAsistidos: 1 };
      } else if (currentStreak.geocerca === geo) {
        currentStreak.lastISO = d.day;
        currentStreak.diasAsistidos += 1;
      } else {
        pushStreakRow(report, currentStreak, meta);
        currentStreak = { geocerca: geo, startISO: d.day, lastISO: d.day, diasAsistidos: 1 };
      }
    }

    if (currentStreak) pushStreakRow(report, currentStreak, meta);
  }

  report.sort((a, b) => {
    const geoComp = a.Geocerca.localeCompare(b.Geocerca);
    if (geoComp !== 0) return geoComp;
    return a.Inicio.localeCompare(b.Inicio);
  });

  return { report, auditTrail };
}

function pushStreakRow(
  targetArray: StreakReportRow[], 
  streak: { geocerca: string, startISO: string, lastISO: string, diasAsistidos: number },
  meta: { placas: string, consecutivo: string, vehiculo: string }
) {
  // Función para forzar formato YYYY-MM-DD
  const startStr = normalizeDate(streak.startISO);
  const endStr = normalizeDate(streak.lastISO);

  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  
  if (!isValid(start) || !isValid(end)) return;
  const diasCalendario = Math.max(1, differenceInDays(end, start) + 1);
  const formatES = (d: Date) => format(d, "dd/MM/yyyy");

  targetArray.push({
    Geocerca: streak.geocerca,
    Placas: meta.placas,
    Consecutivo: meta.consecutivo || "N/A",
    "Vehículo": meta.vehiculo,
    Inicio: streak.startISO,
    Fin: streak.lastISO,
    Periodo: `${formatES(start)} - ${formatES(end)}`,
    "Días asistidos": streak.diasAsistidos,
    "Días calendario": diasCalendario
  });
}
