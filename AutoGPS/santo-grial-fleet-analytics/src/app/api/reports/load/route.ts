import { db } from '@/lib/pg';
import { NextResponse } from 'next/server';

/**
 * Recupera un reporte específico o lista los disponibles por mes.
 */
export async function GET(request: Request) {
  try {
    const pool = await db();
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    const month = searchParams.get('month');

    if (hash) {
      const { rows } = await pool.query('SELECT * FROM analysis_reports WHERE id = $1', [hash]);
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    if (month) {
      const { rows } = await pool.query(
        'SELECT * FROM analysis_reports WHERE month = $1 ORDER BY created_at DESC',
        [month]
      );
      return NextResponse.json(rows);
    }

    // Listar últimos 20 análisis si no hay month ni hash
    const { rows } = await pool.query('SELECT * FROM analysis_reports ORDER BY created_at DESC LIMIT 20');
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error loading reports from Postgres:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
