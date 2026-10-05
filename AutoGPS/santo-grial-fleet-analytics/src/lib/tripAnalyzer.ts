import { parseDateRobust } from "./utils";
import { parseDurationToSeconds } from "./stopProfiler";

export interface TripEvent {
  vehiculo: string;
  matricula: string;
  conductor: string;
  
  originAddress: string;
  destinationAddress: string;
  
  departureTime: Date; // Cuando salió de origin
  arrivalTime: Date;   // Cuando llegó a destination
  durationMinutes: number; // Duración del viaje
  
  tripType: "Micro" | "Corto" | "Medio" | "Largo";
  
  isWeekend: boolean; // Si ocurrió en Sábado o Domingo
}

export interface RouteAggregation {
  routeKey: string; // "Origen -> Destino"
  origin: string;
  destination: string;
  tripCount: number;
  averageDurationMinutes: number;
  tripTypeCategory: "Micro" | "Corto" | "Medio" | "Largo";
  vehicles: string[];
  durationsArr?: number[]; // Temporal para calcular mediana
}

export interface TripAnalysisReport {
  allTrips: TripEvent[];
  weekendTrips: TripEvent[];
  frequentRoutes: RouteAggregation[];
  frequentWeekendRoutes: RouteAggregation[];
  kpis: {
    totalWeekendTrips: number;
    microTripsWeekend: number;
    shortTripsWeekend: number;
    mediumTripsWeekend: number;
    longTripsWeekend: number;
    mostFrequentWeekendRoute: string;
  };
}

// Utilidades auxiliares
function getField(row: Record<string, string>, ...candidates: string[]): string {
  const keys = Object.keys(row);
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
    const lower = c.trim().toLowerCase();
    const found = keys.find(k => k.trim().toLowerCase() === lower);
    if (found && row[found] !== undefined) return row[found];
  }
  return "";
}

function normalizeAddress(addr: string): string {
  return addr.trim().replace(/\s+/g, " ");
}

function getTripCategory(minutes: number): "Micro" | "Corto" | "Medio" | "Largo" {
  if (minutes < 10) return "Micro";
  if (minutes <= 30) return "Corto";
  if (minutes <= 60) return "Medio";
  return "Largo";
}

export function analyzeTrips(rawRows: Record<string, string>[]): TripAnalysisReport {
  // 1. Agrupar por vehículo
  const vehicleMap = new Map<string, Record<string, string>[]>();
  
  for (const row of rawRows) {
    const matricula = getField(row, "Matrícula", "Matricula", "matrícula");
    const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículo").trim();
    const vId = (matricula || vehiculo).trim();
    if (!vId) continue;
    
    if (!vehicleMap.has(vId)) vehicleMap.set(vId, []);
    vehicleMap.get(vId)!.push(row);
  }

  const allTrips: TripEvent[] = [];

  // 2. Por cada vehículo, ordenar cronológicamente y deducir viajes
  for (const [vId, rows] of vehicleMap.entries()) {
    // Extraer y normalizar los eventos con tiempos válidos
    const events = rows.map(r => {
      const hInicio = getField(r, "Hora inicial ", "Hora inicial", "hora inicial", "Inicio");
      const hFinal = getField(r, "Hora final ", "Hora final", "hora final", "Fin", "Final");
      const durStr = getField(r, "Tiempo aparcado ", "Tiempo aparcado", "tiempo aparcado", "Duración", "Duracion", "duracion");
      const dir = getField(r, "Dirección", "Direccion", "direccion");
      
      let inicioDate = parseDateRobust(hInicio);
      let finDate = parseDateRobust(hFinal);

      // Fallback: Si no hay Hora Final, la calculamos sumando la duración a la Hora Inicial
      if (isNaN(finDate.getTime()) && !isNaN(inicioDate.getTime()) && durStr) {
        const secs = parseDurationToSeconds(durStr);
        finDate = new Date(inicioDate.getTime() + (secs * 1000));
      }

      return {
        row: r,
        inicio: inicioDate,
        fin: finDate,
        dir: normalizeAddress(dir)
      };
    }).filter(e => !isNaN(e.inicio.getTime()));

    // Ordenar por hora de llegada (inicio de la parada)
    events.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

    let currentStopIndex = 0;
    while (currentStopIndex < events.length - 1) {
      const currentStop = events[currentStopIndex];

      // Si la parada actual no tiene hora final, no podemos saber a qué hora salió exactamente.
      if (isNaN(currentStop.fin.getTime())) {
        currentStopIndex++;
        continue;
      }

      // Buscar la siguiente parada válida que comience DESPUÉS de que terminó la parada actual
      let nextStopIndex = currentStopIndex + 1;
      while (nextStopIndex < events.length && events[nextStopIndex].inicio <= currentStop.fin) {
        // Ignoramos "paradas fantasma" que ocurren mientras el vehículo ya está marcado como aparcado
        nextStopIndex++;
      }

      if (nextStopIndex >= events.length) break; // No hay más paradas reales
      const nextStop = events[nextStopIndex];

      const departureTime = currentStop.fin;
      const arrivalTime = nextStop.inicio;

      // Calcular diferencia en minutos
      const durationMin = (arrivalTime.getTime() - departureTime.getTime()) / 60000;
      
      // Filtro anti-ruido extremo: Ignorar saltos absurdos de más de 30 días (GPS desconectado meses)
      if (durationMin > 43200) {
        currentStopIndex = nextStopIndex;
        continue; 
      }

      const dayOfWeek = departureTime.getDay(); // 0 = Domingo, 6 = Sábado
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 5; // Incluir Viernes para viajes que inician ahí y terminan el fin de semana

      const matricula = getField(currentStop.row, "Matrícula", "Matricula", "matrícula");
      const vehiculo = getField(currentStop.row, "Vehículo", "Vehiculo", "vehículo");
      const conductor = getField(currentStop.row, "Conductor", "conductor").trim() || "Desconocido";

      allTrips.push({
        vehiculo: vehiculo || matricula,
        matricula: matricula || vehiculo,
        conductor,
        originAddress: currentStop.dir,
        destinationAddress: nextStop.dir,
        departureTime,
        arrivalTime,
        durationMinutes: Math.round(durationMin),
        tripType: getTripCategory(durationMin),
        isWeekend
      });

      // Avanzar el puntero a la siguiente parada válida
      currentStopIndex = nextStopIndex;
    }
  }

  // 3. Aislar Viajes de Fin de Semana
  const weekendTrips = allTrips.filter(t => t.isWeekend);

  // 4. Agregar Rutas (Origen -> Destino)
  const buildRouteAgg = (tripsList: TripEvent[]) => {
    const routeMap = new Map<string, RouteAggregation>();
    
    for (const trip of tripsList) {
      if (!trip.originAddress || !trip.destinationAddress) continue;
      // Normalizar la llave de ruta para evitar diferencias de mayúsculas/minúsculas
      const key = `${trip.originAddress.toLowerCase()} -> ${trip.destinationAddress.toLowerCase()}`;
      
      if (!routeMap.has(key)) {
        routeMap.set(key, {
          routeKey: `${trip.originAddress} -> ${trip.destinationAddress}`,
          origin: trip.originAddress,
          destination: trip.destinationAddress,
          tripCount: 0,
          averageDurationMinutes: 0,
          tripTypeCategory: "Micro",
          vehicles: [],
          durationsArr: []
        });
      }
      
      const agg = routeMap.get(key)!;
      agg.tripCount++;
      agg.durationsArr!.push(trip.durationMinutes);
      if (!agg.vehicles.includes(trip.vehiculo)) {
        agg.vehicles.push(trip.vehiculo);
      }
    }

    // Calcular la MEDIANA (evita que un solo viaje atípico dispare el promedio)
    const result = Array.from(routeMap.values()).map(agg => {
      const arr = agg.durationsArr!.sort((a, b) => a - b);
      const mid = Math.floor(arr.length / 2);
      agg.averageDurationMinutes = arr.length % 2 !== 0 
        ? arr[mid] 
        : Math.round((arr[mid - 1] + arr[mid]) / 2);
        
      agg.tripTypeCategory = getTripCategory(agg.averageDurationMinutes);
      delete agg.durationsArr; // Limpiar para no mandar data pesada al front
      return agg;
    });

    return result.sort((a, b) => b.tripCount - a.tripCount);
  };

  const frequentRoutes = buildRouteAgg(allTrips);
  const frequentWeekendRoutes = buildRouteAgg(weekendTrips);

  // 5. Calcular KPIs de Fines de Semana
  let micro = 0, short = 0, medium = 0, long = 0;
  for (const t of weekendTrips) {
    if (t.tripType === "Micro") micro++;
    else if (t.tripType === "Corto") short++;
    else if (t.tripType === "Medio") medium++;
    else if (t.tripType === "Largo") long++;
  }

  return {
    allTrips,
    weekendTrips,
    frequentRoutes,
    frequentWeekendRoutes,
    kpis: {
      totalWeekendTrips: weekendTrips.length,
      microTripsWeekend: micro,
      shortTripsWeekend: short,
      mediumTripsWeekend: medium,
      longTripsWeekend: long,
      mostFrequentWeekendRoute: frequentWeekendRoutes.length > 0 ? frequentWeekendRoutes[0].routeKey : "N/A"
    }
  };
}
