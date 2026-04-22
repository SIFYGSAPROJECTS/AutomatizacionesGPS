import ExcelJS from "exceljs";
import { ReportData } from "./reportDataEngine";
import { saveAs } from "file-saver";

const COLORS = {
  headerBg: "19426B",
  headerText: "FFFFFF",
  alternateRowBg: "F3F6F9",
  border: "CCCCCC"
};

export async function generateExcelReport(data: ReportData, filename = "Reporte_GPS_Detallado.xlsx") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIFYGSA Analytics";
  workbook.created = new Date();

  // Helper to format headers
  const formatHeader = (sheet: ExcelJS.Worksheet, rowNum: number) => {
    const row = sheet.getRow(rowNum);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.headerBg }
      };
      cell.font = { color: { argb: COLORS.headerText }, bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.border } },
        bottom: { style: "thin", color: { argb: COLORS.border } },
        left: { style: "thin", color: { argb: COLORS.border } },
        right: { style: "thin", color: { argb: COLORS.border } }
      };
    });
  };

  // ==========================================
  // HOJA 1: RESUMEN EJECUTIVO
  // ==========================================
  const sheetResumen = workbook.addWorksheet("Resumen Ejecutivo");
  sheetResumen.columns = [
    { header: "Indicador", key: "indicador", width: 40 },
    { header: "Valor", key: "valor", width: 25 }
  ];

  sheetResumen.addRow({ indicador: "Período Evaluado", valor: data.meta.period });
  sheetResumen.addRow({ indicador: "Total Registros Filtrados", valor: data.kpis.totalRegistrosFiltrados });
  sheetResumen.addRow({ indicador: "Total Vehículos Involucrados", valor: data.kpis.totalVehiculos });
  sheetResumen.addRow({ indicador: "Alertas de Fin de Semana", valor: data.kpis.totalAlertasFinde });
  sheetResumen.addRow({ indicador: "Horas Acumuladas Fin de Semana", valor: `${(data.kpis as any).horasAcumuladasFinde || 0} h` });
  sheetResumen.addRow({ indicador: "Paradas Sospechosas", valor: data.kpis.totalParadasSospechosas });
  sheetResumen.addRow({ indicador: "Fecha de Generación", valor: new Date(data.meta.generatedAt).toLocaleString() });

  formatHeader(sheetResumen, 1);
  sheetResumen.getColumn(2).alignment = { horizontal: "right" };

  // ==========================================
  // HOJA 2: FINES DE SEMANA (si aplica)
  // ==========================================
  if (data.weekendAlerts.length > 0) {
    const sheetFinde = workbook.addWorksheet("Fines de Semana");
    sheetFinde.columns = [
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Día", key: "dia", width: 12 },
      { header: "Matrícula", key: "matricula", width: 15 },
      { header: "Vehículo", key: "vehiculo", width: 30 },
      { header: "Conductor", key: "conductor", width: 30 },
      { header: "Hora Inicial", key: "hora", width: 20 },
      { header: "Tiempo Aparcado (h)", key: "tiempo", width: 20 },
      { header: "Dirección", key: "direccion", width: 50 },
      { header: "Geocerca", key: "geocerca", width: 25 }
    ];

    data.weekendAlerts.forEach((row, i) => {
      const excelRow = sheetFinde.addRow({
        fecha: row.fecha,
        dia: row.diaSemana,
        matricula: row.matricula,
        vehiculo: row.vehiculo,
        conductor: row.conductor,
        hora: row.horaInicial,
        tiempo: Math.round(row.tiempoAparcadoSecs / 3600 * 10) / 10,
        direccion: row.direccion,
        geocerca: row.geocerca
      });
      if (i % 2 === 1) {
        excelRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.alternateRowBg } };
        });
      }
    });

    formatHeader(sheetFinde, 1);
    sheetFinde.autoFilter = "A1:I1";
    sheetFinde.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  }

  // ==========================================
  // HOJA 3: UBICACIONES / PARADAS (si aplica)
  // ==========================================
  if (data.stopSummaries.length > 0) {
    const sheetParadas = workbook.addWorksheet("Paradas y Ubicaciones");
    sheetParadas.columns = [
      { header: "Dirección", key: "direccion", width: 50 },
      { header: "Geocerca", key: "geocerca", width: 25 },
      { header: "Latitud", key: "lat", width: 15 },
      { header: "Longitud", key: "lng", width: 15 },
      { header: "Total Visitas", key: "visitas", width: 15 },
      { header: "Vehículos Únicos", key: "vehiculos", width: 18 },
      { header: "Visitas Nocturnas", key: "nocturnas", width: 18 },
      { header: "Visitas Finde", key: "finde", width: 15 },
      { header: "Promedio Aparcado (h)", key: "tiempo", width: 22 },
      { header: "Score Sospecha", key: "score", width: 18 }
    ];

    data.stopSummaries.forEach((row, i) => {
      const excelRow = sheetParadas.addRow({
        direccion: row.direccion,
        geocerca: row.geocerca,
        lat: row.lat,
        lng: row.lng,
        visitas: row.totalVisitas,
        vehiculos: row.vehiculosUnicos,
        nocturnas: row.visitasNocturnas,
        finde: row.visitasFinDeSemana,
        tiempo: Math.round(row.promedioAparcadoSecs / 3600 * 10) / 10,
        score: row.suspicionScore
      });
      
      // Resaltar score alto
      if (row.suspicionScore >= 70) {
        excelRow.getCell("score").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCCC" } };
        excelRow.getCell("score").font = { color: { argb: "990000" }, bold: true };
      }
    });

    formatHeader(sheetParadas, 1);
    sheetParadas.autoFilter = "A1:J1";
    sheetParadas.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  }

  // ==========================================
  // HOJA 4: RESUMEN POR VEHÍCULO (si aplica)
  // ==========================================
  if (data.vehicleSummaries.length > 0) {
    const sheetVehiculos = workbook.addWorksheet("Resumen por Vehículo");
    sheetVehiculos.columns = [
      { header: "Matrícula", key: "matricula", width: 15 },
      { header: "Vehículo", key: "vehiculo", width: 30 },
      { header: "Conductor", key: "conductor", width: 30 },
      { header: "Total Eventos", key: "eventos", width: 15 },
      { header: "Eventos Sábado", key: "sabado", width: 18 },
      { header: "Eventos Domingo", key: "domingo", width: 18 },
      { header: "Ubicaciones Visitadas", key: "ubicaciones", width: 22 },
      { header: "Horas Acumuladas", key: "horas", width: 18 },
      { header: "Top Ubicación", key: "toploc", width: 50 }
    ];

    data.vehicleSummaries.forEach((row, i) => {
      const excelRow = sheetVehiculos.addRow({
        matricula: row.matricula,
        vehiculo: row.vehiculo,
        conductor: row.conductor,
        eventos: row.totalEventos,
        sabado: row.eventosSabado,
        domingo: row.eventosDomingo,
        ubicaciones: row.ubicacionesVisitadas,
        horas: row.horasAcumuladas,
        toploc: row.topUbicacion
      });
      if (i % 2 === 1) {
        excelRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.alternateRowBg } };
        });
      }
    });

    formatHeader(sheetVehiculos, 1);
    sheetVehiculos.autoFilter = "A1:I1";
    sheetVehiculos.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  }

  // Generar y descargar
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), filename);
}
