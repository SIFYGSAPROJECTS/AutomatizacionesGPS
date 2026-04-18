"use client";

import { CsvUploader } from "@/components/CsvUploader";
import { Activity, Car, FileSpreadsheet, MapPin, History, Trash2, Clock, Database, UploadCloud, ArrowLeft } from "lucide-react";
import { useFleetStore } from "@/store/useFleetStore";
import { useAnalysisHistory, AnalysisSnapshot } from "@/hooks/useAnalysisHistory";

export default function Home() {
  const { auditTrail, rawParsedData, streakReport, isHistoricalView, historicalLabel, restoreHistorical, exitHistorical } = useFleetStore();
  const { history, loadReport, clearHistory } = useAnalysisHistory();

  // Calcular las estadísticas usando los datos de Zustand
  const vehiculosCount = auditTrail ? Object.keys(auditTrail.byVehicle).length : 0;
  const eventosCount = rawParsedData ? rawParsedData.length : 0;
  const rachasCount = streakReport ? streakReport.length : 0;
  const basesCount = auditTrail ? Object.keys(auditTrail.byGeocerca).length : 0;

  const handleLoadSession = (snap: AnalysisSnapshot) => {
    const report = loadReport(snap.id);
    if (!report) {
      alert("No se pudo cargar este reporte. Es posible que los datos hayan sido purgados del navegador.");
      return;
    }
    const date = new Date(snap.timestamp);
    const dateStr = date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
    restoreHistorical(report.streakReport, report.auditTrail, snap.fileName + " — " + dateStr);
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-20">
      <div className="mt-8 mb-6">
        <h1 className="font-heading font-normal text-6xl tracking-tight text-white mb-4">
          Panel de <span className="italic text-zinc-300">Control.</span>
        </h1>
        <p className="text-zinc-400 text-lg">Analiza el rendimiento y los costos de tu flota de vehículos</p>
      </div>

      {/* BANNER DE MODO HISTÓRICO */}
      {isHistoricalView && (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-orange-500 animate-pulse" />
            <div>
              <p className="text-sm font-bold text-orange-400">Modo Histórico</p>
              <p className="text-xs text-zinc-400">
                Estás viendo datos de: <span className="text-orange-300 font-medium">{historicalLabel}</span>
              </p>
            </div>
          </div>
          <button
            onClick={exitHistorical}
            className="flex items-center gap-2 text-xs font-medium text-zinc-300 bg-[#0a0a0a] border border-zinc-800 px-4 py-2 rounded-lg hover:border-orange-500/30 hover:text-orange-400 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Salir y subir nuevo CSV
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Vehículos Auditados", value: vehiculosCount.toString(), icon: Car, color: "text-zinc-400", bg: "bg-[#050505] border border-zinc-800" },
          { label: "Registros GPS (Crudos)", value: eventosCount.toLocaleString(), icon: Activity, color: "text-orange-500", bg: "bg-orange-500/10 border border-orange-500/20" },
          { label: "Rachas Detectadas", value: rachasCount.toString(), icon: FileSpreadsheet, color: "text-amber-500", bg: "bg-amber-500/10 border border-amber-500/20" },
          { label: "Bases / Geocercas", value: basesCount.toString(), icon: MapPin, color: "text-zinc-500", bg: "bg-zinc-900 border border-zinc-800" },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-6 flex items-center gap-4 hover:border-orange-500/30 transition-colors">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">{stat.label}</p>
              <h4 className="text-2xl font-bold text-white mt-1">{stat.value}</h4>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-8 shadow-xl">
        <h2 className="font-heading font-normal text-4xl text-white mb-6">Importar Telemetría</h2>
        <CsvUploader />
      </div>

      {/* HISTORIAL DE ANÁLISIS */}
      <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#050505] border border-zinc-800 flex items-center justify-center">
              <History className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Historial de Análisis</h3>
              <p className="text-xs text-zinc-500">{history.length} sesiones registradas • Haz clic para cargar</p>
            </div>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => { if (confirm("¿Borrar todo el historial de análisis?")) clearHistory(); }}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-red-500/5 border border-transparent hover:border-red-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Database className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Aún no hay análisis registrados.</p>
            <p className="text-zinc-600 text-xs mt-1">Cada vez que proceses un CSV se guardará un registro aquí.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900 max-h-[400px] overflow-y-auto">
            {history.map((snap) => {
              const date = new Date(snap.timestamp);
              const dateStr = date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
              const timeStr = date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
              const isActiveSession = isHistoricalView && historicalLabel === snap.fileName + " — " + dateStr;

              return (
                <div
                  key={snap.id}
                  onClick={() => handleLoadSession(snap)}
                  className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all ${
                    isActiveSession
                      ? "bg-orange-500/5 border-l-4 border-l-orange-500"
                      : "hover:bg-[#111] border-l-4 border-l-transparent"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${isActiveSession ? "bg-orange-500 animate-pulse" : "bg-zinc-700"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate" title={snap.fileName}>
                        {snap.fileName}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr} a las {timeStr}</span>
                        <span>•</span>
                        <span>{snap.fileSizeKB.toLocaleString()} KB</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0 items-center">
                    <span className="text-[10px] bg-[#050505] text-zinc-300 border border-zinc-800 px-2 py-1 rounded font-mono">
                      {snap.totalRows.toLocaleString()} filas
                    </span>
                    <span className="text-[10px] bg-[#050505] text-orange-400 border border-orange-500/20 px-2 py-1 rounded font-mono">
                      {snap.streaksFound} rachas
                    </span>
                    <span className="text-[10px] bg-[#050505] text-amber-400 border border-amber-500/20 px-2 py-1 rounded font-mono">
                      {snap.uniqueVehicles} vehículos
                    </span>
                    <span className="text-[10px] bg-[#050505] text-zinc-400 border border-zinc-800 px-2 py-1 rounded font-mono">
                      {snap.uniqueGeocercas} geocercas
                    </span>
                    {snap.dateRangeFrom && (
                      <span className="text-[10px] bg-[#050505] text-zinc-500 border border-zinc-800 px-2 py-1 rounded font-mono">
                        {snap.dateRangeFrom} → {snap.dateRangeTo}
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-1 rounded font-bold ${isActiveSession ? "text-orange-400" : "text-zinc-600"}`}>
                      {isActiveSession ? "● ACTIVO" : "▶ Cargar"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
