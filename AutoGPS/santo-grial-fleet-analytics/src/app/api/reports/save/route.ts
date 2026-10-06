import { db } from '@/lib/pg';
import { NextResponse } from 'next/server';

/**
 * Guarda el resultado de un análisis procesado en PostgreSQL.
 * Usa el hash del archivo como clave única para evitar duplicados.
 */
export async function POST(request: Request) {
  try {
    const { hash, fileName, month, payload, auditTrail, type } = await request.json();

    if (!hash || !payload) {
      return NextResponse.json({ error: "Faltan datos críticos (hash o payload)" }, { status: 400 });
    }

    const pool = await db();
    const { rows } = await pool.query(
      `INSERT INTO analysis_reports (id, file_name, month, report_type, data, audit_trail, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         month = EXCLUDED.month,
         report_type = EXCLUDED.report_type,
         data = EXCLUDED.data,
         audit_trail = EXCLUDED.audit_trail,
         updated_at = NOW()
       RETURNING *`,
      [hash, fileName ?? null, month ?? null, type || 'general', JSON.stringify(payload), auditTrail ? JSON.stringify(auditTrail) : null]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("Error saving report to Postgres:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
