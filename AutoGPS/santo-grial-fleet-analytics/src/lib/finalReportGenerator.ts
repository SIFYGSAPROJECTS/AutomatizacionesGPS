import { RawTelemetryRow } from "./reportDataEngine";
import { loadGeofences, checkProximity } from "./geofenceEngine";

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

export async function generateFinalMarkdownReport(rawParsedData: RawTelemetryRow[]): Promise<string> {
  if (!rawParsedData || rawParsedData.length === 0) return "No hay datos para analizar.";

  const PROXIMITY_RADIUS_KM = 3;
  const geofences = await loadGeofences();

  interface RouteStat {
    fecha: string;
    origen: string;
    destino: string;
    km: number;
  }

  interface VehicleStat {
    vehiculo: string;
    totalKm: number;
    weekends: Set<string>;
    maxSpeed: number;
    rutas: RouteStat[];
    hasNearbyGeofence: boolean;
  }

  const vehicleStats: Record<string, VehicleStat> = {};
  const vehicleOrigins: Record<string, string> = {};

  const processableRows = rawParsedData.map(row => {
    const fecha = getField(row, "fecha", "date", "Hora inicial ");
    const horaStr = getField(row, "hora", "Hora inicial");
    const vehiculo = getField(row, "vehiculo", "vehículo", "matricula");
    
    // Simplificar la fecha (asumimos formato y extraemos solo YYYY-MM-DD si es posible, o usamos lo que hay)
    const dateOnly = fecha.split(" ")[0]; 
    const timeOnly = horaStr.split(" ")[1] || horaStr;
    const timestamp = new Date(`${dateOnly} ${timeOnly}`).getTime() || 0;
    
    return { row, fecha: dateOnly, horaStr: timeOnly, vehiculo, timestamp };
  }).sort((a, b) => a.timestamp - b.timestamp);

  processableRows.forEach(({ row, fecha, horaStr, vehiculo }) => {
    if (!vehiculo) return;
    const actualVehiculo = vehiculo.trim();

    const distanciaStr = getField(row, "distancia (km)", "distancia", "km");
    const lugar = getField(row, "destino", "lugar", "direccion", "dirección", "Dirección");
    const velMaxStr = getField(row, "vel. máxima", "vel maxima", "velocidad maxima");
    const origenFila = getField(row, "origen", "Origen");
    
    // Manejo de AM/PM
    const lower = horaStr.toLowerCase();
    let timePart = horaStr.split(" ")[1] || horaStr;
    if (timePart.includes("p.") || timePart.includes("a.")) {
       timePart = horaStr.split(" ")[1] || horaStr.split(" ")[0];
    }
    
    const timeMatch = timePart.match(/(\d{1,2}):\d{2}/);
    if (!timeMatch) return;
    let hour = parseInt(timeMatch[1], 10);
    
    if (lower.includes("p.") || lower.includes("pm")) {
       if (hour < 12) hour += 12;
    } else if (lower.includes("a.") || lower.includes("am")) {
       if (hour === 12) hour = 0;
    }
    
    let isOffHours = false;
    let weekendId = "N/A";

    const parsedDate = new Date(fecha);
    if (!isNaN(parsedDate.getTime())) {
      const dayOfWeek = parsedDate.getUTCDay(); 
      
      if (dayOfWeek === 0 || dayOfWeek === 6) {
         const satDate = new Date(parsedDate);
         if (dayOfWeek === 0) satDate.setDate(satDate.getDate() - 1);
         const sunDate = new Date(satDate);
         sunDate.setDate(sunDate.getDate() + 1);
         const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
         weekendId = `${satDate.getUTCDate()} ${monthNames[satDate.getUTCMonth()]} - ${sunDate.getUTCDate()} ${monthNames[sunDate.getUTCMonth()]}`;
      }

      if (dayOfWeek === 0) {
        isOffHours = true; // Domingo todo el día
      } else if (dayOfWeek === 6) {
        isOffHours = hour >= 15; // Sábado después de las 3 PM
      }
    }

    const dist = parseFloat(distanciaStr) || 0;
    const velMax = parseFloat(velMaxStr) || 0;
    const origin = origenFila || vehicleOrigins[actualVehiculo] || "Punto de Partida";

    if (isOffHours && dist > 0) {
      if (!vehicleStats[actualVehiculo]) {
        vehicleStats[actualVehiculo] = {
          vehiculo: actualVehiculo,
          totalKm: 0,
          weekends: new Set<string>(),
          maxSpeed: 0,
          rutas: [],
          hasNearbyGeofence: false
        };
      }

      const stat = vehicleStats[actualVehiculo];
      stat.totalKm += dist;
      stat.weekends.add(weekendId);
      if (velMax > stat.maxSpeed) {
        stat.maxSpeed = velMax;
      }

      stat.rutas.push({
        fecha: fecha,
        origen: origin,
        destino: lugar,
        km: dist
      });

      // Verificar proximidad con geocercas (si hay coordenadas)
      if (geofences.length > 0 && !stat.hasNearbyGeofence) {
        const lat = parseFloat(getField(row, "Latitud", "latitud", "lat"));
        const lng = parseFloat(getField(row, "Longitud", "longitud", "lng", "lon"));
        if (!isNaN(lat) && !isNaN(lng)) {
          const proximity = checkProximity(lat, lng, PROXIMITY_RADIUS_KM);
          if (proximity.isNearGeofence) {
            stat.hasNearbyGeofence = true;
          }
        }
      }
    }

    vehicleOrigins[actualVehiculo] = lugar;
  });

  // Filtrar: solo los que NUNCA estuvieron cerca de una geocerca
  const sortedVehicles = Object.values(vehicleStats)
    .filter(v => !v.hasNearbyGeofence)
    .sort((a, b) => b.totalKm - a.totalKm)
    .slice(0, 10);

  if (sortedVehicles.length === 0) {
    return "No se encontraron viajes a deshoras o en fin de semana en la telemetría actual.";
  }

  let md = `# Reporte Ejecutivo Final: Top 10 Vehículos en Deshoras\n\n`;

  sortedVehicles.forEach((v, index) => {
    md += `## ${index + 1}. Vehículo: ${v.vehiculo}\n`;
    md += `- **Total de Km en Fin de Semana/Deshoras:** ${v.totalKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} km\n`;
    md += `- **Velocidad Máxima Alcanzada:** ${v.maxSpeed} km/h\n`;
    
    const weekendsList = Array.from(v.weekends).join(", ");
    md += `- **Fines de Semana de Actividad:** ${weekendsList}\n`;

    const topRoutes = [...v.rutas]
      .sort((a, b) => b.km - a.km)
      .slice(0, 3);

    md += `- **Top 3 Rutas Principales (Por Kilometraje):**\n`;
    topRoutes.forEach((route, rIndex) => {
      md += `  ${rIndex + 1}. [${route.fecha}] De *${route.origen}* a *${route.destino}* (${route.km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km)\n`;
    });
    md += `\n---\n\n`;
  });

  return md;
}
