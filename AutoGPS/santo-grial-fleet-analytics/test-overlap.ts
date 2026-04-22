import { analyzeTrips } from "./src/lib/tripAnalyzer.js";

const rawRows = [
  { "Vehículo": "V-01", "Dirección": "Base", "Hora inicial ": "2024-01-05 08:00:00", "Tiempo aparcado ": "2h" }, // fin: 10:00
  { "Vehículo": "V-01", "Dirección": "Fantasma", "Hora inicial ": "2024-01-05 08:05:00", "Tiempo aparcado ": "5m" }, // fin: 08:10 (overlap)
  { "Vehículo": "V-01", "Dirección": "Taller", "Hora inicial ": "2024-01-05 11:00:00", "Tiempo aparcado ": "1h" }, // arrival: 11:00. Duration: 60m
];

const report = analyzeTrips(rawRows);
console.log("Trips:", report.allTrips.map(t => `${t.originAddress} -> ${t.destinationAddress}: ${t.durationMinutes}m`));
