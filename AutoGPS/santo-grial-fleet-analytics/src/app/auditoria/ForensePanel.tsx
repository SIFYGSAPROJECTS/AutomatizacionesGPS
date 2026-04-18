"use client";

import { useFleetStore } from "@/store/useFleetStore";
import { useState } from "react";
import { ShieldAlert, Truck, MapPin, Clock, Trophy, ChevronRight, UploadCloud } from "lucide-react";
import Link from "next/link";

function formatSegundos(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0 && m === 0) return "< 1m";
  return `${h}h ${m}m`;
}

export function ForensePanel() {
  const { auditTrail } = useFleetStore();
  const [tab, setTab] = useState<"vehiculo" | "geocerca">("vehiculo");
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [selectedGeocerca, setSelectedGeocerca] = useState<string>("");

  if (!auditTrail) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-900/20 border border-zinc-800/50 rounded-2xl">
        <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mb-6 ring-4 ring-orange-500/20">
          <ShieldAlert className="w-10 h-10 text-orange-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-100 mb-3">Auditoría Bloqueada</h2>
        <p className="text-zinc-500 max-w-lg mb-8">
          La bóveda de estado global está vacía. Navega al Dashboard inicial y procesa un archivo de telemetría para habilitar el motor forense.
        </p>
        <Link 
          href="/"
          className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors font-medium border border-zinc-700"
        >
          <UploadCloud className="w-5 h-5" />
          Subir Archivo
        </Link>
      </div>
    );
  }

  const vehiclesList = Object.keys(auditTrail.byVehicle);
  const geocercasList = Object.keys(auditTrail.byGeocerca).sort();

  // Seleccionar automáticamente el primero si no hay selección
  if (!selectedVehicle && vehiclesList.length > 0) setSelectedVehicle(vehiclesList[0]);
  if (!selectedGeocerca && geocercasList.length > 0) setSelectedGeocerca(geocercasList[0]);

  const currentV = selectedVehicle ? auditTrail.byVehicle[selectedVehicle] : null;
  const currentG = selectedGeocerca ? auditTrail.byGeocerca[selectedGeocerca] : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
      <div className="pb-4 flex items-center justify-between gap-4">
        {/* Tab Selector interno */}
        <div className="p-1.5 bg-[#050505] border border-zinc-900 rounded-xl inline-flex shadow-inner">
          <button
            onClick={() => setTab("vehiculo")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "vehiculo" 
              ? "bg-[#111] text-orange-500 shadow-md border border-orange-500/30" 
              : "text-zinc-500 hover:text-orange-500/50"
            }`}
          >
            <Truck className="w-4 h-4" />
            Por Vehículo
          </button>
          <button
            onClick={() => setTab("geocerca")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "geocerca" 
              ? "bg-[#111] text-orange-500 shadow-md border border-orange-500/30" 
              : "text-zinc-500 hover:text-orange-500/50"
            }`}
          >
            <MapPin className="w-4 h-4" />
            Por Geocerca
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Menú Izquierdo (Responsive) */}
        <div className="lg:col-span-1 bg-zinc-950/50 border border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col h-[500px] lg:h-[calc(100vh-14rem)] shadow-lg">
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-10">
            <h3 className="font-semibold text-zinc-200">
              {tab === "vehiculo" ? "Flotilla" : "Zonas de Interés"}
            </h3>
            <div className="text-xs text-zinc-500 mt-1">
              {tab === "vehiculo" ? `${vehiclesList.length} unidades trazadas` : `${geocercasList.length} puntos registrados`}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {tab === "vehiculo" ? (
              <div className="space-y-1">
                {vehiclesList.map(v => (
                  <button
                    key={v}
                    onClick={() => setSelectedVehicle(v)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors border ${
                      selectedVehicle === v
                      ? "bg-[#111] border-orange-500/20 text-orange-400 shadow-sm"
                      : "bg-transparent border-transparent text-zinc-400 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="font-medium truncate">{auditTrail.byVehicle[v].consecutivo || auditTrail.byVehicle[v].placas}</div>
                    <div className="text-[10px] opacity-70 truncate">{auditTrail.byVehicle[v].placas}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {geocercasList.map(g => (
                  <button
                    key={g}
                    onClick={() => setSelectedGeocerca(g)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors border ${
                      selectedGeocerca === g
                      ? "bg-[#111] border-orange-500/20 text-orange-400 shadow-sm"
                      : "bg-transparent border-transparent text-zinc-400 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="font-medium truncate">{g}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel Central Detallado */}
        <div className="lg:col-span-3 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl overflow-hidden min-h-[500px] shadow-xl">
          {tab === "vehiculo" && currentV && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-zinc-800 bg-[#0a0a0a]">
                <div className="flex items-center gap-4 mb-2">
                  <div className="p-3 bg-black rounded-xl text-orange-500 border border-zinc-800">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{currentV.consecutivo || "Sin consecutivo"} — {currentV.placas}</h2>
                    <div className="flex gap-3 text-sm text-zinc-400 mt-1">
                      <span className="bg-zinc-800 px-2 py-0.5 rounded text-xs">{currentV.vehiculo || "Modelo no disponible"}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 space-y-10 flex-1 overflow-y-auto">
                <div className="mb-4 p-4 border border-zinc-900 bg-[#050505] rounded-xl text-sm text-zinc-300">
                  <strong className="text-orange-500 font-semibold block mb-1">Criterio del "Ganador del Día":</strong>
                  El sistema evalúa las 24 horas del día. Si el vehículo visitó múltiples geocercas, el algoritmo suma el <i>Tiempo Aparcado</i> en cada una y corona como ganadora a la que registre mayor predominancia física. Las geocercas ganadoras continuas forman la Racha final.
                </div>

                {currentV.days.map((day, i) => (
                  <div key={i} className="relative pl-8 border-l-[3px] border-zinc-900 last:border-l-transparent pb-8">
                    {/* Gran Nodo de Fecha en el Timeline */}
                    <div className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-[#050505] border-4 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]"></div>
                    
                    <div className="-mt-1.5 mb-4">
                      <span className="text-lg font-bold text-white bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full shadow-sm">
                        {day.date}
                      </span>
                    </div>
                    
                    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
                       <div className="p-5">
                         <p className="text-sm text-zinc-400 mb-6">
                           Este día el vehículo reportó asistencia a <strong className="text-zinc-200">{day.geocercasVisited.length}</strong> {day.geocercasVisited.length === 1 ? 'geocerca distinta' : 'geocercas distintas'}. A continuación se audita el resultado:
                         </p>

                         {/* Nodo Ganador Destacado */}
                         <div className="relative pl-6 border-l-[3px] border-orange-500/50 mb-6 pb-2">
                            <div className="absolute -left-[11px] top-1 w-5 h-5 rounded-full bg-black border-[4px] border-orange-500 flex items-center justify-center"></div>
                            
                            <h4 className="text-xs uppercase tracking-wider text-orange-500 font-bold mb-1 flex items-center gap-2">
                              <Trophy className="w-4 h-4" />
                              Geocerca Predominante (Suma para Racha)
                            </h4>
                            <div className="bg-[#111] border border-orange-500/30 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-2">
                               <div>
                                 <p className="text-orange-500 font-black text-xl">{day.winnerGeocerca}</p>
                                 <p className="text-xs text-orange-500/60 mt-1">Acumuló la mayor permanencia del día.</p>
                               </div>
                               <div className="text-right bg-[#050505] px-4 py-2 rounded-lg border border-orange-500/20">
                                 <p className="text-[10px] text-zinc-500 uppercase font-semibold">T. Aparcado</p>
                                 <p className="text-orange-400 font-mono text-lg font-bold">{formatSegundos(day.totalWinnerSeconds)}</p>
                               </div>
                            </div>
                         </div>

                         {/* Nodos Perdedores (Visitas Menores) */}
                         {day.geocercasVisited.filter(g => g.geocerca !== day.winnerGeocerca).length > 0 && (
                           <div className="relative pl-6 border-l-[3px] border-zinc-700/50">
                             <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-zinc-950 border-[3px] border-zinc-600"></div>
                             <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3 pt-1">
                               Otras Visitas Reportadas (Perdedoras)
                             </h4>
                             <div className="space-y-3 mt-2">
                               {day.geocercasVisited.filter(g => g.geocerca !== day.winnerGeocerca).map((geo, idx) => (
                                 <div key={idx} className="bg-zinc-950/50 border border-zinc-800/80 px-4 py-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                    <div>
                                      <p className="text-zinc-300 font-medium flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-zinc-500" />
                                        {geo.geocerca}
                                      </p>
                                      <p className="text-xs text-zinc-600 mt-0.5">Asistencia superada por {day.winnerGeocerca}.</p>
                                    </div>
                                    <div className="text-zinc-500 font-mono text-sm bg-zinc-900 px-3 py-1 rounded-md border border-zinc-800">
                                      <Clock className="w-3.5 h-3.5 inline mr-1.5 opacity-60" />
                                      {formatSegundos(geo.seconds)}
                                    </div>
                                 </div>
                               ))}
                             </div>
                           </div>
                         )}
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "geocerca" && currentG && (
            <div className="p-8 h-full flex flex-col items-center justify-center text-center animate-in zoom-in-95">
               <div className="w-24 h-24 bg-black border border-zinc-900 rounded-full flex items-center justify-center mb-6 shadow-2xl">
                 <MapPin className="w-12 h-12 text-orange-500" />
               </div>
               <h2 className="text-3xl font-black tracking-tight text-white mb-2">{selectedGeocerca}</h2>
               <p className="text-zinc-400 mb-8 max-w-md">Esta zona geográfica resultó como el sitio ganador para <strong className="text-orange-500">{currentG.totalDaysWon} días en total</strong> (acumulado de todos los vehículos que fondearon aquí).</p>
               
               <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl text-left overflow-hidden shadow-2xl">
                 <div className="px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/50">
                   <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Unidades que operaron en esta base</p>
                 </div>
                 <div className="divide-y divide-zinc-800/50 max-h-60 overflow-y-auto scrollbar-thin">
                   {Object.entries(currentG.vehiculos).map(([v, days], i) => (
                     <details key={i} className="group border-b border-zinc-800/50 last:border-0">
                       <summary className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-zinc-800/30 transition-colors list-none select-none">
                         <div className="flex items-center gap-3">
                           <ChevronRight className="w-4 h-4 text-orange-500 group-open:rotate-90 transition-transform" />
                           <span className="text-sm font-medium text-zinc-200">{v}</span>
                         </div>
                         <span className="text-xs font-mono text-zinc-500 bg-[#050505] border border-zinc-800 px-2 py-0.5 rounded">
                           {days.length} {days.length === 1 ? 'día' : 'días'}
                         </span>
                       </summary>
                       <div className="px-5 pb-4 pt-1 pl-12 bg-black">
                         <div className="flex flex-wrap gap-2 mt-1">
                           {days.map(d => (
                             <span key={d} className="bg-[#111] text-orange-400 border border-orange-500/20 px-2 py-1 flex items-center gap-1.5 rounded text-xs font-mono shadow-sm">
                               <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                               {d}
                             </span>
                           ))}
                         </div>
                       </div>
                     </details>
                   ))}
                   {Object.keys(currentG.vehiculos).length === 0 && (
                     <div className="p-4 text-zinc-500 text-sm text-center">No hay unidades registradas</div>
                   )}
                 </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
