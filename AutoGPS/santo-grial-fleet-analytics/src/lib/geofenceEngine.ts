/**
 * Geofence Proximity Engine
 * =========================
 * Motor de proximidad geográfica que carga las geocercas oficiales de Navixy
 * y determina si un punto (lat/lng) está dentro del radio de alguna geocerca.
 * 
 * Usa la fórmula de Haversine para calcular distancias reales en la superficie terrestre.
 * 100% local, sin APIs externas, sin costos.
 */

import Papa from "papaparse";

// ============================================================
// TIPOS
// ============================================================

export interface Geofence {
  nombre: string;
  lat: number;
  lng: number;
  area: string;
  grupo: string;
}

export interface ProximityResult {
  isNearGeofence: boolean;
  nearestGeofence: string;
  distanceKm: number;
}

// ============================================================
// FÓRMULA DE HAVERSINE
// ============================================================

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calcula la distancia en kilómetros entre dos puntos geográficos
 * usando la fórmula de Haversine (precisión < 0.5% en distancias cortas).
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// ============================================================
// GEOCERCA STORE (Singleton en memoria)
// ============================================================

const MASTER_STAFF_HOUSES: Geofence[] = [
  { nombre: "CASA STAFF - Veracruz Norte", lat: 19.21631, lng: -96.23111, area: "Sede Maestra", grupo: "STAFF" },
  { nombre: "CASA STAFF - Veracruz Sur", lat: 19.13036, lng: -96.17022, area: "Sede Maestra", grupo: "STAFF" },
  { nombre: "CASA STAFF - Mérida", lat: 20.90906, lng: -89.68558, area: "Sede Maestra", grupo: "STAFF" },
  { nombre: "CASA STAFF - Villahermosa", lat: 17.89272, lng: -93.16528, area: "Sede Maestra", grupo: "STAFF" },
  { nombre: "CASA STAFF - Chihuahua Impulso", lat: 28.7481, lng: -106.1624, area: "Sede Maestra", grupo: "STAFF" },
  { nombre: "CASA STAFF - Cadereyta Jiménez", lat: 25.591, lng: -100.001, area: "Sede Maestra", grupo: "STAFF" },
  { nombre: "CASA STAFF - Emmanuel (AVH-037)", lat: 17.99553, lng: -94.55371, area: "Minatitlán", grupo: "STAFF" }
];

let _geofences: Geofence[] = [...MASTER_STAFF_HOUSES];
let _loaded = false;

/**
 * Carga las geocercas desde el archivo /objects.csv en /public.
 * Solo las carga una vez; las siguientes llamadas devuelven el cache.
 */
export async function loadGeofences(): Promise<Geofence[]> {
  if (_loaded && _geofences.length > 0) return _geofences;

  try {
    const response = await fetch("/objects.csv");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    const csvGeofences = parsed.data
      .map((row: any) => {
        const nombre = (row["Nombre zona"] || "").trim();
        const lat = parseFloat(row["Latitud"]);
        const lng = parseFloat(row["Longitud"]);
        const area = (row["Área"] || row["Area"] || "").trim();
        const grupo = (row["Grupo"] || "").trim();

        if (!nombre || isNaN(lat) || isNaN(lng)) return null;

        return { nombre, lat, lng, area, grupo } as Geofence;
      })
      .filter(Boolean) as Geofence[];

    // Concatenar evitando duplicados por nombre
    const existingNames = new Set(_geofences.map(g => g.nombre));
    csvGeofences.forEach(cg => {
      if (!existingNames.has(cg.nombre)) {
        _geofences.push(cg);
      }
    });

    _loaded = true;
    console.log(`[GeofenceEngine] ${_geofences.length} geocercas totales en memoria (Oficiales + Maestras).`);
    return _geofences;
  } catch (err) {
    console.error("[GeofenceEngine] Error cargando geocercas:", err);
    return [];
  }
}

/**
 * Inyecta casas validadas del censo en el motor de geocercas
 * para que sean consideradas puntos de proximidad válidos.
 */
export function injectValidatedHouses(houses: any[]) {
  const censoGeofences = houses
    .filter(h => h.confirmada && !h.descartada)
    .map(h => ({
      nombre: `[CENSO] ${h.tipo}: ${h.direccion}`,
      lat: h.lat,
      lng: h.lng,
      area: "Censo Maestro",
      grupo: h.tipo
    }));

  // Combinar con las oficiales evitando duplicados
  const existingNames = new Set(_geofences.map(g => g.nombre));
  censoGeofences.forEach(cg => {
    if (!existingNames.has(cg.nombre)) {
      _geofences.push(cg);
    }
  });
  
  console.log(`[GeofenceEngine] ${censoGeofences.length} casas validadas inyectadas al motor.`);
}

/**
 * Devuelve las geocercas ya cargadas (sincrono). 
 */
export function getGeofences(): Geofence[] {
  return _geofences;
}

// ============================================================
// MOTOR DE PROXIMIDAD
// ============================================================

/**
 * Verifica si un punto (lat/lng) está dentro del radio de alguna geocerca.
 * @param lat Latitud del punto a evaluar
 * @param lng Longitud del punto a evaluar
 * @param radiusKm Radio de proximidad en km (default: 3 km)
 * @returns ProximityResult con la geocerca más cercana y la distancia
 */
export function checkProximity(
  lat: number,
  lng: number,
  radiusKm: number = 3
): ProximityResult {
  if (_geofences.length === 0 || isNaN(lat) || isNaN(lng)) {
    return { isNearGeofence: false, nearestGeofence: "", distanceKm: Infinity };
  }

  let nearestName = "";
  let nearestDist = Infinity;

  for (const gf of _geofences) {
    const dist = haversineDistance(lat, lng, gf.lat, gf.lng);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestName = gf.nombre;
    }
  }

  return {
    isNearGeofence: nearestDist <= radiusKm,
    nearestGeofence: nearestName,
    distanceKm: Math.round(nearestDist * 100) / 100,
  };
}

/**
 * Verifica si un vehículo tiene registros de parada (con lat/lng)
 * que estén cerca de alguna geocerca oficial durante un rango de fechas.
 * 
 * @param vehicleStops Array de paradas del vehículo con lat/lng/fecha
 * @param dateFrom Fecha inicio del período a evaluar
 * @param dateTo Fecha fin del período a evaluar
 * @param radiusKm Radio de proximidad (default: 3 km)
 */
export function vehicleVisitedGeofence(
  vehicleStops: Array<{ lat: number; lng: number; dateOnly: string }>,
  dateFrom: string,
  dateTo: string,
  radiusKm: number = 3
): ProximityResult {
  for (const stop of vehicleStops) {
    if (stop.dateOnly >= dateFrom && stop.dateOnly <= dateTo) {
      const result = checkProximity(stop.lat, stop.lng, radiusKm);
      if (result.isNearGeofence) {
        return result;
      }
    }
  }

  return { isNearGeofence: false, nearestGeofence: "", distanceKm: Infinity };
}
