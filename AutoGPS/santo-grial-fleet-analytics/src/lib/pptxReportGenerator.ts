import pptxgen from "pptxgenjs";
import { ReportData } from "./reportDataEngine";

const THEME = {
  brandRed: "C00000",
  brandDarkBlue: "19426B",
  brandTeal: "008080",
  brandAccent: "35C9C2",
  textGray: "595959",
  lightBg: "F3F6F9"
};

export async function generatePptxReport(data: ReportData, filename = "Reporte_GPS_Ejecutivo.pptx") {
  const pres = new pptxgen();

  pres.author = "SIFYGSA Analytics";
  pres.company = "SIFYGSA";
  pres.subject = "Reporte GPS Ejecutivo";
  pres.title = "Hallazgos Telemetría GPS";
  pres.layout = "LAYOUT_16x9";

  // Master Slide Definition
  pres.defineSlideMaster({
    title: "MASTER_SLIDE",
    background: { color: "FFFFFF" },
    objects: [
      // Top Red Bar
      { rect: { x: 0, y: 0.1, w: "100%", h: 0.1, fill: { color: THEME.brandRed } } },
      // Footer text
      { text: { text: "Reporte generado por AnalyticsGPS - " + new Date().toLocaleDateString(), options: { x: 0.5, y: 5.3, w: 4, h: 0.3, fontSize: 10, color: THEME.textGray, fontFace: "Verdana" } } },
      // Page number
      { text: { text: "Pág. ", options: { x: 8.5, y: 5.3, w: 1, h: 0.3, fontSize: 10, color: THEME.textGray, fontFace: "Verdana", align: "right" } } }
    ]
  });

  // ==========================================
  // SLIDE 1: PORTADA
  // ==========================================
  const slide1 = pres.addSlide({ masterName: "MASTER_SLIDE" });
  
  // Título principal
  slide1.addText("Hallazgos – Telemetría GPS", {
    x: 0.5, y: 2.0, w: 9.0, h: 1,
    fontSize: 44, color: THEME.brandDarkBlue, bold: true, fontFace: "Verdana", align: "center"
  });

  // Subtítulo (Período)
  slide1.addText(`Período Evaluado: ${data.meta.period}`, {
    x: 0.5, y: 3.2, w: 9.0, h: 0.5,
    fontSize: 24, color: THEME.textGray, fontFace: "Verdana", align: "center"
  });

  // Resumen de módulos
  slide1.addText(`Módulos Incluidos: ${data.meta.sections.join(", ")}`, {
    x: 0.5, y: 3.9, w: 9.0, h: 0.5,
    fontSize: 18, color: THEME.brandTeal, fontFace: "Verdana", align: "center"
  });

  // ==========================================
  // SLIDE 2: KPIs EJECUTIVOS
  // ==========================================
  const slide2 = pres.addSlide({ masterName: "MASTER_SLIDE" });
  slide2.addText("Resumen Ejecutivo", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 32, color: THEME.brandDarkBlue, fontFace: "Verdana", bold: true });

  const kpiProps = { w: 2.8, h: 1.5, fill: { color: THEME.lightBg }, align: "center", valign: "middle", line: { color: THEME.brandAccent, width: 2 } };
  const valProps = { fontSize: 36, bold: true, color: THEME.brandDarkBlue, fontFace: "Verdana", breakLine: true };
  const labelProps = { fontSize: 14, color: THEME.textGray, fontFace: "Verdana" };

  // KPI 1: Vehículos Involucrados
  slide2.addText([
    { text: String(data.kpis.totalVehiculos), options: valProps },
    { text: "Vehículos Filtrados", options: labelProps }
  ], { x: 0.5, y: 1.8, ...kpiProps as any });

  // KPI 2: Alertas de Finde
  if (data.meta.sections.includes("Fines de Semana")) {
    slide2.addText([
      { text: String(data.kpis.totalAlertasFinde), options: valProps },
      { text: "Alertas Fin de Semana", options: labelProps }
    ], { x: 3.6, y: 1.8, ...kpiProps as any });

    slide2.addText([
      { text: `${data.kpis.horasAcumuladasFinde} h`, options: valProps },
      { text: "Horas Acumuladas Finde", options: labelProps }
    ], { x: 6.7, y: 1.8, ...kpiProps as any });
  }

  // KPI 3: Paradas
  if (data.meta.sections.includes("Ubicaciones")) {
    slide2.addText([
      { text: String(data.kpis.totalParadasSospechosas), options: { ...valProps, color: THEME.brandRed } },
      { text: "Paradas Sospechosas (Score >=40)", options: labelProps }
    ], { x: 0.5, y: 3.6, ...kpiProps as any });
  }

  // ==========================================
  // SLIDE 3: VEHÍCULOS DE ALTO RIESGO (TOP 3 INDIVIDUAL)
  // ==========================================
  if (data.vehicleSummaries.length > 0) {
    const top3 = data.vehicleSummaries.slice(0, 3);
    
    top3.forEach((v, idx) => {
      const slideV = pres.addSlide({ masterName: "MASTER_SLIDE" });
      slideV.addText(`Vehículo de Riesgo #${idx + 1}: ${v.vehiculo}`, { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 28, color: THEME.brandDarkBlue, fontFace: "Verdana", bold: true });
      
      // Info conductor y eventos
      slideV.addText(`Matrícula: ${v.matricula}  |  Conductor: ${v.conductor}`, { x: 0.5, y: 1.2, w: 9.0, h: 0.4, fontSize: 16, color: THEME.textGray, fontFace: "Verdana", bold: true });
      slideV.addText(`Eventos en Fines de Semana: ${v.totalEventos}  |  Horas acumuladas: ${v.horasAcumuladas}h`, { x: 0.5, y: 1.6, w: 9.0, h: 0.4, fontSize: 14, color: THEME.brandRed, fontFace: "Verdana", bold: true });

      if (v.top5WeekendLocations && v.top5WeekendLocations.length > 0) {
        slideV.addText("Top 5 Ubicaciones en Deshoras", { x: 0.5, y: 2.2, w: 9.0, h: 0.4, fontSize: 18, color: THEME.brandTeal, fontFace: "Verdana", bold: true });
        
        const locRows: any[] = [
          [
            { text: "Fecha/Hora", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
            { text: "Dirección", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
            { text: "Tiempo", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } }
          ]
        ];

        v.top5WeekendLocations.forEach(loc => {
          locRows.push([
            { text: loc.fechaHora, options: { fontFace: "Verdana" } },
            { text: loc.direccion, options: { fontFace: "Verdana" } },
            { text: `${Math.round(loc.tiempoSecs / 60)} min`, options: { fontFace: "Verdana", align: "center" } }
          ]);
        });

        slideV.addTable(locRows, {
          x: 0.5, y: 2.7, w: 9.0,
          rowH: 0.4,
          colW: [2.0, 5.5, 1.5],
          border: { type: "solid", color: THEME.textGray, pt: 1 },
          fontSize: 12,
          fontFace: "Verdana",
          valign: "middle"
        });
      }
    });

    // ==========================================
    // SLIDE 4: RESUMEN VEHÍCULOS 4 AL 8
    // ==========================================
    const next5 = data.vehicleSummaries.slice(3, 8);
    if (next5.length > 0) {
      const slideResumen = pres.addSlide({ masterName: "MASTER_SLIDE" });
      slideResumen.addText("Otros Vehículos con Actividad Anómala (Pos. 4 al 8)", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 24, color: THEME.brandDarkBlue, fontFace: "Verdana", bold: true });

      const tableRows: any[] = [
        [
          { text: "Vehículo", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
          { text: "Conductor", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
          { text: "Eventos", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
          { text: "Top Ubicación", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } }
        ]
      ];

      next5.forEach(v => {
        tableRows.push([
          { text: v.vehiculo, options: { fontFace: "Verdana" } },
          { text: v.conductor, options: { fontFace: "Verdana" } },
          { text: String(v.totalEventos), options: { fontFace: "Verdana", align: "center" } },
          { text: v.topUbicacion || "N/A", options: { fontFace: "Verdana" } }
        ]);
      });

      slideResumen.addTable(tableRows, {
        x: 0.5, y: 1.5, w: 9.0,
        rowH: 0.4,
        colW: [2.0, 2.5, 1.0, 3.5],
        border: { type: "solid", color: THEME.textGray, pt: 1 },
        fontSize: 12,
        fontFace: "Verdana",
        valign: "middle"
      });
    }
  }

  // ==========================================
  // SLIDE 5: TOP UBICACIONES (si aplica)
  // ==========================================
  if (data.stopSummaries.length > 0) {
    const slideLoc = pres.addSlide({ masterName: "MASTER_SLIDE" });
    slideLoc.addText("Top 5 Ubicaciones de Riesgo", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 32, color: THEME.brandDarkBlue, fontFace: "Verdana", bold: true });

    const top5 = data.stopSummaries.slice(0, 5);
    const tableRows: any[] = [
      [
        { text: "Ubicación", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
        { text: "Visitas", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
        { text: "Vehículos", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
        { text: "Horas Prom.", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } },
        { text: "Score", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Verdana" } }
      ]
    ];

    top5.forEach(v => {
      const isHighRisk = v.suspicionScore >= 70;
      tableRows.push([
        { text: v.direccion, options: { fontFace: "Verdana" } },
        { text: String(v.totalVisitas), options: { fontFace: "Verdana", align: "center" } },
        { text: String(v.vehiculosUnicos), options: { fontFace: "Verdana", align: "center" } },
        { text: String(Math.round(v.promedioAparcadoSecs / 3600 * 10) / 10), options: { fontFace: "Verdana", align: "center" } },
        { text: String(v.suspicionScore), options: { fontFace: "Verdana", align: "center", bold: isHighRisk, color: isHighRisk ? THEME.brandRed : THEME.textGray } }
      ]);
    });

    slideLoc.addTable(tableRows, {
      x: 0.5, y: 1.5, w: 9.0,
      rowH: 0.4,
      colW: [4.0, 1.0, 1.0, 1.5, 1.5],
      border: { type: "solid", color: THEME.textGray, pt: 1 },
      fontSize: 12,
      fontFace: "Verdana",
      valign: "middle"
    });
  }

  // ==========================================
  // SLIDE 6: ESCÁNER DE AUDITORÍA
  // ==========================================
  if (data.scannerEvents && data.scannerEvents.length > 0) {
    // Si hay más de 8 eventos, crear varios slides
    const chunkSize = 8;
    for (let i = 0; i < data.scannerEvents.length; i += chunkSize) {
      const slideScan = pres.addSlide({ masterName: "MASTER_SLIDE" });
      const chunk = data.scannerEvents.slice(i, i + chunkSize);
      
      slideScan.addText("Resultados del Escáner", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 32, color: THEME.brandRed, fontFace: "Verdana", bold: true });
      slideScan.addText(`Página ${Math.floor(i/chunkSize) + 1}`, { x: 0.5, y: 1.1, w: 9.0, h: 0.3, fontSize: 14, color: THEME.textGray, fontFace: "Verdana" });

      const tableRows: any[] = [
        [
          { text: "Vehículo", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Verdana" } },
          { text: "Conductor", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Verdana" } },
          { text: "Fecha/Hora", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Verdana" } },
          { text: "Dirección", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Verdana" } },
          { text: "Tiempo", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Verdana" } }
        ]
      ];

      chunk.forEach(ev => {
        tableRows.push([
          { text: ev.vehiculo, options: { fontFace: "Verdana" } },
          { text: ev.conductor, options: { fontFace: "Verdana" } },
          { text: ev.fechaHora, options: { fontFace: "Verdana" } },
          { text: ev.direccion, options: { fontFace: "Verdana" } },
          { text: `${Math.round(ev.tiempoSecs / 60)} min`, options: { fontFace: "Verdana", align: "center" } }
        ]);
      });

      slideScan.addTable(tableRows, {
        x: 0.5, y: 1.5, w: 9.0,
        rowH: 0.4,
        colW: [1.5, 2.0, 1.5, 3.0, 1.0],
        border: { type: "solid", color: THEME.textGray, pt: 1 },
        fontSize: 10,
        fontFace: "Verdana",
        valign: "middle"
      });
    }
  }

  // Download
  pres.writeFile({ fileName: filename });
}
