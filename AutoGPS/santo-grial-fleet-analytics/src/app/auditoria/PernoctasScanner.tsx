"use client";

import { useMemo, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { Moon, Home, Building2, MapPin, Search, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react";
import { checkProximity } from "@/lib/geofenceEngine";

interface NightRecord {
  fecha: string;
  unit: string;
  lat: number;
  lng: number;
  direccion: string;
  tipo: "BASE" | "STAFF" | "CHOFER" | "DESCONOCIDO";
  validada: boolean;
}

export function PernoctasScanner() {
  const { rawParsedData } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState("");

  const scanResults = useMemo(() => {
    if (!rawParsedData) return [];

    const nightSpots: NightRecord[] = [];
    const processedNights = new Set<string>();

    // 1. Extraer pernoctas crudas
    rawParsedData.forEach(row => {
      const getField = (keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
          if (match && row[match]) return String(row[match]).trim();
        }
        return "";
      };

      const fechaRaw = getField(["inicio", "hora inicial", "fecha", "hora"]);
      const dist = parseFloat(getField(["distancia", "km", "dist"])) || 0;
      
      const timeMatch = fechaRaw.match(/(\d{1,2}):(\d{2})/);
      const hour = timeMatch ? parseInt(timeMatch[1], 10) : new Date(fechaRaw).getHours();

      // Mismas reglas de pernocta que el motor principal
      if ((hour >= 22 || hour <= 6) && dist < 0.15) {
        const unitRaw = getField(["matrícula", "matricula", "placas", "unidad", "consecutivo", "económico", "economico", "vehículo", "vehiculo", "nombre"]);
        // Regex simplificada para extraer consecutivo
        const unit = unitRaw.match(/[A-Z0-9&]+-\d{3}/)?.[0] || unitRaw.split(" ")[0];
        const fecha = fechaRaw.split(" ")[0];
        const key = `${unit}_${fecha}`;

        if (processedNights.has(key)) return;
        processedNights.add(key);

        const lat = parseFloat(String(getField(["latitud", "lat"])).replace(/[^\d.-]/g, ''));
        const lng = parseFloat(String(getField(["longitud", "lng", "lon"])).replace(/[^\d.-]/g, ''));
        const direccion = getField(["dirección", "direccion", "lugar"]);

        if (!isNaN(lat) && !isNaN(lng) && unit && lat !== 0) {
          // CAPA DE INTELIGENCIA: Cruzar con geocercas y casas validadas
          const proximity = checkProximity(lat, lng, 0.5);
          let tipo: NightRecord["tipo"] = "DESCONOCIDO";
          let validada = false;

          if (proximity.isNearGeofence) {
            validada = true;
            const geoLow = proximity.nearestGeofence.toLowerCase();
            if (geoLow.includes("oficina") || geoLow.includes("base")) tipo = "BASE";
            else if (geoLow.includes("staff")) tipo = "STAFF";
            else if (geoLow.includes("chofer") || geoLow.includes("censo")) tipo = "CHOFER";
            else tipo = "STAFF"; // Por defecto si es geocerca oficial
          }

          nightSpots.push({ fecha, unit, lat, lng, direccion, tipo, validada });
        }
      }
    });

    return nightSpots.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [rawParsedData]);

  const filtered = scanResults.filter(r => 
    r.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.direccion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Agrupar por vehículo
  const grouped = filtered.reduce((acc: Record<string, NightRecord[]>, curr) => {
    if (!acc[curr.unit]) acc[curr.unit] = [];
    acc[curr.unit].push(curr);
    return acc;
  }, {});

  if (!rawParsedData) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#050505] p-6 rounded-2xl border border-zinc-900 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Moon className="w-5 h-5 text-orange-400" />
            Escáner de Pernoctas por Vehículo
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Monitoreo de ubicación nocturna y validación contra Censo Maestro.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input 
            type="text" 
            placeholder="Buscar unidad o dirección..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-200 focus:ring-1 focus:ring-orange-500 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {Object.entries(grouped).map(([unit, records]) => (
          <div key={unit} className="bg-[#050505] border border-zinc-900 rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-zinc-900/50 px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                  <span className="text-orange-500 font-bold text-xs">{unit.split("-")[0]}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{unit}</h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{records.length} Pernoctas Detectadas</p>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-zinc-950/50">
                  <tr>
                    <th className="py-3 px-6 text-[10px] font-bold text-zinc-500 uppercase">Fecha</th>
                    <th className="py-3 px-6 text-[10px] font-bold text-zinc-500 uppercase">Ubicación Registrada</th>
                    <th className="py-3 px-6 text-[10px] font-bold text-zinc-500 uppercase">Tipo / Estatus</th>
                    <th className="py-3 px-6 text-[10px] font-bold text-zinc-500 uppercase text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/50">
                  {records.map((rec, i) => (
                    <tr key={i} className="hover:bg-zinc-900/20 transition-colors group">
                      <td className="py-4 px-6">
                        <span className="text-sm font-mono text-zinc-400">{rec.fecha}</span>
                      </td>
                      <td className="py-4 px-6 max-w-md">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-zinc-600 shrink-0" />
                          <p className="text-sm text-zinc-300 truncate" title={rec.direccion}>{rec.direccion}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {rec.validada ? (
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold ${
                            rec.tipo === 'BASE' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                            rec.tipo === 'STAFF' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                            'bg-orange-500/10 border-orange-500/30 text-orange-400'
                          }`}>
                            {rec.tipo === 'BASE' ? <Building2 className="w-3 h-3" /> : <Home className="w-3 h-3" />}
                            {rec.tipo} VALIDADA
                            <CheckCircle2 className="w-3 h-3 ml-0.5" />
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 text-[10px] font-bold">
                            <AlertCircle className="w-3 h-3" />
                            UBICACIÓN DESCONOCIDA
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button className="text-zinc-600 hover:text-white transition-colors">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
