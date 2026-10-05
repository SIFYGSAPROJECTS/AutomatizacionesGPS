import ExcelJS from "exceljs";

// Helper tolerante para extraer el valor/texto de celdas de Excel en el navegador
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

export async function parseNavixyReport(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: Record<string, string>[] = [];
  
  // Encontrar la fila de cabeceras
  let headerRowIdx = -1;
  const headers: string[] = [];
  
  sheet.eachRow((row, rowNumber) => {
     if (headerRowIdx === -1) {
       let hasHeader = false;
       row.eachCell((cell) => {
         const txt = getCellValueStr(cell);
         if (txt === "Tiempo" || txt === "Matrícula") {
            hasHeader = true;
         }
       });
       if (hasHeader) {
         headerRowIdx = rowNumber;
         row.eachCell((cell, colNumber) => {
           headers[colNumber] = getCellValueStr(cell);
         });
       }
     }
  });

  if (headerRowIdx === -1) return []; // No headers found

  let currentVehiculo = "";
  let currentMatricula = "";
  let currentDate = "";

  const isFlatReport = headers.some(h => h && h.toLowerCase().trim() === "matrícula");

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;
    
    if (isFlatReport) {
      // ================= REPORTE PLANO =================
      const flatRow: Record<string, string> = {};
      
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

      const hIniReal = flatRow["Hora inicial"] || "";
      if (hIniReal) {
        flatRow["Hora inicial "] = hIniReal;
      }

      if (flatRow["Matrícula"]) {
        rows.push(flatRow);
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
      
      // Detectar Fecha
      if (col1.match(/^\d{2}[\/\.]\d{2}[\/\.]\d{4}$/)) {
        currentDate = col1.replace(/\./g, '/');
        return;
      }
      
      // Detectar Vehículo
      if (col1 !== "" && col3 === "" && !col1.match(/^\d{1,2}:\d{2}/)) {
         const parts = col1.split(" ");
         currentMatricula = parts[0] || col1;
         currentVehiculo = col2.replace(/[()]/g, "") || col1;
         return;
      }
      
      // Detectar Fila de Viaje o Parada
      if (col1.match(/^\d{1,2}:\d{2}/) || (col1 !== "" && col2 !== "")) {
         const flatRow: Record<string, string> = {};
         flatRow["Matrícula"] = currentMatricula;
         flatRow["Vehículo"] = currentVehiculo;
         flatRow["Hora inicial "] = `${currentDate} ${col1}`; 
         
         row.eachCell((cell, colNumber) => {
           const headerName = headers[colNumber];
           if (headerName) {
              const val = getCellValueStr(cell);
              if (headerName === "Lugar") flatRow["Dirección"] = val;
              if (headerName === "Distancia (km)") flatRow["distancia (km)"] = val;
              if (headerName === "Vel. Máxima") flatRow["vel. máxima"] = val;
              if (headerName === "Total ralentí") flatRow["Tiempo aparcado "] = val;
              
              if (headerName === "Privado" || headerName === "Trabajo") {
                if (val !== "" && !flatRow["Geocercas"]) {
                  flatRow["Geocercas"] = val; 
                }
              }
              
              flatRow[headerName] = val;
           }
         });
         
         if (flatRow["Matrícula"]) {
           rows.push(flatRow);
         }
      }
    }
  });

  return rows;
}

