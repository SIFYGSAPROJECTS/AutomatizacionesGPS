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
    sheet1.mergeCells('A1:G3');
    const titleCell = sheet1.getCell('A1');
    titleCell.value = "REPORTE EJECUTIVO DE USO DE VEHÍCULOS EN FIN DE SEMANA";
    titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Cabeceras en Fila 4
    sheet1.getRow(4).values = [
      "Matrícula",
      "Vehículo",
      "Conductor Principal",
      "Total Alertas",
      "Alertas Domingo",
      "Alertas Sábado",
      "Foco Principal de Abuso (Top Ubicación)"
    ];

    sheet1.columns = [
      { key: "matricula", width: 16 },
      { key: "vehiculo", width: 35 },
      { key: "conductor", width: 30 },
      { key: "total", width: 18 },
      { key: "domingo", width: 18 },
      { key: "sabado", width: 18 },
      { key: "topRoute", width: 60 },
    ];

    let rowPointer = 5;
    report.byUnit.forEach(u => {
      const mainRoute = u.topRoutes.length > 0 ? u.topRoutes[0].direccion : "N/A";
      
      const r = sheet1.getRow(rowPointer);
      r.values = [
        u.matricula || "N/A",
        u.vehiculo,
        u.conductor || "N/A",
        u.totalEvents,
        u.sundayEvents,
        u.saturdayEvents,
        mainRoute
      ];
      r.height = 20;
      
      r.eachCell(cell => {
         cell.alignment = { vertical: 'middle' };
         cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
      // Center stats
      r.getCell(4).alignment = { horizontal: "center", vertical: 'middle' };
      r.getCell(5).alignment = { horizontal: "center", vertical: 'middle' };
      r.getCell(6).alignment = { horizontal: "center", vertical: 'middle' };

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
        ref: `D5:D${totalRowFinal}`,
        rules: [
          {
            type: 'dataBar',
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: { argb: 'FF3B82F6' }, // Blue-500
          }
        ]
      });
    }


    // ==========================================
    // HOJA 2: RUTAS FRECUENTES
    // ==========================================
    const sheet2 = workbook.addWorksheet("Rutas Frecuentes");
    sheet2.columns = [
      { header: "Unidad", key: "unidad", width: 20 },
      { header: "Dirección Restringida", key: "direccion", width: 80 },
      { header: "Veces Vista", key: "veces", width: 15 },
      { header: "Última Fecha", key: "ultima", width: 15 },
      { header: "Rango de Horas", key: "horas", width: 25 },
    ];

    report.byUnit.forEach(u => {
      u.topRoutes.forEach(r => {
        sheet2.addRow({
          unidad: u.matricula || u.vehiculo,
          direccion: r.direccion,
          veces: r.count,
          ultima: r.lastSeen,
          horas: `${Math.min(...r.hours)}:00 - ${Math.max(...r.hours)}:59`
        });
      });
    });

    applyCorporateHeader(sheet2);
    applyHairBorders(sheet2);
    sheet2.getColumn(3).alignment = { horizontal: "center" };


    // ==========================================
    // HOJA 3: CRONOLOGÍA COMPLETA
    // ==========================================
    const sheet3 = workbook.addWorksheet("Cronología");
    sheet3.columns = [
      { header: "Unidad", key: "unidad", width: 20 },
      { header: "Conductor", key: "conductor", width: 30 },
      { header: "Día", key: "dia", width: 12 },
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Hora", key: "hora", width: 12 },
      { header: "Dirección", key: "direccion", width: 80 },
    ];

    report.byUnit.forEach(u => {
      u.weekendDays.forEach(wd => {
        wd.eventos.forEach(ev => {
          sheet3.addRow({
            unidad: u.matricula || u.vehiculo,
            conductor: wd.conductor || "N/A",
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
    sheet3.getColumn(3).alignment = { horizontal: "center" };
    sheet3.getColumn(4).alignment = { horizontal: "center" };
    sheet3.getColumn(5).alignment = { horizontal: "center" };

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
