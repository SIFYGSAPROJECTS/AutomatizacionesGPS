import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

// Helper tolerante para extraer el valor/texto de celdas de Excel
function getCellValueStr(cell: any): string {
  if (!cell) return "";
  if (cell.text !== undefined && cell.text !== null) {
    const t = String(cell.text).trim();
    if (t !== "" && !t.includes("GMT")) return t;
  }
  if (cell.value !== undefined && cell.value !== null) {
    if (typeof cell.value === "object" && cell.value !== null && (cell.value as any).result !== undefined) {
      return String((cell.value as any).result).trim();
    }
    if (cell.value instanceof Date) {
      const d = cell.value;
      if (d.getFullYear() === 1899 || d.getFullYear() === 1900) {
        // Es una duración de tiempo en Excel
        const baseDate = new Date(1899, 11, 30);
        const diffMs = d.getTime() - baseDate.getTime();
        const totalSecs = Math.max(0, Math.round(diffMs / 1000));
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    return String(cell.value).trim();
  }
  return "";
}

// Función recursiva para obtener todos los archivos .xlsx de un directorio (excluyendo temporales de Excel ~$...)
function getAllXlsxFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return [];

  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const fileStat = fs.statSync(filePath);
    
    if (fileStat && fileStat.isDirectory()) {
      results = results.concat(getAllXlsxFilesRecursively(filePath));
    } else if (file.toLowerCase().endsWith(".xlsx") && !file.startsWith("~$")) {
      results.push(filePath);
    }
  }
  
  return results;
}

// Filtra las carpetas que inician con "Informe de paradas" si se escanea la raíz del Dashboard
function getXlsxFilesFromReportFolders(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return [];

  const dirName = path.basename(dir).toLowerCase();
  if (dirName.startsWith("informe de paradas")) {
    return getAllXlsxFilesRecursively(dir);
  }

  let results: string[] = [];
  const list = fs.readdirSync(dir);
  let processedAsParent = false;

  for (const file of list) {
    const filePath = path.join(dir, file);
    const fileStat = fs.statSync(filePath);
    
    if (fileStat && fileStat.isDirectory()) {
      if (file.toLowerCase().startsWith("informe de paradas")) {
        processedAsParent = true;
        results = results.concat(getAllXlsxFilesRecursively(filePath));
      }
    }
  }

  if (!processedAsParent) {
    console.log("⚠️ No se encontraron carpetas con prefijo 'Informe de paradas' en el primer nivel. Escaneando recursivamente todo el directorio.");
    return getAllXlsxFilesRecursively(dir);
  }

  return results;
}

export async function POST(req: Request) {
  try {
    const dirPath = process.env.LOCAL_REPORTS_DIR || "./rutas";
    const resolvedPath = path.resolve(dirPath);

    console.log("📂 Iniciando escaneo en carpeta local:", resolvedPath);

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: `El directorio configurado no existe: ${resolvedPath}. Por favor configúralo en .env.local` },
        { status: 404 }
      );
    }

    const xlsxFiles = getXlsxFilesFromReportFolders(resolvedPath);
    console.log(`🔍 Se encontraron ${xlsxFiles.length} archivos .xlsx para procesar.`);

    const allRows: Record<string, string>[] = [];
    const filesProcessed: string[] = [];

    for (const filePath of xlsxFiles) {
      const fileName = path.basename(filePath);
      const relativePath = path.relative(resolvedPath, filePath);
      console.log(`📄 Procesando archivo: ${relativePath}`);
      
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      
      const sheet = workbook.worksheets[0];

      if (!sheet) continue;

      // --- LOGICA POWERQUERY: Encontrar encabezado "Matrícula" o "Tiempo" ---
      let headerRowIdx = -1;
      const headers: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (headerRowIdx === -1) {
          let hasHeader = false;
          row.eachCell((cell) => {
            const txt = cell.text?.trim() || "";
            if (txt === "Matrícula" || txt === "Tiempo") {
              hasHeader = true;
            }
          });
          if (hasHeader) {
            headerRowIdx = rowNumber;
            row.eachCell((cell, colNumber) => {
              // Limpiamos los nombres de columnas (TransformColumnNames(..., Text.Trim))
              headers[colNumber] = cell.text?.trim() || `Col_${colNumber}`;
            });
          }
        }
      });

      if (headerRowIdx === -1) {
        console.warn(`⚠️ No se encontraron cabeceras en ${fileName}. Omitiendo.`);
        continue;
      }

      let currentVehiculo = "";
      let currentMatricula = "";
      let currentDate = "";

      const isFlatReport = headers.some(h => h && h.toLowerCase().trim() === "matrícula");

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIdx) return;
        
        if (isFlatReport) {
          // ================= REPORTE PLANO =================
          const flatRow: Record<string, string> = {};
          flatRow["Archivo de Origen"] = relativePath;
          
          row.eachCell((cell, colNumber) => {
            const headerName = headers[colNumber];
            if (headerName) {
              const val = getCellValueStr(cell);
              
              // Normalizaciones de nombres de columnas
              if (headerName === "Dirección" || headerName === "Lugar") flatRow["Dirección"] = val;
              if (headerName === "Distancia (km)") flatRow["distancia (km)"] = val;
              if (headerName === "Vel. Máxima") flatRow["vel. máxima"] = val;
              if (headerName === "Tiempo aparcado" || headerName === "Total ralentí") flatRow["Tiempo aparcado "] = val;
              
              if (headerName === "Privado" || headerName === "Trabajo" || headerName === "Geocercas") {
                if (val !== "" && !flatRow["Geocercas"]) {
                  flatRow["Geocercas"] = val;
                }
              }
              
              flatRow[headerName] = val;
            }
          });

          // En reporte plano, "Hora inicial" contiene fecha y hora (ej: "01.04.2026 00:00").
          // La copiamos a "Hora inicial " para que las funciones lo reconozcan
          const hIniReal = flatRow["Hora inicial"] || "";
          if (hIniReal) {
            flatRow["Hora inicial "] = hIniReal;
          }

          if (flatRow["Matrícula"]) {
            allRows.push(flatRow);
          }
        } else {
          // ================= REPORTE AGRUPADO =================
          const c1 = getCellValueStr(row.getCell(1));
          const c2 = getCellValueStr(row.getCell(2));
          const c3 = getCellValueStr(row.getCell(3));
          const c4 = getCellValueStr(row.getCell(4));
          const col1 = c1 || c2;
          const col2 = c1 ? c2 : c3;
          const col3 = c1 ? c3 : c4;
          
          // Detectar Fecha (ej. "31.03.2026" o "31/03/2026")
          if (col1.match(/^\d{2}[\/\.]\d{2}[\/\.]\d{4}$/)) {
            currentDate = col1.replace(/\./g, '/');
            return;
          }
          
          // Detectar Vehículo (Si no hay distancia ni tiempo y tiene texto en col1)
          if (col1 !== "" && col3 === "" && !col1.match(/^\d{1,2}:\d{2}/)) {
             const parts = col1.split(" ");
             currentMatricula = parts[0] || col1;
             currentVehiculo = col2.replace(/[()]/g, "") || col1;
             return;
          }
          
          // Detectar Fila de Viaje o Parada
          if (col1.match(/^\d{1,2}:\d{2}/) || (col1 !== "" && col2 !== "")) {
             const flatRow: Record<string, string> = {};
             flatRow["Archivo de Origen"] = relativePath;
             flatRow["Matrícula"] = currentMatricula;
             flatRow["Vehículo"] = currentVehiculo;
             
             // Unimos fecha y hora
             flatRow["Hora inicial "] = `${currentDate} ${col1}`; 
             
             row.eachCell((cell, colNumber) => {
               const headerName = headers[colNumber];
               if (headerName) {
                  const val = getCellValueStr(cell);
                  
                  // Normalizar a formato plano unificado de telemetría
                  if (headerName === "Lugar") flatRow["Dirección"] = val;
                  if (headerName === "Distancia (km)") flatRow["distancia (km)"] = val;
                  if (headerName === "Vel. Máxima") flatRow["vel. máxima"] = val;
                  if (headerName === "Total ralentí") flatRow["Tiempo aparcado "] = val;
                  
                  // Extraer Geocercas (Navixy lo pone en Trabajo o Privado)
                  if (headerName === "Privado" || headerName === "Trabajo") {
                    if (val !== "" && !flatRow["Geocercas"]) {
                      flatRow["Geocercas"] = val; 
                    }
                  }
                  
                  flatRow[headerName] = val;
               }
             });
             
             // Filtro: Asegurar que el registro tenga matrícula para evitar vacíos
             if (flatRow["Matrícula"]) {
               allRows.push(flatRow);
             }
          }
        }
      });

      filesProcessed.push(relativePath);
    }

    console.log(`✅ Sincronización exitosa. Total filas extraídas: ${allRows.length}`);

    return NextResponse.json({
      success: true,
      filesProcessed,
      totalRecords: allRows.length,
      rawRows: allRows
    });

  } catch (error: any) {
    console.error("❌ Error en process-local-folder API:", error);
    return NextResponse.json(
      { error: "Error interno al procesar los archivos locales", details: error.message },
      { status: 500 }
    );
  }
}
