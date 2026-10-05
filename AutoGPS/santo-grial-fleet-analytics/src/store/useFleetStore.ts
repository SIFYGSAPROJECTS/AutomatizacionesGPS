import { create } from "zustand";
import { RawTelemetryRow, StreakReportRow, AuditTrailType } from "@/lib/streaksAnalyzer";

import { WeekendUsageReport } from "@/lib/weekendAnalyzer";
import { StopProfileReport } from "@/lib/stopProfiler";
import { TripAnalysisReport } from "@/lib/tripAnalyzer";
import { db } from "@/lib/db";

export interface WeekendFilter {
  from: Date | null;
  to: Date | null;
  dayFilter: "all" | "sunday" | "saturday";
  searchQuery: string;
}

interface FleetState {
  rawParsedData: RawTelemetryRow[] | null;
  streakReport: StreakReportRow[] | null;
  auditTrail: AuditTrailType | null;
  sidebarOpen: boolean;
  weekendFilter: WeekendFilter;
  weekendReport: WeekendUsageReport | null;
  stopReport: StopProfileReport | null;
  tripReport: TripAnalysisReport | null;

  // Historial
  isHistoricalView: boolean;
  historicalLabel: string;
  historicalId: string | null;
  
  setFleetData: (raw: RawTelemetryRow[], report: StreakReportRow[], audit: AuditTrailType) => void;
  setStreakReport: (report: StreakReportRow[]) => void;
  clearData: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  
  setWeekendFilter: (filter: Partial<WeekendFilter>) => void;
  setWeekendReport: (report: WeekendUsageReport) => void;
  setStopReport: (report: StopProfileReport) => void;
  setTripReport: (report: TripAnalysisReport) => void;
 
  // Restaurar sesión histórica (solo rachas + auditoría)
  restoreHistorical: (report: StreakReportRow[], audit: AuditTrailType, label: string, id: string) => void;
  exitHistorical: () => void;

  // Dexie DB Persistence
  globalDateRange: { from: string; to: string } | null;
  availableMonths: string[];
  setGlobalDateRange: (range: { from: string; to: string }) => void;
  loadDataFromDb: (from: string, to: string) => Promise<void>;
  scanAvailableMonths: () => Promise<void>;
}

export const useFleetStore = create<FleetState>((set) => ({
  rawParsedData: null,
  streakReport: null,
  auditTrail: null,
  sidebarOpen: false,
  weekendFilter: {
    from: null,
    to: null,
    dayFilter: "all",
    searchQuery: "",
  },
  weekendReport: null,
  stopReport: null,
  tripReport: null,
  isHistoricalView: false,
  historicalLabel: "",
  historicalId: null,

  globalDateRange: null,
  availableMonths: [],

  setFleetData: (raw, report, audit) => set({ 
    rawParsedData: raw, 
    streakReport: report, 
    auditTrail: audit,
    isHistoricalView: false,
    historicalLabel: "",
    historicalId: null,
    weekendReport: null,
    stopReport: null,
    tripReport: null,
  }),
  setStreakReport: (report) => set({ streakReport: report }),
  clearData: () => set({ 
    rawParsedData: null, 
    streakReport: null, 
    auditTrail: null,
    weekendReport: null,
    stopReport: null,
    isHistoricalView: false,
    historicalLabel: "",
    historicalId: null,
  }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  
  setWeekendFilter: (filterUpdate) => set((state) => ({ 
    weekendFilter: { ...state.weekendFilter, ...filterUpdate } 
  })),
  setWeekendReport: (report) => set({ weekendReport: report }),
  setStopReport: (report) => set({ stopReport: report }),
  setTripReport: (report) => set({ tripReport: report }),

  restoreHistorical: (report, audit, label, id) => set({
    streakReport: report,
    auditTrail: audit,
    rawParsedData: null,
    weekendReport: null,
    stopReport: null,
    tripReport: null,
    isHistoricalView: true,
    historicalLabel: label,
    historicalId: id,
  }),
  exitHistorical: () => set({
    streakReport: null,
    auditTrail: null,
    rawParsedData: null,
    weekendReport: null,
    stopReport: null,
    tripReport: null,
    isHistoricalView: false,
    historicalLabel: "",
    historicalId: null,
  }),

  setGlobalDateRange: (range) => set({ globalDateRange: range }),

  scanAvailableMonths: async () => {
    try {
      // Obtenemos todas las fechas únicas (YYYY-MM)
      const records = await db.telemetry.orderBy('fecha').uniqueKeys();
      const monthsSet = new Set<string>();
      records.forEach(r => {
        if (typeof r === 'string') {
          monthsSet.add(r.substring(0, 7)); // Extraer YYYY-MM
        }
      });
      const sortedMonths = Array.from(monthsSet).sort();
      set({ availableMonths: sortedMonths });
      
      // Si no hay rango global seleccionado y hay meses, seleccionamos el más reciente por defecto
      const currentRange = useFleetStore.getState().globalDateRange;
      if (!currentRange && sortedMonths.length > 0) {
        const lastMonth = sortedMonths[sortedMonths.length - 1];
        // Asignar del día 1 al 31
        useFleetStore.getState().setGlobalDateRange({
          from: `${lastMonth}-01`,
          to: `${lastMonth}-31`
        });
      }
    } catch (e) {
      console.error("Error scanning available months in DB:", e);
    }
  },

  loadDataFromDb: async (from: string, to: string) => {
    try {
      // Filtrar usando el index 'fecha' (string "YYYY-MM-DD")
      const events = await db.telemetry.where('fecha').between(from, to, true, true).toArray();
      // Reconstruimos el rawParsedData
      const rawData = events.map(e => e.rawJson);
      
      const isHistorical = useFleetStore.getState().isHistoricalView;

      // Limpiamos reportes para forzar su regeneración SOLO si no estamos en vista histórica
      // (Si es histórica, queremos preservar lo que restauramos del snapshot)
      set({ 
        rawParsedData: rawData,
        ...(isHistorical ? {} : {
          streakReport: null,
          weekendReport: null,
          stopReport: null,
          tripReport: null,
        })
      });
    } catch (e) {
      console.error("Error loading data from DB:", e);
    }
  }
}));
