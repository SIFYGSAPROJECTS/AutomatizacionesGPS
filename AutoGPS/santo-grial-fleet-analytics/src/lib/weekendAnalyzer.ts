import { isWithinInterval, parse, format } from "date-fns";
import { RawTelemetryRow } from "./streaksAnalyzer";
import { parseDateRobust } from "./utils";
import { checkProximity, getGeofences } from "./geofenceEngine";
import dictionary from "./dictionary.json";

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
  consecutivo: string;
  modelo: string;
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
  
  let globalMinDate: Date | null = null;
  let globalMaxDate: Date | null = null;

  // --- PRIMERA PASADA: Identificar todos los vehículos y precargar perfiles ---
  for (const row of rawData) {
    const matriculaRaw = getField(row, "Matrícula", "Matricula", "matrícula");
    const vehiculoRaw = getField(row, "Vehículo", "Vehiculo", "vehículos") || "Sin unidad";
    
    if (matriculaRaw) globalDetectedUnits.add(matriculaRaw);

    const fechaStr = getField(row, "Inicio", "Hora inicial", "Hora de finalización", "fecha");
    let eventMonth = "";
    if (fechaStr) {
       const d = parseDateRobust(fechaStr);
       if (!isNaN(d.getTime())) eventMonth = format(d, "yyyy-MM");
    }

    const matParts = (matriculaRaw || "").trim().split(/\s+/);
    const p1 = matParts[0]?.toLowerCase() || "";
    const p2 = matParts[1]?.toLowerCase() || "";

    const relationalUnit = dictionary.unidadesRelacionales.find(
      (u: any) => {
        const uPlacas = u.Placas.trim().toLowerCase();
        const uConsecutivo = u.Consecutivo.trim().toLowerCase();
        const uVehiculo = u.Vehículo.trim().toLowerCase();
        const rowVehiculo = vehiculoRaw.trim().toLowerCase();
        return u.Mes === eventMonth && (
          (p1 && (uPlacas === p1 || uConsecutivo === p1)) ||
          (p2 && (uPlacas === p2 || uConsecutivo === p2)) ||
          (rowVehiculo && uVehiculo === rowVehiculo)
        );
      }
    ) || dictionary.unidadesRelacionales.find(
      (u: any) => {
        const uPlacas = u.Placas.trim().toLowerCase();
        const uConsecutivo = u.Consecutivo.trim().toLowerCase();
        const uVehiculo = u.Vehículo.trim().toLowerCase();
        const rowVehiculo = vehiculoRaw.trim().toLowerCase();
        return (!u.Mes) && (
          (p1 && (uPlacas === p1 || uConsecutivo === p1)) ||
          (p2 && (uPlacas === p2 || uConsecutivo === p2)) ||
          (rowVehiculo && uVehiculo === rowVehiculo)
        );
      }
    );

    const matricula = relationalUnit?.Placas || matriculaRaw || "Sin placas";
    const consecutivo = relationalUnit?.Consecutivo || "Sin consecutivo";
    const modelo = relationalUnit?.Vehículo || vehiculoRaw || "Sin modelo/tipo";
    const unidadKey = matricula || consecutivo || "DESCONOCIDO";

    if (!unitMap.has(unidadKey)) {
      unitMap.set(unidadKey, {
        matricula,
        consecutivo,
        modelo,
        vehiculo: vehiculoRaw || modelo,
        conductor: getField(row, "Conductor", "conductor") || "Desconocido",
        totalEvents: 0,
        sundayEvents: 0,
        saturdayEvents: 0,
        topRoutes: [],
        weekendDays: []
      });
    }
  }

  // --- SEGUNDA PASADA: Filtrado de eventos ---
  for (const row of rawData) {
    const fechaStr = getField(row, "Inicio", "Hora inicial", "Hora de finalización", "fecha");
    if (!fechaStr) continue;

    const eventDate = parseDateRobust(fechaStr);
    if (isNaN(eventDate.getTime())) continue;

    // Filtro de fechas independiente (From y To separados)
    if (fromObj) {
      const startGuard = new Date(fromObj);
      startGuard.setHours(0,0,0,0);
      if (eventDate < startGuard) continue;
    }
    if (toObj) {
      const toGuard = new Date(toObj);
      toGuard.setHours(23,59,59,999);
      if (eventDate > toGuard) continue;
    }

    if (!globalMinDate || eventDate < globalMinDate) globalMinDate = eventDate;
    if (!globalMaxDate || eventDate > globalMaxDate) globalMaxDate = eventDate;

    const dayOfWeek = eventDate.getDay(); 
    const hourOfDay = eventDate.getHours();
    const minuteOfDay = eventDate.getMinutes();

    if (hourOfDay === 0 && minuteOfDay === 0) continue;

    const latStr = getField(row, "Latitud", "lat", "lat.", "latitude", "y").replace(/[^\d.-]/g, '');
    const lngStr = getField(row, "Longitud", "lng", "lon", "lon.", "long.", "longitude", "x").replace(/[^\d.-]/g, '');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (!isNaN(lat) && !isNaN(lng)) {
      const prox = checkProximity(lat, lng, 0.5);
      if (prox.isNearGeofence) {
        const geoName = prox.nearestGeofence.toLowerCase();
        const isAuthorizedParking = geoName.includes("casa staff") || 
                                    geoName.includes("oficina") || 
                                    geoName.includes("base") || 
                                    geoName.includes("taller");
        
        if (isAuthorizedParking) continue;
      }
    }

    const direccion = getField(row, "Direccion", "Dirección", "direccion") || "Sin dirección";
    const normDir = normalizeAddress(direccion);
    const isExcluded = EXCLUDED_BASES.some(base => normDir.includes(base) || direccion.toLowerCase().includes(base));
    if (isExcluded) continue;

    const esDomingo = (dayOfWeek === 0);
    const esSabadoTarde = (dayOfWeek === 6 && hourOfDay >= 14);

    if (!esDomingo && !esSabadoTarde) continue;

    const matriculaRaw = getField(row, "Matrícula", "Matricula", "matrícula");
    const vehiculoRaw = getField(row, "Vehículo", "Vehiculo", "vehículos") || "Sin unidad";
    
    let eventMonth = format(eventDate, "yyyy-MM");
    const matParts = (matriculaRaw || "").trim().split(/\s+/);
    const p1 = matParts[0]?.toLowerCase() || "";
    const p2 = matParts[1]?.toLowerCase() || "";

    const relationalUnit = dictionary.unidadesRelacionales.find(
      (u: any) => {
        const uPlacas = u.Placas.trim().toLowerCase();
        const uConsecutivo = u.Consecutivo.trim().toLowerCase();
        const uVehiculo = u.Vehículo.trim().toLowerCase();
        const rowVehiculo = vehiculoRaw.trim().toLowerCase();
        return u.Mes === eventMonth && (
          (p1 && (uPlacas === p1 || uConsecutivo === p1)) ||
          (p2 && (uPlacas === p2 || uConsecutivo === p2)) ||
          (rowVehiculo && uVehiculo === rowVehiculo)
        );
      }
    ) || dictionary.unidadesRelacionales.find(
      (u: any) => {
        const uPlacas = u.Placas.trim().toLowerCase();
        const uConsecutivo = u.Consecutivo.trim().toLowerCase();
        const uVehiculo = u.Vehículo.trim().toLowerCase();
        const rowVehiculo = vehiculoRaw.trim().toLowerCase();
        return (!u.Mes) && (
          (p1 && (uPlacas === p1 || uConsecutivo === p1)) ||
          (p2 && (uPlacas === p2 || uConsecutivo === p2)) ||
          (rowVehiculo && uVehiculo === rowVehiculo)
        );
      }
    );

    const matricula = relationalUnit?.Placas || matriculaRaw || "Sin placas";
    const consecutivo = relationalUnit?.Consecutivo || "Sin consecutivo";
    const unidadKey = matricula || consecutivo || "DESCONOCIDO";

    const profile = unitMap.get(unidadKey);
    if (!profile) continue;

    profile.totalEvents += 1;
    summary.totalAlertEvents += 1;

    if (esDomingo) {
      profile.sundayEvents += 1;
      summary.sundayEvents += 1;
    } else {
      profile.saturdayEvents += 1;
      summary.saturdayEvents += 1;
    }

    const targetDateStr = format(eventDate, "yyyy-MM-dd");
    let wdd = profile.weekendDays.find(d => d.fecha === targetDateStr);
    if (!wdd) {
      wdd = {
        fecha: targetDateStr,
        diaNombre: esDomingo ? "domingo" : "sabado",
        conductor: profile.conductor,
        eventos: []
      };
      profile.weekendDays.push(wdd);
    }
    
    wdd.eventos.push({
      hora: format(eventDate, "HH:mm"),
      direccion,
      esDomingo
    });

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
    if (!ptrn.hours.includes(hourOfDay)) ptrn.hours.push(hourOfDay);
  }

  for (const profile of unitMap.values()) {
    profile.topRoutes.sort((a, b) => b.count - a.count);
    if (profile.topRoutes.length > 10) profile.topRoutes = profile.topRoutes.slice(0, 10);
    profile.weekendDays.sort((a,b) => a.fecha.localeCompare(b.fecha));
    for (const wd of profile.weekendDays) {
       wd.eventos.sort((a,b) => a.hora.localeCompare(b.hora));
    }
  }

  summary.totalUnits = globalDetectedUnits.size || unitMap.size;
  summary.unitsWithAlerts = Array.from(unitMap.values()).filter(p => p.totalEvents > 0).length;
  
  if (fromObj && toObj) {
      summary.dateRange = {
          from: fromObj.toISOString(),
          to: toObj.toISOString()
      };
  } else if (globalMinDate && globalMaxDate) {
      summary.dateRange = {
          from: globalMinDate.toISOString(),
          to: globalMaxDate.toISOString()
      };
  }

  const profilesArray = Array.from(unitMap.values()).sort((a,b) => {
    if (b.totalEvents !== a.totalEvents) return b.totalEvents - a.totalEvents;
    return a.consecutivo.localeCompare(b.consecutivo);
  });

  return {
    summary,
    byUnit: profilesArray
  };
}
