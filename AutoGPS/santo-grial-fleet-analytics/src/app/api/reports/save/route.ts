import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { format } from "date-fns";

export async function POST(request: Request) {
  try {
    const { csvContent, excelBase64 } = await request.json();

    if (!csvContent && !excelBase64) {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    const generadosDir = path.join(process.cwd(), "generados");
    try {
      await fs.access(generadosDir);
    } catch {
      await fs.mkdir(generadosDir, { recursive: true });
    }

    const now = new Date();
    
    // Guardado de Excel Binario (.xlsx)
    if (excelBase64) {
      const filename = `Analisis_Rachas_${format(now, "dd-MM-yyyy_HH-mm-ss")}.xlsx`;
      const filePath = path.join(generadosDir, filename);
      
      const buffer = Buffer.from(excelBase64, 'base64');
      await fs.writeFile(filePath, buffer);
      
      return NextResponse.json({ success: true, message: "Excel guardado", filename }, { status: 200 });
    }

    // Guardado Legacy de CSV (.csv)
    if (csvContent) {
      const filename = `Analisis_Rachas_${format(now, "dd-MM-yyyy_HH-mm-ss")}.csv`;
      const filePath = path.join(generadosDir, filename);
      const bom = "\uFEFF";
      const dataToWrite = csvContent.startsWith(bom) ? csvContent : bom + csvContent;
      await fs.writeFile(filePath, dataToWrite, "utf-8");
      
      return NextResponse.json({ success: true, message: "CSV guardado", filename }, { status: 200 });
    }

  } catch (error: any) {
    console.error("Failed to save report locally:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
