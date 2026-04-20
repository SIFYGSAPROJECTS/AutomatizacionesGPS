import pptxgen from "pptxgenjs";
import { WeekendUsageReport } from "./weekendAnalyzer";

export async function generateWeekendPptxReport(
  filteredProfiles: WeekendUsageReport["byUnit"], 
  dateFrom: string, 
  dateTo: string, 
  fileName: string
) {
  const pres = new pptxgen();

  // Configuración base de 16:9
  pres.layout = "LAYOUT_16x9"; // 10 x 5.625 pulgadas

  // Extraemos el top 10
  const top10 = [...filteredProfiles].sort((a, b) => b.totalEvents - a.totalEvents).slice(0, 10);

  // ==========================================
  // SLIDE 1: PORTADA
  // ==========================================
  const slide1 = pres.addSlide();
  
  // Banda decorativa superior
  slide1.addShape(pres.ShapeType.rect, {
    x: 0, y: 0.2, w: 10, h: 0.1, fill: { color: "C00000" }
  });

  slide1.addText("Hallazgos – Uso en Fines de Semana", {
    x: 1, y: 2.0, w: 8, h: 1,
    fontSize: 40, bold: true, color: "19426B", fontFace: "Verdana", align: "center"
  });

  const periodStr = (dateFrom && dateTo) ? `${dateFrom} al ${dateTo}` : "Histórico completo";
  slide1.addText(`Período Evaluado: ${periodStr}`, {
    x: 1, y: 3.2, w: 8, h: 0.5,
    fontSize: 20, color: "595959", fontFace: "Verdana", align: "center"
  });

  slide1.addText(`Top 10 Usuarios de Mayor Riesgo`, {
    x: 1, y: 3.8, w: 8, h: 0.5,
    fontSize: 16, color: "C00000", fontFace: "Verdana", align: "center", bold: true
  });

  // Footer
  slide1.addText(`Reporte generado por AnalyticsGPS - ${new Date().toLocaleDateString()}`, {
    x: 0.5, y: 5.2, w: 5, h: 0.3,
    fontSize: 9, color: "595959"
  });
  slide1.addText("Pág. 1", {
    x: 8.5, y: 5.2, w: 1, h: 0.3,
    fontSize: 9, color: "595959", align: "right"
  });

  // ==========================================
  // SLIDES: TOP 10 USUARIOS (Paginados de 5 en 5)
  // ==========================================
  const chunks = [];
  for (let i = 0; i < top10.length; i += 5) {
    chunks.push(top10.slice(i, i + 5));
  }

  let pageNum = 2;

  if (chunks.length > 0) {
    chunks.forEach((chunk, chunkIndex) => {
      const slide = pres.addSlide();
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 0.2, w: 10, h: 0.1, fill: { color: "C00000" }
      });

      slide.addText(`Top 10: Usuarios Fines de Semana (${chunkIndex * 5 + 1} - ${chunkIndex * 5 + chunk.length})`, {
        x: 0.5, y: 0.5, w: 9, h: 0.6,
        fontSize: 24, bold: true, color: "19426B", fontFace: "Verdana"
      });

      const tableRows: any[] = [
        [
          { text: "Posición", options: { bold: true, fill: "19426B", color: "FFFFFF", align: "center" as any } },
          { text: "Vehículo / Matrícula", options: { bold: true, fill: "19426B", color: "FFFFFF" } },
          { text: "Conductor", options: { bold: true, fill: "19426B", color: "FFFFFF" } },
          { text: "Eventos Fin de Semana", options: { bold: true, fill: "C00000", color: "FFFFFF", align: "center" as any } },
          { text: "Ubicación Principal", options: { bold: true, fill: "19426B", color: "FFFFFF" } }
        ]
      ];

      chunk.forEach((u, i) => {
        tableRows.push([
          { text: `#${chunkIndex * 5 + i + 1}`, options: { align: "center" as any, bold: true } },
          { text: `${u.vehiculo} \n${u.matricula}`, options: { fontSize: 10 } },
          { text: u.conductor, options: { fontSize: 10 } },
          { text: u.totalEvents.toString(), options: { align: "center" as any, bold: true, color: "C00000" } },
          { text: u.topRoutes[0]?.direccion || "N/A", options: { fontSize: 9 } }
        ]);
      });

      slide.addTable(tableRows, {
        x: 0.5, y: 1.3, w: 9, 
        border: { pt: 1, color: "BFBFBF" },
        fill: { color: "FFFFFF" },
        fontSize: 10,
        valign: "middle"
      });

      // Footer
      slide.addText(`Reporte generado por AnalyticsGPS - ${new Date().toLocaleDateString()}`, {
        x: 0.5, y: 5.2, w: 5, h: 0.3,
        fontSize: 9, color: "595959"
      });
      slide.addText(`Pág. ${pageNum}`, {
        x: 8.5, y: 5.2, w: 1, h: 0.3,
        fontSize: 9, color: "595959", align: "right"
      });
      pageNum++;
    });
  } else {
    const slide = pres.addSlide();
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0.2, w: 10, h: 0.1, fill: { color: "C00000" } });
    slide.addText("Top 10: Usuarios Fines de Semana", { x: 0.5, y: 0.5, w: 9, h: 0.6, fontSize: 24, bold: true, color: "19426B", fontFace: "Verdana" });
    slide.addText("No hay datos para el período seleccionado.", { x: 1, y: 2.5, w: 8, h: 1, fontSize: 18, color: "595959", align: "center" });
    slide.addText(`Reporte generado por AnalyticsGPS - ${new Date().toLocaleDateString()}`, { x: 0.5, y: 5.2, w: 5, h: 0.3, fontSize: 9, color: "595959" });
    slide.addText(`Pág. ${pageNum}`, { x: 8.5, y: 5.2, w: 1, h: 0.3, fontSize: 9, color: "595959", align: "right" });
    pageNum++;
  }

  // ==========================================
  // SLIDES ADICIONALES: DETALLE DE LOS TOP 3 (Opcional, pero muy útil)
  // ==========================================
  const top3 = top10.slice(0, 3);
  let page = pageNum;
  
  for (const u of top3) {
    const slide = pres.addSlide();
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0.2, w: 10, h: 0.1, fill: { color: "C00000" } });
    
    slide.addText(`Detalle de Riesgo: ${u.vehiculo} (${u.conductor})`, {
      x: 0.5, y: 0.5, w: 9, h: 0.6,
      fontSize: 24, bold: true, color: "19426B", fontFace: "Verdana"
    });

    slide.addText(`Total Alertas: ${u.totalEvents} eventos registrados.`, {
      x: 0.5, y: 1.2, w: 9, h: 0.3,
      fontSize: 12, color: "C00000", fontFace: "Verdana", bold: true
    });

    const detailRows: any[] = [
      [
        { text: "Día", options: { bold: true, fill: "19426B", color: "FFFFFF" } },
        { text: "Hora", options: { bold: true, fill: "19426B", color: "FFFFFF" } },
        { text: "Dirección Visitada", options: { bold: true, fill: "19426B", color: "FFFFFF" } }
      ]
    ];

    // Extraemos hasta 12 eventos de sus weekendDays
    let evts = [];
    for (const wd of u.weekendDays) {
      for (const ev of wd.eventos) {
        evts.push({ dia: wd.fecha, hora: ev.hora, dir: ev.direccion });
      }
    }
    
    evts.slice(0, 10).forEach(ev => {
      detailRows.push([
        { text: ev.dia, options: { fontSize: 10 } },
        { text: ev.hora, options: { fontSize: 10, align: "center" as any } },
        { text: ev.dir, options: { fontSize: 9 } }
      ]);
    });

    if (evts.length > 0) {
      slide.addTable(detailRows, {
        x: 0.5, y: 1.7, w: 9, 
        border: { pt: 1, color: "BFBFBF" },
        valign: "middle"
      });
    }

    slide.addText(`Reporte generado por AnalyticsGPS - ${new Date().toLocaleDateString()}`, { x: 0.5, y: 5.2, w: 5, h: 0.3, fontSize: 9, color: "595959" });
    slide.addText(`Pág. ${page++}`, { x: 8.5, y: 5.2, w: 1, h: 0.3, fontSize: 9, color: "595959", align: "right" });
  }

  // Descargar archivo
  return pres.writeFile({ fileName });
}
