import { RawTelemetryRow } from "./streaksAnalyzer";

export interface UnitStat {
  unit: string;
  placas: string;
  noches: number;
}

export interface DetectedHouse {
  id: string;
  lat: number;
  lng: number;
  direccion: string;
  tipo: "STAFF" | "CHOFER" | "BASE";
  unitStats: UnitStat[];
  totalNoches: number;
  fechaInicio: string;
  fechaFin: string;
  confirmada: boolean;
  descartada?: boolean;
}

/**
 * Extrae el consecutivo tipo AVH-037, VSI-COM-028, F&G-020 de un string
 */
function extractConsecutivo(text: string): string {
  if (!text) return "";
  // Busca patrones como AVH-037, VSI-COM-028, F&G-020, F & G-020
  // Lógica: Letras/Símbolos + Guion + (Opcional Letras+Guion) + Números
  const regex = /([A-Z0-9&]{1,10}(?:\s*-\s*[A-Z0-9&]{1,10})*\s*-\s*\d{2,4})/i;
  const match = text.match(regex);
  return match ? match[0].toUpperCase().replace(/\s+/g, '') : text;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function detectPernoctas(rawData: RawTelemetryRow[]): DetectedHouse[] {
  const nightSpots: { lat: number, lng: number, unit: string, placas: string, direccion: string, fecha: string }[] = [];
  
  // Para evitar contar múltiples puntos en una misma noche para el mismo vehículo
  const processedNights = new Set<string>();

  rawData.forEach(row => {
    const getField = (keys: string[]) => {
      const rowKeys = Object.keys(row);
      // 1. Intentar por nombre de columna conocido
      for (const k of keys) {
        const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
        if (match && row[match]) return String(row[match]).trim();
      }
      
      // 2. FUERZA BRUTA: Si no, buscar en TODO el renglón algo que parezca un consecutivo (AVH-037, etc)
      for (const rk of rowKeys) {
        const val = String(row[rk]);
        const found = extractConsecutivo(val);
        if (found !== val) return found; // Si extract encontró un patrón, lo devolvemos
      }

      return "";
    };

    const fullDateStr = getField(["inicio", "hora inicial", "fecha", "hora", "hora inicio"]);
    if (!fullDateStr) return;
    
    // Mejorar detección de hora: buscar patrón HH:MM en cualquier parte del string
    const timeMatch = fullDateStr.match(/(\d{1,2}):(\d{2})/);
    let hour = -1;
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
    } else {
      const d = new Date(fullDateStr);
      if (!isNaN(d.getTime())) hour = d.getHours();
    }

    const dist = parseFloat(getField(["distancia", "km", "dist", "recorrido"])) || 0;

    // RIGOR FLEXIBLE: Tolerancia de 150m (0.15km) para compensar drift de GPS en el norte
    if (hour !== -1 && (hour >= 21 || hour <= 7) && dist < 0.15) {
      const unitRaw = getField(["matrícula", "matricula", "placas", "unidad", "consecutivo", "económico", "economico", "vehículo", "vehiculo", "nombre"]);
      const unit = extractConsecutivo(unitRaw);
      const fecha = fullDateStr.split(" ")[0].replace(/\//g, '-');
      const key = `${unit}_${fecha}`;

      // Solo un registro por noche por vehículo
      if (processedNights.has(key)) return;
      processedNights.add(key);

      const lat = parseFloat(String(getField(["latitud", "lat"])).replace(/[^\d.-]/g, ''));
      const lng = parseFloat(String(getField(["longitud", "lng", "lon"])).replace(/[^\d.-]/g, ''));
      
      const placas = getField(["matrícula", "matricula", "placas"]);
      const direccion = getField(["dirección", "direccion", "lugar"]);

      if (!isNaN(lat) && !isNaN(lng) && unit && lat !== 0) {
        nightSpots.push({ lat, lng, unit, placas, direccion, fecha });
      }
    }
  });

  let houses: DetectedHouse[] = [];

  // Agrupar por proximidad (150m)
  nightSpots.forEach(spot => {
    let existingHouse = houses.find(h => getDistance(h.lat, h.lng, spot.lat, spot.lng) < 150);

    if (existingHouse) {
      let unitStat = existingHouse.unitStats.find(u => u.unit === spot.unit);
      if (unitStat) {
        unitStat.noches++;
      } else {
        existingHouse.unitStats.push({ unit: spot.unit, placas: spot.placas, noches: 1 });
      }
      existingHouse.totalNoches++;
      if (spot.fecha < existingHouse.fechaInicio) existingHouse.fechaInicio = spot.fecha;
      if (spot.fecha > existingHouse.fechaFin) existingHouse.fechaFin = spot.fecha;
    } else {
      houses.push({
        id: `house_${spot.lat.toFixed(4)}_${spot.lng.toFixed(4)}`,
        lat: spot.lat,
        lng: spot.lng,
        direccion: spot.direccion,
        tipo: "CHOFER",
        unitStats: [{ unit: spot.unit, placas: spot.placas, noches: 1 }],
        totalNoches: 1,
        fechaInicio: spot.fecha,
        fechaFin: spot.fecha,
        confirmada: false
      });
    }
  });

  // 3. FILTRO DE RIGOR ABSOLUTO: Solo ubicaciones estables con 4 o más noches
  // Esto descarta absolutamente cualquier parada ocasional, hotel o falla de GPS
  return houses
    .filter(h => h.totalNoches >= 4)
    .map(h => {
      const isBase = h.direccion.toLowerCase().includes("oficina");
      let tipo: "BASE" | "STAFF" | "CHOFER" = "CHOFER";
      
      if (isBase) {
        tipo = "BASE";
      } else if (h.unitStats.length >= 2) {
        tipo = "STAFF";
      } else {
        tipo = "CHOFER";
      }

      return { ...h, tipo } as DetectedHouse;
    })
    .sort((a, b) => b.totalNoches - a.totalNoches);
}
