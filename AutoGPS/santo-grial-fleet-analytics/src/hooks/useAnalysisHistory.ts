"use client";

import { useState, useEffect, useCallback } from "react";
import { StreakReportRow, AuditTrailType } from "@/lib/streaksAnalyzer";

const INDEX_KEY = "fleet-analysis-history-v1";
const REPORT_PREFIX = "fleet-report-";
const MAX_SESSIONS = 15;

export interface AnalysisSnapshot {
  id: string;
  timestamp: string;
  fileName: string;
  fileSizeKB: number;
  totalRows: number;
  streaksFound: number;
  uniqueGeocercas: number;
  uniqueVehicles: number;
  dateRangeFrom: string;
  dateRangeTo: string;
  totalDaysAnalyzed: number;
}

export interface StoredReport {
  streakReport: StreakReportRow[];
  auditTrail: AuditTrailType;
}

// ============================================================
// Lee el índice SIEMPRE directo de localStorage (source of truth)
// para evitar desincronización entre instancias del hook.
// ============================================================
function readIndex(): AnalysisSnapshot[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeIndex(data: AnalysisSnapshot[]) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(data)); } catch {}
}

export function useAnalysisHistory() {
  const [history, setHistory] = useState<AnalysisSnapshot[]>([]);

  // Sync desde localStorage al montar
  useEffect(() => {
    setHistory(readIndex());
  }, []);

  // Refresh: re-lee de localStorage (útil tras acciones externas)
  const refresh = useCallback(() => {
    setHistory(readIndex());
  }, []);

  const addSnapshot = useCallback((
    meta: Omit<AnalysisSnapshot, "id" | "timestamp">,
    report: StoredReport
  ) => {
    const id = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry: AnalysisSnapshot = {
      ...meta,
      id,
      timestamp: new Date().toISOString(),
    };

    // SIEMPRE leer el índice fresco de localStorage, no del state
    const current = readIndex();

    // Guardar reporte completo
    try {
      localStorage.setItem(REPORT_PREFIX + id, JSON.stringify(report));
    } catch {
      // Si no cabe, purgar los más viejos
      const old = [...current];
      while (old.length > 3) {
        const removed = old.pop()!;
        try { localStorage.removeItem(REPORT_PREFIX + removed.id); } catch {}
      }
      writeIndex(old);
      try { localStorage.setItem(REPORT_PREFIX + id, JSON.stringify(report)); } catch {}
    }

    const updated = [entry, ...current].slice(0, MAX_SESSIONS);

    // Limpiar reportes huérfanos
    const idsToKeep = new Set(updated.map(s => s.id));
    for (const old of current) {
      if (!idsToKeep.has(old.id)) {
        try { localStorage.removeItem(REPORT_PREFIX + old.id); } catch {}
      }
    }

    writeIndex(updated);
    setHistory(updated);
    return entry;
  }, []); // Sin dependencias de state → siempre lee fresco de localStorage

  const loadReport = useCallback((id: string): StoredReport | null => {
    try {
      const raw = localStorage.getItem(REPORT_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const clearHistory = useCallback(() => {
    // Leer índice fresco y borrar todos los reportes asociados
    const current = readIndex();
    for (const snap of current) {
      try { localStorage.removeItem(REPORT_PREFIX + snap.id); } catch {}
    }
    writeIndex([]);
    setHistory([]);
  }, []);

  return { history, addSnapshot, loadReport, clearHistory, refresh };
}
