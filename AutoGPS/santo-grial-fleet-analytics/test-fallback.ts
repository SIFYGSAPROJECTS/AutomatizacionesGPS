import { analyzeTrips } from "./src/lib/tripAnalyzer.js";

const rawRows = [
  {
    "Vehículo": "V-01",
    "Dirección": "Base",
    "Hora inicial ": "2024-01-01 08:00:00",
    "Tiempo aparcado ": "30m" // Fallback sets fin to 08:30
  },
  {
    "Vehículo": "V-01",
    "Dirección": "Taller",
    "Hora inicial ": "2024-01-01 08:45:00", // Trip 1: 15 mins (08:30 to 08:45)
    "Tiempo aparcado ": "1h" // Fallback sets fin to 09:45
  },
  {
    "Vehículo": "V-01",
    "Dirección": "Oficina",
    "Hora inicial ": "2024-01-01 10:30:00", // Trip 2: 45 mins (09:45 to 10:30)
    "Tiempo aparcado ": "1h"
  }
];

const report = analyzeTrips(rawRows);
console.log("Fallback Trips:", report.allTrips.map(t => `${t.originAddress} -> ${t.destinationAddress}: ${t.durationMinutes}m`));
