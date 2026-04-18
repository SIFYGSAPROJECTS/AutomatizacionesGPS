"use client";

import { useState, useCallback, useEffect } from "react";
import { StopClassification } from "@/lib/stopProfiler";

const STORAGE_KEY = "stop-classifications-v1";

type ClassificationMap = Record<string, StopClassification>;

/**
 * Hook que persiste las clasificaciones de paradas en localStorage.
 * Sobrevive al refresh del navegador.
 */
export function useStopClassifications() {
  const [classifications, setClassifications] = useState<ClassificationMap>({});

  // Cargar desde localStorage al montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setClassifications(JSON.parse(stored));
      }
    } catch {
      // localStorage no disponible o corrupto
    }
  }, []);

  // Persistir cada vez que cambie
  const persist = useCallback((updated: ClassificationMap) => {
    setClassifications(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Silenciar error de quota
    }
  }, []);

  const classify = useCallback(
    (addressKey: string, type: StopClassification) => {
      const updated = { ...classifications, [addressKey]: type };
      persist(updated);
    },
    [classifications, persist]
  );

  const getClassification = useCallback(
    (addressKey: string): StopClassification => {
      return classifications[addressKey] || "sin_clasificar";
    },
    [classifications]
  );

  const classifiedCount = Object.values(classifications).filter(
    (v) => v !== "sin_clasificar"
  ).length;

  return { classifications, classify, getClassification, classifiedCount };
}
