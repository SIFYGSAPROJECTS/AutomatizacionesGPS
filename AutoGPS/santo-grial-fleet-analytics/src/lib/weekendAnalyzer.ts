import { isWithinInterval, parse, format } from "date-fns";
import { RawTelemetryRow } from "./streaksAnalyzer";

export interface WeekendUsageReport {
  summary: {
    totalUnits: number;
    unitsWithAlerts: number;
    totalAlertEvents: number;
    sundayEvents: number;
    saturdayEvents: number;
    dateRange: { from: string; to: string };
  };
  byUnit: UnitWeekendProfile[];
}

export interface UnitWeekendProfile {
  matricula: string;
  vehiculo: string;
  conductor: string;
  totalEvents: number;
  sundayEvents: number;
  saturdayEvents: number;
  topRoutes: RoutePattern[];
  weekendDays: WeekendDayDetail[];
}

export interface RoutePattern {
  direccion: string;
  count: number;
  lastSeen: string;
  hours: number[];
}

export interface WeekendDayDetail {
  fecha: string; // "2026-01-11"
  diaNombre: "sabado" | "domingo";
  conductor: string;
  eventos: {
    hora: string; // "08:22"
    direccion: string;
    esDomingo: boolean;
  }[];
}

const EXCLUDED_BASES = ["oficina minatitlán", "oficina mapachapa", "oficina comalcalco"];

function getField(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  const rowKeys = Object.keys(row);
  for (const c of candidates) {
    const cNorm = c.trim().toLowerCase();
    const found = rowKeys.find((k) => k.trim().toLowerCase() === cNorm);
    if (found !== undefined && row[found] !== undefined) return row[found];
  }
  return "";
}

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function analyzeWeekendUsage(
  rawData: RawTelemetryRow[],
  fromObj: Date | null,
  toObj: Date | null
): WeekendUsageReport {
  // Configuración del reporte de salida
  const summary = {
    totalUnits: 0,
    unitsWithAlerts: 0,
    totalAlertEvents: 0,
    sundayEvents: 0,
    saturdayEvents: 0,
    dateRange: { from: "", to: "" },
  };

  const unitMap = new Map<string, UnitWeekendProfile>();
  const globalDetectedUnits = new Set<string>();

  // Detección de límite global 
  let globalMinDate: Date | null = null;
  let globalMaxDate: Date | null = null;

  for (const row of rawData) {
    const matriculaRaw = getField(row, "Matrícula", "Matricula", "matrícula");
    if (matriculaRaw) globalDetectedUnits.add(matriculaRaw);

    // Obtener la fecha real del GPS en crudo
    const fechaStr = getField(row, "Inicio", "Hora inicial", "Hora de finalización", "fecha");
    if (!fechaStr) continue;

    // "2026-02-28 20:14:00.000" o similar
    const eventDate = new Date(fechaStr);
    if (isNaN(eventDate.getTime())) continue;

    const dayOfWeek = eventDate.getDay(); // 0 = Domingo, 6 = Sábado
    const hourOfDay = eventDate.getHours();

    // =============== LÓGICA DE NEGOCIO (FILTRO DE ALERTA) ===============
    // Los GPS suelen mandar un ping automático ("Heartbeat" de reconexión) al rotar
    // el día a las 00:00 horas marcando la misma ubicación en la que ya estaba la unidad.
    const esPingFantasma = (dayOfWeek === 0 && hourOfDay === 0); 
    
    // Solo marca alerta si NO es un ping fantasma
    const esDomingo = (dayOfWeek === 0 && !esPingFantasma);
    const esSabadoTarde = (dayOfWeek === 6 && hourOfDay >= 14);

    if (!esDomingo && !esSabadoTarde) {
      continue; // No es alerta de fin de semana, ignorar.
    }
    // ======================================================================

    // Para establecer defaults
    if (!globalMinDate || eventDate < globalMinDate) globalMinDate = eventDate;
    if (!globalMaxDate || eventDate > globalMaxDate) globalMaxDate = eventDate;

    // Filtro por rango provisto (si lo hay)
    if (fromObj && toObj) {
      const startGuard = new Date(fromObj);
      startGuard.setHours(0,0,0,0);
      const toGuard = new Date(toObj);
      toGuard.setHours(23,59,59,999);
      if (!isWithinInterval(eventDate, { start: startGuard, end: toGuard })) {
        continue;
      }
    }

    const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículos") || "Sin unidad";
    const direccion = getField(row, "Direccion", "Dirección", "direccion") || "Sin dirección";
    const conductor = getField(row, "Conductor", "conductor") || "Desconocido";
    
    // Extraer hora formateada para la renderización
    const hora = format(eventDate, "HH:mm");
    const numHora = hourOfDay;

    // Ignorar bases registradas
    const normDir = normalizeAddress(direccion);
    const isExcluded = EXCLUDED_BASES.some(base => normDir.includes(base) || direccion.toLowerCase().includes(base));
    if (isExcluded) continue;

    const unidadKey = matriculaRaw || vehiculo || "DESCONOCIDO";

    if (!unitMap.has(unidadKey)) {
      unitMap.set(unidadKey, {
        matricula: matriculaRaw,
        vehiculo,
        conductor,
        totalEvents: 0,
        sundayEvents: 0,
        saturdayEvents: 0,
        topRoutes: [],
        weekendDays: []
      });
    }

    const profile = unitMap.get(unidadKey)!;
    profile.totalEvents += 1;
    summary.totalAlertEvents += 1;

    if (esDomingo) {
      profile.sundayEvents += 1;
      summary.sundayEvents += 1;
    } else {
      profile.saturdayEvents += 1; // Ya sabemos que es sábado por la lógica superior
      summary.saturdayEvents += 1;
    }

    // Registrar Evento en Timeline
    const targetDateStr = format(eventDate, "yyyy-MM-dd");
    
    let wdd = profile.weekendDays.find(d => d.fecha === targetDateStr);
    if (!wdd) {
      wdd = {
        fecha: targetDateStr,
        diaNombre: esDomingo ? "domingo" : "sabado",
        conductor,
        eventos: []
      };
      profile.weekendDays.push(wdd);
    }
    
    let lastEvent = wdd.eventos[wdd.eventos.length - 1];
    // Deduplicación (evita marcar 2 veces seguidas la misma calle)
    if (!lastEvent || normalizeAddress(lastEvent.direccion) !== normDir) {
      wdd.eventos.push({
        hora,
        direccion,
        esDomingo
      });
    }

    // Tracker de rutas para detectar patrones en el fin de semana
    let ptrn = profile.topRoutes.find(r => normalizeAddress(r.direccion) === normDir);
    if (!ptrn) {
      ptrn = {
        direccion,
        count: 0,
        lastSeen: targetDateStr,
        hours: []
      };
      profile.topRoutes.push(ptrn);
    }
    ptrn.count += 1;
    if (targetDateStr > ptrn.lastSeen) ptrn.lastSeen = targetDateStr;
    if (!ptrn.hours.includes(numHora)) ptrn.hours.push(numHora);
  }

  // Post process & Sortings
  for (const profile of unitMap.values()) {
    // Sort routes frequency
    profile.topRoutes.sort((a, b) => b.count - a.count);
    if (profile.topRoutes.length > 5) {
      profile.topRoutes = profile.topRoutes.slice(0, 5); // top 5
    }

    // Date sort
    profile.weekendDays.sort((a,b) => a.fecha.localeCompare(b.fecha));

    for (const wd of profile.weekendDays) {
       wd.eventos.sort((a,b) => a.hora.localeCompare(b.hora));
    }
  }

  summary.totalUnits = globalDetectedUnits.size;
  summary.unitsWithAlerts = unitMap.size;
  
  if (globalMinDate && globalMaxDate) {
      summary.dateRange = {
          from: globalMinDate.toISOString(),
          to: globalMaxDate.toISOString()
      };
  }

  const profilesArray = Array.from(unitMap.values()).sort((a,b) => b.totalEvents - a.totalEvents);

  return {
    summary,
    byUnit: profilesArray
  };
}
