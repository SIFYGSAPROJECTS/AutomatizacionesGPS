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

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
};

export async function generatePptxReport(data: ReportData, filename = "Reporte_GPS_Directivo.pptx") {
  const pres = new pptxgen();

  pres.author = "SIFYGSA Analytics";
  pres.company = "SIFYGSA";
  pres.subject = "Auditoría Directiva GPS";
  pres.title = "Hallazgos Ejecutivos Telemetría GPS";
  pres.layout = "LAYOUT_16x9";

  // Master Slide Definition
  pres.defineSlideMaster({
    title: "MASTER_SLIDE",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0.1, w: "100%", h: 0.1, fill: { color: THEME.brandDarkBlue } } },
      { text: { text: "Auditoría Financiera y Operativa GPS - " + new Date().toLocaleDateString(), options: { x: 0.5, y: 5.3, w: 4, h: 0.3, fontSize: 10, color: THEME.textGray, fontFace: "Arial" } } },
      { text: { text: "Pág. ", options: { x: 8.5, y: 5.3, w: 1, h: 0.3, fontSize: 10, color: THEME.textGray, fontFace: "Arial", align: "right" } } }
    ]
  });

  // ==========================================
  // SLIDE 1: PORTADA EJECUTIVA
  // ==========================================
  const slide1 = pres.addSlide({ masterName: "MASTER_SLIDE" });
  
  slide1.addText("AUDITORÍA DE FLOTILLA", {
    x: 0.5, y: 1.5, w: 9.0, h: 0.8,
    fontSize: 20, color: THEME.brandTeal, bold: true, fontFace: "Arial", align: "center", charSpacing: 3
  });

  slide1.addText("Impacto Financiero por Deshoras", {
    x: 0.5, y: 2.2, w: 9.0, h: 1,
    fontSize: 44, color: THEME.brandDarkBlue, bold: true, fontFace: "Arial", align: "center"
  });

  slide1.addText(`Análisis de Fines de Semana: ${data.meta.period}`, {
    x: 0.5, y: 3.5, w: 9.0, h: 0.5,
    fontSize: 20, color: THEME.textGray, fontFace: "Arial", align: "center", italic: true
  });

  // ==========================================
  // SLIDE 2: IMPACTO FINANCIERO GLOBAL
  // ==========================================
  const slide2 = pres.addSlide({ masterName: "MASTER_SLIDE" });
  slide2.addText("1. Impacto Financiero y Operativo", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 32, color: THEME.brandDarkBlue, fontFace: "Arial", bold: true });
  slide2.addText("Costo acumulado del uso no autorizado de vehículos en fines de semana.", { x: 0.5, y: 1.1, w: 9.0, h: 0.4, fontSize: 14, color: THEME.textGray, fontFace: "Arial" });

  const kpiProps = { w: 2.8, h: 1.8, fill: { color: THEME.lightBg }, align: "center", valign: "middle", line: { color: THEME.brandAccent, width: 2 } };
  const valProps = { fontSize: 36, bold: true, color: THEME.brandDarkBlue, fontFace: "Arial", breakLine: true };
  const labelProps = { fontSize: 14, color: THEME.textGray, fontFace: "Arial", bold: true };

  slide2.addText([
    { text: formatMoney(data.kpis.gastoGasolinaFinde), options: { ...valProps, color: THEME.brandRed, fontSize: 44 } },
    { text: "Pérdida Estimada en Gasolina", options: labelProps }
  ], { x: 0.5, y: 2.0, ...kpiProps as any });

  slide2.addText([
    { text: `${Math.round(data.kpis.totalKmFinde).toLocaleString()} km`, options: valProps },
    { text: "Recorridos en Deshoras", options: labelProps }
  ], { x: 3.6, y: 2.0, ...kpiProps as any });

  slide2.addText([
    { text: `${data.kpis.totalAlertasFinde}`, options: valProps },
    { text: "Viajes Detectados", options: labelProps }
  ], { x: 6.7, y: 2.0, ...kpiProps as any });

  // Nota al pie del cálculo
  slide2.addText("Cálculo de gasolina basado en rendimiento estándar de 8 km/L a $24.00 MXN.", {
    x: 0.5, y: 4.2, w: 9.0, h: 0.4, fontSize: 12, color: THEME.textGray, fontFace: "Arial", italic: true
  });

  // ==========================================
  // SLIDE 3: PROYECTO VS PERSONAL
  // ==========================================
  const slide3 = pres.addSlide({ masterName: "MASTER_SLIDE" });
  slide3.addText("2. Clasificación: Proyecto vs. Uso Personal", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 32, color: THEME.brandDarkBlue, fontFace: "Arial", bold: true });
  slide3.addText("Algoritmo de Validación: Los viajes se consideran 'Proyecto' si la unidad se presenta a una Geocerca oficial durante el fin de semana o el lunes por la mañana.", { x: 0.5, y: 1.1, w: 9.0, h: 0.4, fontSize: 12, color: THEME.textGray, fontFace: "Arial" });

  const percPersonal = Math.round(data.kpis.porcentajePersonal);
  const percProject = 100 - percPersonal;

  // Barras de comparación
  slide3.addShape(pres.ShapeType.rect, { x: 1.0, y: 2.0, w: 8.0, h: 1.0, fill: { color: "EAEAEA" } }); // Fondo
  slide3.addShape(pres.ShapeType.rect, { x: 1.0, y: 2.0, w: (percProject / 100) * 8.0, h: 1.0, fill: { color: THEME.brandTeal } }); // Proyecto
  slide3.addShape(pres.ShapeType.rect, { x: 1.0 + ((percProject / 100) * 8.0), y: 2.0, w: (percPersonal / 100) * 8.0, h: 1.0, fill: { color: THEME.brandRed } }); // Personal

  slide3.addText(`${percProject}% Uso de Proyecto`, { x: 1.0, y: 3.2, w: 4.0, h: 0.5, fontSize: 18, color: THEME.brandTeal, fontFace: "Arial", bold: true });
  slide3.addText(`${percPersonal}% Uso Personal No Autorizado`, { x: 5.0, y: 3.2, w: 4.0, h: 0.5, fontSize: 18, color: THEME.brandRed, fontFace: "Arial", bold: true, align: "right" });

  // Explicación
  slide3.addText(`De los ${Math.round(data.kpis.totalKmFinde).toLocaleString()} km acumulados en fin de semana, el ${percPersonal}% representan viajes que NO tuvieron relación con un proyecto, ya que la unidad no se reportó a ninguna geocerca en ese mismo período ni al inicio de semana.`, {
    x: 1.0, y: 3.8, w: 8.0, h: 1.0, fontSize: 16, color: THEME.brandDarkBlue, fontFace: "Arial", align: "center"
  });

  // ==========================================
  // SLIDE 4: TOP 5 CONDUCTORES (Total KM)
  // ==========================================
  if (data.top5KmDrivers.length > 0) {
    const slide4 = pres.addSlide({ masterName: "MASTER_SLIDE" });
    slide4.addText("3. Top 5 Conductores: Mayor Kilometraje de Fin de Semana", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 26, color: THEME.brandDarkBlue, fontFace: "Arial", bold: true });
    
    const tableRows4: any[] = [
      [
        { text: "Conductor / Vehículo", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Arial" } },
        { text: "Días Usados", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Arial", align: "center" } },
        { text: "Km Finde", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Arial", align: "center" } },
        { text: "Gasto Estimado", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Arial", align: "center" } },
        { text: "Ruta Principal (A -> B)", options: { bold: true, fill: THEME.brandDarkBlue, color: "FFFFFF", fontFace: "Arial" } }
      ]
    ];

    data.top5KmDrivers.forEach(d => {
      const mainRoute = d.rutas.length > 0 ? `${d.rutas[0].origen.substring(0,25)}... -> ${d.rutas[0].destino.substring(0,25)}...` : "Sin detalles de ruta";
      
      tableRows4.push([
        { text: `${d.conductor}\n(${d.vehiculo})`, options: { fontFace: "Arial" } },
        { text: `${d.diasUsoFinde.size}`, options: { fontFace: "Arial", align: "center" } },
        { text: `${Math.round(d.totalKmFinde)} km`, options: { fontFace: "Arial", align: "center", bold: true, color: THEME.brandRed } },
        { text: formatMoney(d.gastoGasolina), options: { fontFace: "Arial", align: "center", bold: true } },
        { text: mainRoute, options: { fontFace: "Arial", fontSize: 10 } }
      ]);
    });

    slide4.addTable(tableRows4, {
      x: 0.5, y: 1.5, w: 9.0,
      rowH: 0.5,
      colW: [2.0, 1.0, 1.2, 1.5, 3.3],
      border: { type: "solid", color: THEME.textGray, pt: 1 },
      fontSize: 12,
      fontFace: "Arial",
      valign: "middle"
    });
  }

  // ==========================================
  // SLIDE 5: ALERTA ROJA (Abuso Puro)
  // ==========================================
  if (data.topPersonalAbusers.length > 0) {
    const slide5 = pres.addSlide({ masterName: "MASTER_SLIDE" });
    slide5.addText("4. ALERTA ROJA: Abuso de Uso Personal", { x: 0.5, y: 0.5, w: 9.0, h: 0.8, fontSize: 32, color: THEME.brandRed, fontFace: "Arial", bold: true });
    slide5.addText("Estos conductores extrajeron la unidad en fin de semana, generaron gastos, y NUNCA se presentaron a una Geocerca el día posterior.", { x: 0.5, y: 1.1, w: 9.0, h: 0.4, fontSize: 14, color: THEME.textGray, fontFace: "Arial", bold: true });

    const tableRows5: any[] = [
      [
        { text: "Conductor / Vehículo", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Arial" } },
        { text: "Km Gastados", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Arial", align: "center" } },
        { text: "Pérdida $$", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Arial", align: "center" } },
        { text: "Ruta Documentada (Prueba)", options: { bold: true, fill: THEME.brandRed, color: "FFFFFF", fontFace: "Arial" } }
      ]
    ];

    data.topPersonalAbusers.forEach(d => {
      const mainRoute = d.rutas.length > 0 ? `De: ${d.rutas[0].origen.substring(0,30)}...\nA: ${d.rutas[0].destino.substring(0,30)}...` : "Sin detalles de ruta";
      
      tableRows5.push([
        { text: `${d.conductor}\n(${d.vehiculo})`, options: { fontFace: "Arial" } },
        { text: `${Math.round(d.totalKmFinde)} km`, options: { fontFace: "Arial", align: "center", bold: true } },
        { text: formatMoney(d.gastoGasolina), options: { fontFace: "Arial", align: "center", bold: true, color: THEME.brandRed } },
        { text: mainRoute, options: { fontFace: "Arial", fontSize: 10 } }
      ]);
    });

    slide5.addTable(tableRows5, {
      x: 0.5, y: 1.8, w: 9.0,
      rowH: 0.6,
      colW: [2.0, 1.2, 1.5, 4.3],
      border: { type: "solid", color: THEME.brandRed, pt: 1 },
      fontSize: 12,
      fontFace: "Arial",
      valign: "middle"
    });
  }

  // Download
  pres.writeFile({ fileName: filename });
}
