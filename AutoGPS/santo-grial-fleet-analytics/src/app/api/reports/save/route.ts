import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Guarda el resultado de un análisis procesado en Supabase.
 * Usa el hash del archivo como clave única para evitar duplicados.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { hash, fileName, month, payload, auditTrail, type } = await request.json();

    if (!hash || !payload) {
      return NextResponse.json({ error: "Faltan datos críticos (hash o payload)" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('analysis_reports')
      .upsert({
        id: hash,
        file_name: fileName,
        month: month,
        report_type: type || 'general',
        data: payload,
        audit_trail: auditTrail,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error saving report to Supabase:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
