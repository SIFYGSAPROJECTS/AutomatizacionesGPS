import { db } from '@/lib/pg';
import { NextResponse } from 'next/server';
import { normalizeLocationName } from '@/lib/utils';

/**
 * Recibe un listado de lugares con sus coordenadas y los guarda en el maestro.
 * Esto sirve para que los reportes de RUTAS (que no traen coordenadas)
 * puedan "aprender" de los reportes de PARADAS (que sí traen).
 */
export async function POST(request: Request) {
  try {
    const { locations } = await request.json(); // Array de { name, lat, lng }

    if (!Array.isArray(locations)) {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
    }

    // Normalizar nombres antes de guardar para evitar duplicados por minúsculas/acentos
    const deduped = new Map<string, { name_key: string; display_name: string; lat: number; lng: number }>();
    for (const loc of locations) {
      const name_key = normalizeLocationName(loc.name);
      if (name_key && loc.lat && loc.lng) {
        deduped.set(name_key, { name_key, display_name: loc.name, lat: loc.lat, lng: loc.lng });
      }
    }
    const records = Array.from(deduped.values());
    if (records.length === 0) return NextResponse.json({ success: true, count: 0 });

    const pool = await db();
    const values: any[] = [];
    const placeholders = records.map((r, i) => {
      values.push(r.name_key, r.display_name, r.lat, r.lng);
      const b = i * 4;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, NOW())`;
    });

    await pool.query(
      `INSERT INTO site_geography (name_key, display_name, lat, lng, last_updated)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (name_key) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         last_updated = NOW()`,
      values
    );

    return NextResponse.json({ success: true, count: records.length });
  } catch (error: any) {
    console.error("Error syncing coordinates:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
