import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Genera un hash SHA-256 único a partir del contenido de un archivo.
 * Esto permite identificar archivos duplicados sin importar el nombre.
 */
export async function getFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Normaliza nombres de lugares para mejorar el cruce de datos
 */
export function normalizeLocationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^a-z0-9\s]/g, "")     // Quitar caracteres especiales
    .replace(/\s+/g, " ");           // Quitar espacios extra
}

/**
 * Convierte de manera tolerante strings de fechas locales en español o formatos estándar
 * a objetos Date nativos, soportando DD/MM/YYYY, DD-MM-YYYY y DD.MM.YYYY.
 */
export function parseDateRobust(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  
  const cleaned = dateStr.trim();
  
  // 1. Detectar formato DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY (con o sin hora/segundos)
  // ej: "09/05/2026 07:36", "09.05.2026", "09-05-2026 07:36:00"
  const matchEs = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (matchEs) {
    const day = parseInt(matchEs[1], 10);
    const month = parseInt(matchEs[2], 10) - 1; // 0-indexed
    const year = parseInt(matchEs[3], 10);
    const h = matchEs[4] ? parseInt(matchEs[4], 10) : 0;
    const m = matchEs[5] ? parseInt(matchEs[5], 10) : 0;
    const s = matchEs[6] ? parseInt(matchEs[6], 10) : 0;
    
    // Validación de rangos básicos
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      return new Date(year, month, day, h, m, s);
    }
  }
  
  // 2. Detectar formato YYYY/MM/DD o YYYY-MM-DD o YYYY.MM.DD (con o sin hora/segundos)
  // ej: "2026-05-09 07:36:00"
  const matchIso = cleaned.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (matchIso) {
    const year = parseInt(matchIso[1], 10);
    const month = parseInt(matchIso[2], 10) - 1; // 0-indexed
    const day = parseInt(matchIso[3], 10);
    const h = matchIso[4] ? parseInt(matchIso[4], 10) : 0;
    const m = matchIso[5] ? parseInt(matchIso[5], 10) : 0;
    const s = matchIso[6] ? parseInt(matchIso[6], 10) : 0;
    
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      return new Date(year, month, day, h, m, s);
    }
  }
  
  // 3. Fallback a parseador nativo de JS (para otros formatos estándar)
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  return new Date(NaN);
}
