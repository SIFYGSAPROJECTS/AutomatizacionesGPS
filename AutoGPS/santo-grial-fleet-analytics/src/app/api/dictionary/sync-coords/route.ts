import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { normalizeLocationName } from '@/lib/utils';

/**
 * Recibe un listado de lugares con sus coordenadas y los guarda en el maestro.
 * Esto sirve para que los reportes de RUTAS (que no traen coordenadas)
 * puedan "aprender" de los reportes de PARADAS (que sí traen).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { locations } = await request.json(); // Array de { name, lat, lng }

    if (!Array.isArray(locations)) {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
    }

    // Normalizar nombres antes de guardar para evitar duplicados por minúsculas/acentos
    const records = locations.map(loc => ({
      name_key: normalizeLocationName(loc.name),
      display_name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      last_updated: new Date().toISOString()
    })).filter(loc => loc.name_key && loc.lat && loc.lng);

    const { data, error } = await supabase
      .from('site_geography')
      .upsert(records, { onConflict: 'name_key' });

    if (error) throw error;

    return NextResponse.json({ success: true, count: records.length });
  } catch (error: any) {
    console.error("Error syncing coordinates:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
