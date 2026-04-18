import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(request: Request) {
  try {
    const newEntries: {
      geocercas: string[];
      placas: string[];
      consecutivos: string[];
      vehiculos: string[];
      unidadesRelacionales: { Placas: string; Consecutivo: string; Vehículo: string }[];
    } = await request.json();

    // Leer diccionario actual
    const dictPath = path.join(process.cwd(), "src", "lib", "dictionary.json");
    let currentDict: any = { geocercas: [], placas: [], consecutivos: [], vehiculos: [], unidadesRelacionales: [] };

    try {
      const raw = await fs.readFile(dictPath, "utf-8");
      currentDict = JSON.parse(raw);
    } catch {
      // Si no existe, arrancamos con uno vacío
    }

    // Mergear sin duplicados usando Sets
    const mergeUnique = (existing: string[], incoming: string[]): string[] => {
      const set = new Set(existing);
      incoming.forEach(item => {
        if (item && item.trim()) set.add(item.trim());
      });
      return Array.from(set).sort();
    };

    currentDict.geocercas = mergeUnique(currentDict.geocercas || [], newEntries.geocercas || []);
    currentDict.placas = mergeUnique(currentDict.placas || [], newEntries.placas || []);
    currentDict.consecutivos = mergeUnique(currentDict.consecutivos || [], newEntries.consecutivos || []);
    currentDict.vehiculos = mergeUnique(currentDict.vehiculos || [], newEntries.vehiculos || []);

    // Mergear unidades relacionales por Placas (clave primaria)
    const existingUnits: Map<string, any> = new Map();
    (currentDict.unidadesRelacionales || []).forEach((u: any) => {
      existingUnits.set(u.Placas, u);
    });
    (newEntries.unidadesRelacionales || []).forEach((u) => {
      if (u.Placas && u.Placas.trim()) {
        existingUnits.set(u.Placas.trim(), {
          Placas: u.Placas.trim(),
          Consecutivo: u.Consecutivo?.trim() || existingUnits.get(u.Placas.trim())?.Consecutivo || "",
          Vehículo: u.Vehículo?.trim() || existingUnits.get(u.Placas.trim())?.Vehículo || "",
        });
      }
    });
    currentDict.unidadesRelacionales = Array.from(existingUnits.values())
      .sort((a: any, b: any) => a.Placas.localeCompare(b.Placas));

    // Estadísticas de cambios
    const beforeCount = {
      geocercas: (currentDict.geocercas || []).length,
      placas: (currentDict.placas || []).length,
      vehiculos: (currentDict.vehiculos || []).length,
    };

    // Escribir de regreso
    await fs.writeFile(dictPath, JSON.stringify(currentDict, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      message: "Diccionario actualizado",
      stats: {
        geocercas: currentDict.geocercas.length,
        placas: currentDict.placas.length,
        consecutivos: currentDict.consecutivos.length,
        vehiculos: currentDict.vehiculos.length,
        unidades: currentDict.unidadesRelacionales.length,
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error actualizando diccionario:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
