"use client";

import { useMemo, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { parseDateRobust } from "@/lib/utils";
import { MapPin, Map as MapIcon, Car, Clock, Download, ExternalLink, AlertTriangle } from "lucide-react";
import ExcelJS from "exceljs";
import { CsvUploader } from "@/components/CsvUploader";
import { startOfDay, endOfDay } from "date-fns";

interface LastKnownPosition {
  vehiculo: string;
  matricula: string;
  fechaOriginal: string;
  fechaObj: Date;
  direccion: string;
  geocerca: string;
  lat: string;
  lng: string;
  diasSinReportar: number;
}

export function UltimaPosicionPanel() {
  const { rawParsedData } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [targetDate, setTargetDate] = useState<string>("");

  const snapshot = useMemo(() => {
    if (!rawParsedData || rawParsedData.length === 0) return [];

    const map = new Map<string, LastKnownPosition>();
    
    // Si hay una fecha límite establecida, calculamos el final de ese día (23:59:59)
    const cutoffTime = targetDate ? endOfDay(parseDateRobust(targetDate)).getTime() : Infinity;

    rawParsedData.forEach((row: any) => {
      const getField = (keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
          if (match && row[match]) return String(row[match]).trim();
        }
        return "";
      };

      const vehiculoStr = getField(["vehiculo", "vehículo"]);
      const matriculaStr = getField(["matricula", "matrícula"]);
      
      const vehiculoKey = vehiculoStr || matriculaStr || "Desconocido";
      const fechaStr = getField(["hora inicial ", "hora inicial", "inicio"]);
      
      if (!fechaStr) return; // Si no tiene fecha, no podemos evaluar

      const fechaObj = parseDateRobust(fechaStr);
      if (isNaN(fechaObj.getTime())) return;
      
      // Si la fecha de este registro es posterior al límite establecido por el usuario, lo ignoramos
      if (fechaObj.getTime() > cutoffTime) return;

      const existing = map.get(vehiculoKey);
      
      // Si no existe o si este registro es más reciente, lo reemplazamos
      if (!existing || fechaObj.getTime() > existing.fechaObj.getTime()) {
        const direccion = getField(["dirección", "direccion", "lugar"]);
        const geocerca = getField(["geocercas", "geocerca"]);
        const lat = getField(["latitud", "lat"]);
        const lng = getField(["longitud", "lng"]);
        
        // Calculamos cuántos días han pasado desde este reporte hasta HOY (local)
        // Nota: asume que la PC está al día.
        const diffTime = Math.abs(new Date().getTime() - fechaObj.getTime());
        const diasSinReportar = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        map.set(vehiculoKey, {
          vehiculo: vehiculoStr || matriculaStr,
          matricula: matriculaStr || vehiculoStr,
          fechaOriginal: fechaStr,
          fechaObj,
          direccion,
          geocerca,
          lat,
          lng,
          diasSinReportar
        });
      }
    });

    // Convertimos a array y ordenamos alfabéticamente
    return Array.from(map.values()).sort((a, b) => a.vehiculo.localeCompare(b.vehiculo));
  }, [rawParsedData, targetDate]);

  const filtered = useMemo(() => {
    if (!searchTerm) return snapshot;
    const q = searchTerm.toLowerCase();
    return snapshot.filter(s => 
      s.vehiculo.toLowerCase().includes(q) || 
      s.matricula.toLowerCase().includes(q) ||
      s.direccion.toLowerCase().includes(q)
    );
  }, [snapshot, searchTerm]);

  const handleExportExcel = async () => {
    if (!filtered || filtered.length === 0) return;
    setIsExporting(true);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Santo Grial Fleet Analytics";
      const sheet = workbook.addWorksheet("Última Ubicación");

      // Cabeceras
      sheet.columns = [
        { header: "Vehículo", key: "vehiculo", width: 35 },
        { header: "Placas/Matrícula", key: "matricula", width: 20 },
        { header: "Último Reporte", key: "fecha", width: 25 },
        { header: "Días sin reportar", key: "dias", width: 18 },
        { header: "Geocerca", key: "geocerca", width: 30 },
        { header: "Dirección", key: "direccion", width: 70 },
        { header: "Latitud", key: "lat", width: 15 },
        { header: "Longitud", key: "lng", width: 15 },
        { header: "Link Maps", key: "maps", width: 50 },
      ];

      // Estilos de cabecera
      sheet.getRow(1).eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      // Filas
      filtered.forEach(pos => {
        sheet.addRow({
          vehiculo: pos.vehiculo,
          matricula: pos.matricula,
          fecha: pos.fechaOriginal,
          dias: pos.diasSinReportar,
          geocerca: pos.geocerca,
          direccion: pos.direccion,
          lat: pos.lat,
          lng: pos.lng,
          maps: (pos.lat && pos.lng) ? `https://maps.google.com/?q=${pos.lat},${pos.lng}` : 'Sin coordenadas'
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Flota_Ultima_Ubicacion_${new Date().getTime()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exportando a Excel:", error);
      alert("No se pudo generar el reporte.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!rawParsedData || rawParsedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 w-full max-w-4xl mx-auto">
        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
          <MapPin className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="font-heading text-4xl text-white mt-4">Sube tu Archivo</h2>
        <p className="text-zinc-400 mb-8 text-center max-w-md">Para ver la última posición o la posición en una fecha específica, sube tu reporte de Excel aquí mismo.</p>
        <div className="w-full bg-[#0a0a0a] border border-zinc-800 p-6 rounded-2xl">
          <CsvUploader />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Controles: Buscar y Exportar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#050505] p-5 rounded-2xl border border-zinc-900 sticky top-4 z-10 shadow-2xl">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <input 
            type="text" 
            placeholder="Buscar vehículo, placas o dirección..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-4 py-2.5 w-full md:w-64 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all"
          />
          <div className="flex flex-col w-full md:w-auto">
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1 ml-1">Viaje en el tiempo</span>
            <input 
              type="date" 
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-4 py-2.5 w-full md:w-auto focus:ring-1 focus:ring-orange-500 focus:outline-none"
              title="Selecciona una fecha límite para ver dónde estaban los vehículos en ese momento"
            />
          </div>
          <div className="text-xs font-mono text-zinc-500 bg-zinc-900 px-3 py-2.5 rounded-lg border border-zinc-800 flex items-center h-full mt-5">
            {filtered.length} unds
          </div>
        </div>

        <button 
          onClick={handleExportExcel}
          disabled={isExporting}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-black px-5 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-orange-600/20 active:scale-95 whitespace-nowrap w-full md:w-auto justify-center"
        >
          <Download className="w-4 h-4" />
          {isExporting ? 'Generando Excel...' : 'Descargar Snapshot'}
        </button>
      </div>

      {/* Grid de Tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((pos, idx) => (
          <div key={idx} className="bg-[#0a0a0a] border border-zinc-900 rounded-2xl p-5 hover:border-orange-500/30 transition-all group flex flex-col justify-between">
            
            <div>
              {/* Header Tarjeta */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-black border border-zinc-800 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-zinc-100 font-bold text-sm line-clamp-1" title={pos.vehiculo}>
                      {pos.vehiculo}
                    </h3>
                    <p className="text-zinc-500 text-xs font-mono mt-0.5">
                      {pos.matricula}
                    </p>
                  </div>
                </div>
                
                {pos.diasSinReportar > 3 && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shrink-0" title="Lleva varios días sin reportar en este archivo">
                    <AlertTriangle className="w-3 h-3" />
                    +{pos.diasSinReportar}d
                  </div>
                )}
              </div>

              {/* Info de Ubicación */}
              <div className="space-y-3 mb-5">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">Último Reporte</p>
                    <p className="text-sm text-zinc-300">{pos.fechaOriginal}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">Ubicación</p>
                    <p className="text-sm text-zinc-300 line-clamp-2" title={pos.direccion}>
                      {pos.direccion || "Sin dirección"}
                    </p>
                    {pos.geocerca && (
                      <span className="inline-block mt-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs px-2 py-0.5 rounded-md">
                        {pos.geocerca}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Tarjeta */}
            <div className="pt-4 border-t border-zinc-900/50">
              {(pos.lat && pos.lng) ? (
                <a 
                  href={`https://maps.google.com/?q=${pos.lat},${pos.lng}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg transition-colors border border-zinc-800"
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  Ver en Google Maps
                  <ExternalLink className="w-3 h-3 text-zinc-500 ml-1" />
                </a>
              ) : (
                <div className="flex items-center justify-center w-full py-2 bg-zinc-900/50 text-zinc-600 text-xs font-medium rounded-lg border border-zinc-800/50 cursor-not-allowed">
                  Sin coordenadas
                </div>
              )}
            </div>

          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-zinc-500">
            No se encontraron vehículos que coincidan con la búsqueda.
          </div>
        )}
      </div>

    </div>
  );
}
