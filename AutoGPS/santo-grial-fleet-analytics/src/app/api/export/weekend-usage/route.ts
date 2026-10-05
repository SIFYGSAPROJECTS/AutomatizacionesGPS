import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { WeekendUsageReport } from "@/lib/weekendAnalyzer";

function applyCorporateHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      right: { style: 'thin', color: { argb: 'FFBFDBFE' } }
    };
  });
}

function applyHairBorders(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell(cell => {
        cell.alignment = { vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
      row.height = 20;
    }
  });
}

function formatDayAlerts(days: any[], targetDay: "sabado" | "domingo"): string {
  const filtered = (days || []).filter(d => d.diaNombre === targetDay);
  if (filtered.length === 0) return "N/A";
  
  return filtered.map(d => {
    const hours = (d.eventos || []).map((ev: any) => ev.hora).join(", ");
    return `${d.fecha}: ${hours}`;
  }).join("\n");
}

function getWeekendDatesInRange(
  fromStr?: string,
  toStr?: string,
  telemetryDays: string[] = []
): { dateStr: string; label: string }[] {
  let start: Date;
  let end: Date;

  if (fromStr && toStr) {
    start = new Date(fromStr);
    end = new Date(toStr);
  } else if (telemetryDays.length > 0) {
    const sorted = [...telemetryDays].sort();
    start = new Date(sorted[0]);
    end = new Date(sorted[sorted.length - 1]);
  } else {
    return [];
  }

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [];
  }

  const dates: { dateStr: string; label: string }[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (current > limit) {
    const temp = new Date(current);
    current.setTime(limit.getTime());
    limit.setTime(temp.getTime());
  }

  let safetyCounter = 0;
  while (current <= limit && safetyCounter < 1000) {
    safetyCounter++;
    const dayOfWeek = current.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const diaLabel = dayOfWeek === 6 ? "Sáb" : "Dom";
      const label = `${diaLabel} ${day}/${month}`;
      
      dates.push({ dateStr, label });
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export async function POST(req: Request) {
  try {
    const report: WeekendUsageReport = await req.json();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Santo Grial Fleet Analytics";
    workbook.created = new Date();

    // ==========================================
    // HOJA 1: RESUMEN EJECUTIVO (GERENCIAL)
    // ==========================================
    const sheet1 = workbook.addWorksheet("Resumen");
    
    // Configuración de impresión
    sheet1.pageSetup = { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 99 };
    sheet1.headerFooter = {
      oddFooter: "&LGenerado: Santo Grial Fleet Analytics&C&P de &N&RFecha: &D &T"
    };

    // Título Gerencial
    sheet1.mergeCells('A1:J3');
    const titleCell = sheet1.getCell('A1');
    titleCell.value = "REPORTE EJECUTIVO DE USO DE VEHÍCULOS EN FIN DE SEMANA";
    titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Cabeceras en Fila 4
    sheet1.getRow(4).values = [
      "Consecutivo",
      "Conductor",
      "Modelo/Tipo de Vehículo",
      "Matrícula",
      "Total Alertas",
      "Alertas Domingo",
      "Alertas Sábado",
      "Detalle Sábados (Fecha y Horas)",
      "Detalle Domingos (Fecha y Horas)",
      "Foco Principal de Abuso (Top Ubicación)"
    ];

    sheet1.columns = [
      { key: "consecutivo", width: 14 },
      { key: "conductor", width: 30 },
      { key: "modelo", width: 35 },
      { key: "matricula", width: 16 },
      { key: "total", width: 18 },
      { key: "domingo", width: 18 },
      { key: "sabado", width: 18 },
      { key: "detalleSabado", width: 32 },
      { key: "detalleDomingo", width: 32 },
      { key: "topRoute", width: 60 },
    ];

    let rowPointer = 5;
    report.byUnit.forEach((u) => {
      const mainRoute = u.topRoutes.length > 0 ? u.topRoutes[0].direccion : "N/A";
      const detailSabado = formatDayAlerts(u.weekendDays, "sabado");
      const detailDomingo = formatDayAlerts(u.weekendDays, "domingo");
      
      const r = sheet1.getRow(rowPointer);
      r.values = [
        u.consecutivo || "N/A",
        u.conductor || "N/A",
        u.modelo || "N/A",
        u.matricula || "N/A",
        u.totalEvents,
        u.sundayEvents,
        u.saturdayEvents,
        detailSabado,
        detailDomingo,
        mainRoute
      ];

      // Auto-calcular altura de fila basándonos en saltos de línea para el wrapText
      const linesSab = detailSabado.split("\n").length;
      const linesDom = detailDomingo.split("\n").length;
      const maxLines = Math.max(linesSab, linesDom, 1);
      r.height = Math.max(20, maxLines * 15);
      
      r.eachCell(cell => {
         cell.alignment = { vertical: 'middle' };
         cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
      // Center stats & indexes
      r.getCell(1).alignment = { horizontal: "center", vertical: 'middle' };
      r.getCell(5).alignment = { horizontal: "center", vertical: 'middle' };
      r.getCell(6).alignment = { horizontal: "center", vertical: 'middle' };
      r.getCell(7).alignment = { horizontal: "center", vertical: 'middle' };
      
      // Ajustar wrap text para multilínea en los detalles de deshoras
      r.getCell(8).alignment = { vertical: 'middle', wrapText: true };
      r.getCell(9).alignment = { vertical: 'middle', wrapText: true };

      rowPointer++;
    });

    // Formato de Header
    const headerRow = sheet1.getRow(4);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
        bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      };
    });

    // Conditional Formatting para Total Alertas (DataBars simulando gráfico)
    const totalRowFinal = rowPointer - 1;
    if (totalRowFinal >= 5) {
      sheet1.addConditionalFormatting({
        ref: `E5:E${totalRowFinal}`,
        rules: [
          {
            type: 'dataBar',
            priority: 1,
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: { argb: 'FFBFDBFE' }
          } as any
        ]
      });
    }


    // ==========================================
    // HOJA 2: CALENDARIO DE USO DE FIN DE SEMANA
    // ==========================================
    const sheetCal = workbook.addWorksheet("Calendario de Uso");
    sheetCal.pageSetup = { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 99 };
    sheetCal.headerFooter = {
      oddFooter: "&LGenerado: Santo Grial Fleet Analytics&C&P de &N&RFecha: &D &T"
    };

    const telemetryDays: string[] = [];
    report.byUnit.forEach(u => {
      u.weekendDays.forEach(wd => {
        if (wd.fecha) telemetryDays.push(wd.fecha);
      });
    });

    const weekendDates = getWeekendDatesInRange(
      report.summary.dateRange?.from,
      report.summary.dateRange?.to,
      telemetryDays
    );

    const baseColumns = [
      { header: "Consecutivo", key: "consecutivo", width: 14 },
      { header: "Conductor", key: "conductor", width: 30 },
      { header: "Modelo/Tipo de Vehículo", key: "modelo", width: 35 },
      { header: "Matrícula", key: "matricula", width: 16 }
    ];

    const dynamicColumns = weekendDates.map((wd) => ({
      header: wd.label,
      key: `date_${wd.dateStr}`,
      width: 9
    }));

    sheetCal.columns = [...baseColumns, ...dynamicColumns];

    const calHeaderRow = sheetCal.getRow(1);
    calHeaderRow.height = 25;
    applyCorporateHeader(sheetCal);

    report.byUnit.forEach((u) => {
      const rowData: Record<string, any> = {
        consecutivo: u.consecutivo || "N/A",
        conductor: u.conductor || "N/A",
        modelo: u.modelo || "N/A",
        matricula: u.matricula || "N/A"
      };

      let maxLines = 1;

      weekendDates.forEach((wd) => {
        const dayDetail = u.weekendDays.find(d => d.fecha === wd.dateStr);
        if (dayDetail && dayDetail.eventos && dayDetail.eventos.length > 0) {
          const hours = dayDetail.eventos.map(ev => ev.hora);
          rowData[`date_${wd.dateStr}`] = hours.join("\n");
          if (hours.length > maxLines) {
            maxLines = hours.length;
          }
        } else {
          rowData[`date_${wd.dateStr}`] = "";
        }
      });

      const newRow = sheetCal.addRow(rowData);
      newRow.height = Math.max(20, maxLines * 15);

      newRow.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };

        if (colNumber === 2 || colNumber === 3) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }

        if (colNumber > 4 && cell.value) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEDD5' }
          };
          cell.font = {
            color: { argb: 'FFC2410C' },
            bold: true,
            name: 'Calibri',
            size: 10
          };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        }
      });
    });


    // ==========================================
    // HOJA 3: RUTAS FRECUENTES (TOP 10)
    // ==========================================
    const sheet2 = workbook.addWorksheet("Rutas Frecuentes");
    sheet2.columns = [
      { header: "Consecutivo", key: "consecutivo", width: 14 },
      { header: "Conductor", key: "conductor", width: 30 },
      { header: "Modelo/Tipo de Vehículo", key: "modelo", width: 35 },
      { header: "Matrícula", key: "matricula", width: 16 },
      { header: "Vehículo", key: "vehiculo", width: 25 },
      { header: "Dirección Restringida (Lugar de Abuso)", key: "direccion", width: 80 },
      { header: "Veces Vista", key: "veces", width: 15 },
      { header: "Última Fecha", key: "ultima", width: 15 },
      { header: "Rango de Horas", key: "horas", width: 25 },
    ];

    report.byUnit.forEach(u => {
      u.topRoutes.forEach(r => {
        sheet2.addRow({
          consecutivo: u.consecutivo || "N/A",
          conductor: u.conductor || "N/A",
          modelo: u.modelo || "N/A",
          matricula: u.matricula || "N/A",
          vehiculo: u.vehiculo,
          direccion: r.direccion,
          veces: r.count,
          ultima: r.lastSeen,
          horas: r.hours.length > 0 ? `${Math.min(...r.hours)}:00 - ${Math.max(...r.hours)}:59` : "N/A"
        });
      });
    });

    applyCorporateHeader(sheet2);
    applyHairBorders(sheet2);
    sheet2.getColumn(1).alignment = { horizontal: "center" };
    sheet2.getColumn(4).alignment = { horizontal: "center" };
    sheet2.getColumn(7).alignment = { horizontal: "center" };
    sheet2.getColumn(8).alignment = { horizontal: "center" };
    sheet2.getColumn(9).alignment = { horizontal: "center" };


    // ==========================================
    // HOJA 3: CRONOLOGÍA COMPLETA
    // ==========================================
    const sheet3 = workbook.addWorksheet("Cronología");
    sheet3.columns = [
      { header: "Consecutivo", key: "consecutivo", width: 14 },
      { header: "Conductor", key: "conductor", width: 30 },
      { header: "Modelo/Tipo de Vehículo", key: "modelo", width: 35 },
      { header: "Matrícula", key: "matricula", width: 16 },
      { header: "Vehículo", key: "vehiculo", width: 25 },
      { header: "Día", key: "dia", width: 12 },
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Hora", key: "hora", width: 12 },
      { header: "Dirección", key: "direccion", width: 80 },
    ];

    report.byUnit.forEach(u => {
      u.weekendDays.forEach(wd => {
        wd.eventos.forEach(ev => {
          sheet3.addRow({
            consecutivo: u.consecutivo || "N/A",
            conductor: wd.conductor || u.conductor || "N/A",
            modelo: u.modelo || "N/A",
            matricula: u.matricula || "N/A",
            vehiculo: u.vehiculo,
            dia: wd.diaNombre.toUpperCase(),
            fecha: wd.fecha,
            hora: ev.hora,
            direccion: ev.direccion
          });
        });
      });
    });

    applyCorporateHeader(sheet3);
    applyHairBorders(sheet3);
    sheet3.getColumn(1).alignment = { horizontal: "center" };
    sheet3.getColumn(4).alignment = { horizontal: "center" };
    sheet3.getColumn(6).alignment = { horizontal: "center" };
    sheet3.getColumn(7).alignment = { horizontal: "center" };
    sheet3.getColumn(8).alignment = { horizontal: "center" };

    // Respuesta Binaria
    const buffer = await workbook.xlsx.writeBuffer();
    
    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="reporte_fin_de_semana.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });

  } catch (error) {
    console.error("API Export Error:", error);
    return NextResponse.json(
      { error: "Error al generar el archivo Excel" },
      { status: 500 }
    );
  }
}
