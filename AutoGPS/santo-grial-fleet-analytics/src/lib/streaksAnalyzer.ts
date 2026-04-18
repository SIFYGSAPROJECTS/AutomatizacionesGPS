import { format, differenceInDays, isValid } from "date-fns";

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
  const match = durStr.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return parseInt(match[1]||'0',10)*3600 + parseInt(match[2]||'0',10)*60 + parseFloat(match[3]||'0');
}

export function processStreaks(rawRows: RawTelemetryRow[]): AnalysisResult {
  const validRows = rawRows.filter(r => {
    const geocerca = getField(r, "Geocercas", "geocercas");
    if (!geocerca || geocerca.trim() === "") return false;
    const gUpper = geocerca.toUpperCase();
    if (gUpper.includes("OFICINA") || gUpper.includes("BASE")) return false; 
    return true;
  });

  const vehicleDailyData: Record<string, Record<string, Record<string, number>>> = {};
  const vehicleMeta: Record<string, { placas: string, consecutivo: string, vehiculo: string }> = {};

  validRows.forEach(row => {
    const geocerca = getField(row, "Geocercas", "geocercas").trim();
    const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial");
    if (!horaInicial) return;
    
    const dateStr = horaInicial.split(" ")[0];
    if (dateStr.length < 8) return;

    const matricula = getField(row, "Matrícula", "Matricula", "matrícula", "matricula");
    const parts = (matricula || "").split(" ");
    const placas = parts[0] || "";
    const consecutivo = parts[1] || "";
    const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículo", "vehiculo").trim();
    const vKey = `${placas}_${consecutivo}_${vehiculo}`;
    
    if (!vehicleMeta[vKey]) {
      vehicleMeta[vKey] = { placas, consecutivo, vehiculo };
    }

    const tiempoAparcado = getField(row, "Tiempo aparcado ", "Tiempo aparcado", "tiempo aparcado");
    const secs = parseDurationToSeconds(tiempoAparcado);

    if (!vehicleDailyData[vKey]) vehicleDailyData[vKey] = {};
    if (!vehicleDailyData[vKey][dateStr]) vehicleDailyData[vKey][dateStr] = {};
    if (!vehicleDailyData[vKey][dateStr][geocerca]) vehicleDailyData[vKey][dateStr][geocerca] = 0;

    // Sumamos segundos. Limitamos agresivamente a 86,400 (24 horas) para evitar bug visual en Auditoría 
    // en caso de que telemetría lance superposiciones extremas.
    vehicleDailyData[vKey][dateStr][geocerca] = Math.min(vehicleDailyData[vKey][dateStr][geocerca] + secs, 86400);
  });

  const report: StreakReportRow[] = [];
  const auditTrail: AuditTrailType = {
    byVehicle: {},
    byGeocerca: {}
  };

  for (const vKey of Object.keys(vehicleDailyData)) {
    const meta = vehicleMeta[vKey];
    const dailyMap = vehicleDailyData[vKey];
    const sortedDays = Object.keys(dailyMap).sort();

    auditTrail.byVehicle[vKey] = { ...meta, days: [] };

    let currentStreak: {
      geocerca: string;
      startISO: string;
      lastISO: string;
      diasAsistidos: number;
    } | null = null;

    for (const day of sortedDays) {
      const geoMap = dailyMap[day];
      let winnerGeo = "";
      let maxSecs = -1;
      
      const geocercasVisited = [];

      for (const [geo, secs] of Object.entries(geoMap)) {
        geocercasVisited.push({ geocerca: geo, seconds: secs });
        if (secs > maxSecs) {
          winnerGeo = geo;
          maxSecs = secs;
        }
      }

      if (!winnerGeo) continue;

      // Registrar en auditoría
      auditTrail.byVehicle[vKey].days.push({
        date: day,
        winnerGeocerca: winnerGeo,
        totalWinnerSeconds: maxSecs,
        geocercasVisited: geocercasVisited.sort((a,b) => b.seconds - a.seconds)
      });

      // Llenar resumen inverso Geocerca -> Vehiculos -> Dias ganados
      if (!auditTrail.byGeocerca[winnerGeo]) {
        auditTrail.byGeocerca[winnerGeo] = { vehiculos: {}, totalDaysWon: 0 };
      }
      const tagVehiculo = meta.consecutivo ? `[${meta.consecutivo}] ${meta.placas}` : meta.placas;
      if (!auditTrail.byGeocerca[winnerGeo].vehiculos[tagVehiculo]) {
        auditTrail.byGeocerca[winnerGeo].vehiculos[tagVehiculo] = [];
      }
      auditTrail.byGeocerca[winnerGeo].vehiculos[tagVehiculo].push(day);
      auditTrail.byGeocerca[winnerGeo].totalDaysWon += 1;

      // Lógica ganadora
      if (!currentStreak) {
        currentStreak = { geocerca: winnerGeo, startISO: day, lastISO: day, diasAsistidos: 1 };
      } else {
        if (currentStreak.geocerca === winnerGeo) {
          currentStreak.lastISO = day;
          currentStreak.diasAsistidos += 1;
        } else {
          pushStreakRow(report, currentStreak, meta);
          currentStreak = { geocerca: winnerGeo, startISO: day, lastISO: day, diasAsistidos: 1 };
        }
      }
    }

    if (currentStreak) {
      pushStreakRow(report, currentStreak, meta);
    }
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
  const start = new Date(`${streak.startISO}T00:00:00`);
  const end = new Date(`${streak.lastISO}T00:00:00`);
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
