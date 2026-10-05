import fleetDataRaw from "./fleetEquipmentData.json" with { type: "json" };
import { StreakReportRow } from "./streaksAnalyzer";
import { format, differenceInDays } from "date-fns";

export interface FleetUnitEquipment {
  consecutivo: string;
  placas: string;
  vehiculo: string;
  departamento: string;
  ubicacion: string;
  conductor: string;
  activa: boolean;
  hasGps: boolean;
  hasCamara: boolean;
}

export const MISSING_GEOCERCA_LABEL = "⚠️ FALTA ASIGNAR GEOCERCA";

export const DEFAULT_ACTIVE_FLEET: FleetUnitEquipment[] = fleetDataRaw as FleetUnitEquipment[];

export function cleanIdentifier(s: string): string {
  if (!s) return "";
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Mapa indexado para búsquedas ultrarrápidas O(1)
const equipmentByCleanKey = new Map<string, FleetUnitEquipment>();

DEFAULT_ACTIVE_FLEET.forEach((item) => {
  const cKey = cleanIdentifier(item.consecutivo);
  const pKey = cleanIdentifier(item.placas);
  if (cKey) equipmentByCleanKey.set(cKey, item);
  if (pKey) equipmentByCleanKey.set(pKey, item);
});

/**
 * Obtiene el equipamiento de un vehículo buscando por Consecutivo o Placas.
 * Soporta sobreescritura local en el navegador (ej: marcar cámara instalada o retirada).
 */
export function getVehicleEquipment(consecutivoOrPlacas?: string): FleetUnitEquipment | undefined {
  if (!consecutivoOrPlacas) return undefined;
  const key = cleanIdentifier(consecutivoOrPlacas);
  const base = equipmentByCleanKey.get(key);
  if (!base) return undefined;

  // Si estamos en navegador, comprobar overrides en localStorage
  if (typeof window !== "undefined") {
    try {
      const overridesRaw = localStorage.getItem("fleet_equipment_overrides");
      if (overridesRaw) {
        const overrides = JSON.parse(overridesRaw);
        if (overrides[base.consecutivo]) {
          return { ...base, ...overrides[base.consecutivo] };
        }
      }
    } catch {
      // Ignorar fallo de parseo
    }
  }

  return base;
}

/**
 * Permite alternar o actualizar el estatus de equipamiento (ej. cámara) desde la interfaz
 */
export function updateVehicleEquipmentOverride(
  consecutivo: string,
  updates: Partial<Pick<FleetUnitEquipment, "hasCamara" | "hasGps">>
) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("fleet_equipment_overrides") || "{}";
    const parsed = JSON.parse(raw);
    parsed[consecutivo] = { ...(parsed[consecutivo] || {}), ...updates };
    localStorage.setItem("fleet_equipment_overrides", JSON.stringify(parsed));
  } catch (e) {
    console.error("Error guardando equipment override:", e);
  }
}

/**
 * Retorna las unidades activas en flota que NO cuentan con GPS instalado
 */
export function getActiveUnitsWithoutGps(): FleetUnitEquipment[] {
  return DEFAULT_ACTIVE_FLEET.filter((u) => !u.hasGps);
}

/**
 * Inyecta las unidades operativas sin GPS (o pendientes) al reporte de rachas
 * para que aparezcan en el reporte de geocercas con el recordatorio `⚠️ FALTA ASIGNAR GEOCERCA`.
 */
export function enrichStreakReportWithActiveUnits(
  currentReport: StreakReportRow[],
  targetDateFrom?: string,
  targetDateTo?: string
): StreakReportRow[] {
  const result: StreakReportRow[] = [...currentReport];

  // 1. Determinar el rango de fechas representativo del período
  let startISO = targetDateFrom || "";
  let endISO = targetDateTo || "";

  if (!startISO || !endISO) {
    const allDates = currentReport.flatMap((r) => [r.Inicio, r.Fin]).filter(Boolean).sort();
    if (allDates.length > 0) {
      if (!startISO) startISO = allDates[0];
      if (!endISO) endISO = allDates[allDates.length - 1];
    } else {
      const now = new Date();
      startISO = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
      endISO = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");
    }
  }

  let totalDays = 1;
  try {
    const d1 = new Date(startISO + "T00:00:00");
    const d2 = new Date(endISO + "T00:00:00");
    totalDays = Math.max(1, differenceInDays(d2, d1) + 1);
  } catch {
    totalDays = 30;
  }

  const formatPeriod = (s: string, e: string) => {
    try {
      const p1 = s.split("-");
      const p2 = e.split("-");
      if (p1.length === 3 && p2.length === 3) {
        return `${p1[2]}/${p1[1]}/${p1[0]} - ${p2[2]}/${p2[1]}/${p2[0]}`;
      }
    } catch {}
    return `${s} - ${e}`;
  };

  const periodFormatted = formatPeriod(startISO, endISO);

  // 2. Revisar qué unidades activas sin GPS no están aún en el reporte
  const existingConsecutivos = new Set(result.map((r) => cleanIdentifier(r.Consecutivo)));
  const existingPlacas = new Set(result.map((r) => cleanIdentifier(r.Placas)));

  const missingUnits = DEFAULT_ACTIVE_FLEET.filter((unit) => {
    const cClean = cleanIdentifier(unit.consecutivo);
    const pClean = cleanIdentifier(unit.placas);
    const alreadyExists = (cClean && existingConsecutivos.has(cClean)) || (pClean && existingPlacas.has(pClean));
    return !alreadyExists;
  });

  // 3. Añadirlas con el recordatorio oficial
  missingUnits.forEach((unit) => {
    result.push({
      Geocerca: MISSING_GEOCERCA_LABEL,
      Placas: unit.placas || "SIN PLACA",
      Consecutivo: unit.consecutivo,
      Vehículo: unit.vehiculo || unit.consecutivo,
      Inicio: startISO,
      Fin: endISO,
      Periodo: periodFormatted,
      "Días asistidos": totalDays,
      "Días calendario": totalDays,
    });
  });

  // 4. Re-ordenar poniendo las advertencias arriba o por geocerca
  return result.sort((a, b) => {
    const aIsWarn = a.Geocerca.startsWith("⚠️");
    const bIsWarn = b.Geocerca.startsWith("⚠️");
    if (aIsWarn && !bIsWarn) return -1;
    if (!aIsWarn && bIsWarn) return 1;
    const geoComp = a.Geocerca.localeCompare(b.Geocerca);
    if (geoComp !== 0) return geoComp;
    return a.Inicio.localeCompare(b.Inicio);
  });
}
