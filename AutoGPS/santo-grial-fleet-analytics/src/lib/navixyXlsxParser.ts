import ExcelJS from "exceljs";

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
       const firstCell = row.getCell(1).text?.trim() || "";
       if (firstCell === "Tiempo" || firstCell === "Matrícula") {
          headerRowIdx = rowNumber;
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.text?.trim() || `Col_${colNumber}`;
          });
       }
     }
  });

  if (headerRowIdx === -1) return []; // No headers found

  let currentVehiculo = "";
  let currentMatricula = "";
  let currentDate = "";

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;
    
    const col1 = row.getCell(1).text?.trim() || "";
    const col2 = row.getCell(2).text?.trim() || "";
    const col3 = row.getCell(3).text?.trim() || "";
    
    // Detectar Fecha (ej. "31.03.2026" o "31/03/2026")
    if (col1.match(/^\d{2}[\/\.]\d{2}[\/\.]\d{4}$/)) {
      currentDate = col1.replace(/\./g, '/');
      return;
    }
    
    // Detectar Vehículo (Si no hay distancia ni tiempo y tiene texto)
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
       
       // El reporte agrupado divide el tiempo y la fecha, aquí lo unimos
       flatRow["Hora inicial "] = `${currentDate} ${col1}`; 
       
       row.eachCell((cell, colNumber) => {
         const headerName = headers[colNumber];
         if (headerName) {
            let val = cell.text?.trim() || "";
            // Normalizar a formato "Telemetría CSV"
            if (headerName === "Lugar") flatRow["Dirección"] = val;
            if (headerName === "Distancia (km)") flatRow["distancia (km)"] = val;
            if (headerName === "Vel. Máxima") flatRow["vel. máxima"] = val;
            if (headerName === "Total ralentí") flatRow["Tiempo aparcado "] = val;
            
            // Extracción inteligente de Geocercas (Navixy lo pone en Trabajo o Privado)
            if (headerName === "Privado" || headerName === "Trabajo") {
              if (val !== "" && !flatRow["Geocercas"]) {
                flatRow["Geocercas"] = val; 
              }
            }
            
            flatRow[headerName] = val;
         }
       });
       
       rows.push(flatRow);
    }
  });

  return rows;
}
