import { create } from "zustand";
import { RawTelemetryRow, StreakReportRow, AuditTrailType } from "@/lib/streaksAnalyzer";

import { WeekendUsageReport } from "@/lib/weekendAnalyzer";
import { StopProfileReport } from "@/lib/stopProfiler";

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

  // Historial
  isHistoricalView: boolean;
  historicalLabel: string;
  
  setFleetData: (raw: RawTelemetryRow[], report: StreakReportRow[], audit: AuditTrailType) => void;
  setStreakReport: (report: StreakReportRow[]) => void;
  clearData: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  
  setWeekendFilter: (filter: Partial<WeekendFilter>) => void;
  setWeekendReport: (report: WeekendUsageReport) => void;
  setStopReport: (report: StopProfileReport) => void;

  // Restaurar sesión histórica (solo rachas + auditoría)
  restoreHistorical: (report: StreakReportRow[], audit: AuditTrailType, label: string) => void;
  exitHistorical: () => void;
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
  isHistoricalView: false,
  historicalLabel: "",

  setFleetData: (raw, report, audit) => set({ 
    rawParsedData: raw, 
    streakReport: report, 
    auditTrail: audit,
    isHistoricalView: false,
    historicalLabel: "",
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
  }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  
  setWeekendFilter: (filterUpdate) => set((state) => ({ 
    weekendFilter: { ...state.weekendFilter, ...filterUpdate } 
  })),
  setWeekendReport: (report) => set({ weekendReport: report }),
  setStopReport: (report) => set({ stopReport: report }),

  restoreHistorical: (report, audit, label) => set({
    streakReport: report,
    auditTrail: audit,
    rawParsedData: null,
    weekendReport: null,
    stopReport: null,
    isHistoricalView: true,
    historicalLabel: label,
  }),
  exitHistorical: () => set({
    streakReport: null,
    auditTrail: null,
    rawParsedData: null,
    weekendReport: null,
    stopReport: null,
    isHistoricalView: false,
    historicalLabel: "",
  }),
}));
