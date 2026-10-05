import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Recupera un reporte específico o lista los disponibles por mes.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    const month = searchParams.get('month');

    if (hash) {
      const { data, error } = await supabase
        .from('analysis_reports')
        .select('*')
        .eq('id', hash)
        .single();
        
      if (error) throw error;
      return NextResponse.json(data);
    }

    let query = supabase.from('analysis_reports').select('*');

    if (month) {
      const { data, error } = await query
        .eq('month', month)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return NextResponse.json(data);
    }

    // Listar últimos 20 análisis si no hay month ni hash
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error loading reports from Supabase:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
