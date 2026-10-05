"use client";

import { useState } from "react";
import { ShieldAlert, Calendar, MapPin, Moon } from "lucide-react";
import { ForensePanel } from "./ForensePanel";
import { FinDeSemanaPanel } from "./FinDeSemanaPanel";
import { ParadasPanel } from "./ParadasPanel";
import { ReportesPanel } from "./ReportesPanel";
import { RutasPanel } from "./RutasPanel";
import { DeshorasPanel } from "./DeshorasPanel";
import { PernoctasScanner } from "./PernoctasScanner";
import { UbicacionesPanel } from "./UbicacionesPanel";
import { BasesPanel } from "./BasesPanel";
import { UltimaPosicionPanel } from "./UltimaPosicionPanel";
import { FileBarChart, Navigation, BadgeDollarSign, Map, Home, MapPin as MapPinIcon } from "lucide-react";
import { TimelineSlider } from "@/components/TimelineSlider";

type AuditTab = "forense" | "finsemana" | "pernoctas" | "rutas" | "deshoras" | "reportes" | "ultimapos";

const TABS: { key: AuditTab; label: string; icon: any; description: string }[] = [
  { key: "forense", label: "Forense", icon: ShieldAlert, description: "Rachas de permanencia y auditoría por vehículo/geocerca" },
  { key: "finsemana", label: "Fin de Semana", icon: Calendar, description: "Alertas de uso no autorizado en sábados y domingos" },
  { key: "pernoctas", label: "Pernoctas", icon: Moon, description: "Escáner nocturno por unidad: Validado vs Desconocido" },
  { key: "rutas", label: "Rutas", icon: Navigation, description: "Análisis de trayectos, origen-destino y duración de viajes" },
  { key: "deshoras", label: "Deshoras", icon: BadgeDollarSign, description: "Auditoría de cobros por uso de vehículos fuera de horario laboral" },
  { key: "ultimapos", label: "Última Posición", icon: MapPinIcon, description: "Instantánea en vivo de la última ubicación conocida de cada unidad" },
  { key: "reportes", label: "Reportes", icon: FileBarChart, description: "Generador de reportes ejecutivos en PPTX y operacionales en Excel" },
];

export default function AuditoriaPage() {
  const [activeTab, setActiveTab] = useState<AuditTab>("forense");

  return (
    <div className="flex flex-col gap-0 max-w-7xl mx-auto pb-20">

      {/* HEADER + TAB SELECTOR */}
      <div className="mt-8 mb-6">
        <h1 className="font-heading font-normal text-6xl tracking-tight text-white mb-2">
          Módulo de <span className="italic text-zinc-300">Auditoría.</span>
        </h1>
        <p className="text-zinc-400 text-lg">
          Centro de control unificado: forense, fin de semana y gestión de paradas.
        </p>
      </div>

      {/* TIME MACHINE SLIDER */}
      <TimelineSlider />

      {/* SEGMENTED CONTROL */}
      <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-1.5 flex gap-1 mb-8">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#0a0a0a] text-orange-400 border border-orange-500/30 shadow-lg shadow-orange-500/5"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent hover:bg-[#0a0a0a]/50"
              }`}
            >
              <tab.icon className={`w-4 h-4 ${isActive ? "text-orange-500" : ""}`} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-DESCRIPTION */}
      <div className="mb-6">
        <p className="text-xs text-zinc-600 uppercase tracking-widest">
          {TABS.find(t => t.key === activeTab)?.description}
        </p>
      </div>

      {/* PANEL CONTENT */}
        <div className="flex-1 overflow-auto custom-scrollbar p-8">
          {activeTab === "forense" && <ForensePanel />}
          {activeTab === "finsemana" && <FinDeSemanaPanel />}
          {activeTab === "pernoctas" && <PernoctasScanner />}
          {activeTab === "rutas" && <RutasPanel />}
          { activeTab === "deshoras" && <DeshorasPanel />}
          { activeTab === "ultimapos" && <UltimaPosicionPanel />}
          { activeTab === "reportes" && <ReportesPanel />}
        </div>
    </div>
  );
}
