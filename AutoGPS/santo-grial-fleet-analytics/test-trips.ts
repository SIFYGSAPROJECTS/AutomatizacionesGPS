import { analyzeTrips } from "./src/lib/tripAnalyzer.js";

const rawRows = [
  {
    "Vehículo": "V-01",
    "Dirección": "Base",
    "Hora inicial ": "2024-01-01 08:00:00",
    "Hora final ": "2024-01-01 08:30:00",
  },
  {
    "Vehículo": "V-01",
    "Dirección": "Taller",
    "Hora inicial ": "2024-01-01 08:45:00", // Trip 1: 15 mins (08:30 to 08:45)
    "Hora final ": "2024-01-01 09:00:00",
  },
  {
    "Vehículo": "V-01",
    "Dirección": "Oficina",
    "Hora inicial ": "2024-01-01 10:30:00", // Trip 2: 90 mins (09:00 to 10:30)
    "Hora final ": "2024-01-01 11:00:00",
  }
];

const report = analyzeTrips(rawRows);
console.log("All Trips:", report.allTrips.map(t => `${t.originAddress} -> ${t.destinationAddress}: ${t.durationMinutes}m`));
