import Dexie, { Table } from 'dexie';

// Define the exact shape we will store in IndexedDB
export interface TelemetryEventRecord {
  id: string; // Clave primaria: "Matricula|HoraInicial" (Evita duplicados exactos)
  vehiculo: string;
  matricula: string;
  conductor: string;
  fecha: string;        // "YYYY-MM-DD" para filtrar rápido por mes/día
  horaInicial: string;  // El timestamp original del evento
  lat: number;
  lng: number;
  direccion: string;
  tiempoAparcadoSecs: number;
  rawJson: Record<string, string>; // Toda la fila cruda de PapaParse por si otras métricas lo necesitan
}

export class FleetAnalyticsDB extends Dexie {
  telemetry!: Table<TelemetryEventRecord, string>; // PK es un string 'id'

  constructor() {
    super('FleetAnalyticsDB');
    // Definimos el esquema. 'id' es la Primary Key.
    // Indexamos 'vehiculo', 'fecha', y 'conductor' para búsquedas súper rápidas.
    this.version(1).stores({
      telemetry: 'id, vehiculo, fecha, conductor'
    });
  }
}

export const db = new FleetAnalyticsDB();

// Utilidad para extraer campos de forma tolerante (múltiples nombres de columnas)
function getField(row: Record<string, string>, ...candidates: string[]): string {
  const rowKeys = Object.keys(row);
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
    const cNorm = c.trim().toLowerCase();
    const found = rowKeys.find(k => k.trim().toLowerCase() === cNorm);
    if (found && row[found] !== undefined) return row[found];
  }
  return "";
}

function parseDurationToSeconds(durStr: string): number {
  if (!durStr) return 0;
  const s = durStr.trim().toLowerCase();
  let days = 0;
  let timeStr = s;
  const dayMatch = s.match(/^(\d+)\s*(?:d|day|days|días|dias)\s*(.*)$/);
  if (dayMatch) {
    days = parseInt(dayMatch[1], 10);
    timeStr = dayMatch[2].trim();
  }
  const textMatch = timeStr.match(/(?:(\d+)\s*h\w*)?\s*(?:(\d+)\s*m\w*)?\s*(?:(\d+(?:\.\d+)?)\s*s\w*)?/);
  if (textMatch && (textMatch[1] || textMatch[2] || textMatch[3]) && !timeStr.includes(':')) {
    const h = parseInt(textMatch[1] || "0", 10);
    const m = parseInt(textMatch[2] || "0", 10);
    const sec = parseFloat(textMatch[3] || "0");
    return (days * 86400) + (h * 3600) + (m * 60) + sec;
  }
  const parts = timeStr.split(':').map(p => parseFloat(p) || 0);
  if (parts.length === 3) return (days * 86400) + (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (days * 86400) + (parts[0] * 3600) + (parts[1] * 60); 
  if (parts.length === 1) return (days * 86400) + parts[0];
  return 0;
}

export async function importRawTelemetry(rawRows: Record<string, string>[]) {
  const records: TelemetryEventRecord[] = [];
  
  for (const row of rawRows) {
    const matricula = getField(row, "Matrícula", "Matricula", "matrícula", "matricula").trim();
    const vehiculo = getField(row, "Vehículo", "Vehiculo", "vehículo", "vehiculo").trim();
    const conductor = getField(row, "Conductor", "conductor").trim() || "Desconocido";
    const direccion = getField(row, "Dirección", "Direccion", "direccion").trim();
    const horaInicial = getField(row, "Hora inicial ", "Hora inicial", "hora inicial", "Inicio").trim();
    
    if (!vehiculo && !matricula) continue; // Fila vacía o inválida
    if (!horaInicial) continue; // Necesitamos tiempo para que sea único

    const latStr = getField(row, "Latitud", "latitud", "Lat", "lat");
    const lngStr = getField(row, "Longitud", "longitud", "Lng", "lng", "Long", "long");
    const durStr = getField(row, "Tiempo aparcado ", "Tiempo aparcado", "tiempo aparcado", "Duración", "Duracion", "duracion");

    // Intentar sacar la fecha (YYYY-MM-DD) desde horaInicial
    let fecha = "";
    try {
      const d = new Date(horaInicial);
      if (!isNaN(d.getTime())) {
        fecha = d.toISOString().split('T')[0];
      } else {
        // Fallback robusto para "DD/MM/YYYY HH:MM:SS"
        const match = horaInicial.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
           const day = match[1].padStart(2, '0');
           const month = match[2].padStart(2, '0');
           const year = match[3];
           fecha = `${year}-${month}-${day}`;
        }
      }
    } catch(e) {}

    const vId = matricula || vehiculo;
    const id = `${vId}|${horaInicial}`;

    records.push({
      id,
      vehiculo,
      matricula,
      conductor,
      fecha,
      horaInicial,
      lat: parseFloat(latStr) || 0,
      lng: parseFloat(lngStr) || 0,
      direccion,
      tiempoAparcadoSecs: parseDurationToSeconds(durStr),
      rawJson: row
    });
  }

  // Insertar por lotes (Dexie es MUY rápido, bulkPut hace upsert y sobreescribe duplicados exactos)
  await db.telemetry.bulkPut(records);
}
