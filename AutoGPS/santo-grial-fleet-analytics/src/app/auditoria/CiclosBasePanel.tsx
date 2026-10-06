"use client";

import { useState, useMemo } from "react";
import { 
  FileText, 
  UploadCloud, 
  MapPin, 
  ExternalLink, 
  Navigation, 
  Clock, 
  Download, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Route,
  Building2,
  Calendar
} from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  BorderStyle, 
  HeadingLevel, 
  ExternalHyperlink,
  AlignmentType
} from "docx";
import { useFleetStore } from "@/store/useFleetStore";

interface ParsedEvent {
  datetime: Date;
  datetimeStr: string;
  lugar: string;
  distancia_km: number;
}

interface RouteCycle {
  salida: string;
  regreso: string;
  km: number;
}

interface DestinationCount {
  lugar: string;
  count: number;
  mapsUrl: string;
}

interface InactiveStop {
  datetimeStr: string;
  horasInactivo: number;
  lugar: string;
  mapsUrl: string;
}

export function CiclosBasePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [unidadNombre, setUnidadNombre] = useState("AVH-033");
  const [mesReporte, setMesReporte] = useState("Agosto 2026");
  const [baseOperativa, setBaseOperativa] = useState("Oficina Comalcalco");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"rutas" | "destinos" | "paradas" | "python">("rutas");

  // Resultados del ETL
  const [parsedEvents, setParsedEvents] = useState<ParsedEvent[]>([]);
  const [totalKm, setTotalKm] = useState<number>(0);
  const [routes, setRoutes] = useState<RouteCycle[]>([]);
  const [topDestinations, setTopDestinations] = useState<DestinationCount[]>([]);
  const [longestStops, setLongestStops] = useState<InactiveStop[]>([]);
  const [hasProcessed, setHasProcessed] = useState(false);

  // Store global de telemetría por si el usuario quiere auto-poblar
  const { rawParsedData } = useFleetStore();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      processExcelFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      processExcelFile(selectedFile);
    }
  };

  // ==========================================
  // PIPELINE ETL (Lógica de Negocio de Python en TS)
  // ==========================================
  const processExcelFile = async (excelFile: File) => {
    setIsProcessing(true);
    try {
      const data = await excelFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convertir a matriz sin cabeceras
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const parsed: ParsedEvent[] = [];
      let currentDate: string | null = null;

      // Recorremos a partir de la fila 8 (índice 8)
      for (let i = 8; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        const col0 = String(row[0] || "").trim();
        if (!col0 || col0.toLowerCase() === "nan") continue;

        // Detectar si la celda es Fecha (10 caracteres, ej: 31.07.2026 o 31/07/2026)
        if (
          col0.length === 10 &&
          (col0[2] === "." || col0[2] === "/" || col0[2] === "-") &&
          (col0[5] === "." || col0[5] === "/" || col0[5] === "-")
        ) {
          currentDate = col0.replace(/\//g, ".").replace(/-/g, ".");
        }
        // Detectar si la celda es Hora (5 caracteres, ej: 17:56)
        else if (col0.length === 5 && col0[2] === ":") {
          if (currentDate) {
            const dtStr = `${currentDate} ${col0}`;
            // Parsear fecha y hora
            const parts = currentDate.split(".");
            const timeParts = col0.split(":");
            if (parts.length === 3 && timeParts.length === 2) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              const hours = parseInt(timeParts[0], 10);
              const minutes = parseInt(timeParts[1], 10);
              const dtObj = new Date(year, month, day, hours, minutes);

              const lugar = String(row[1] || "").trim();
              const distRaw = row[2];
              const distancia = typeof distRaw === "number" ? distRaw : parseFloat(String(distRaw || "0")) || 0;

              if (lugar) {
                parsed.push({
                  datetime: dtObj,
                  datetimeStr: dtStr,
                  lugar,
                  distancia_km: distancia
                });
              }
            }
          }
        }
      }

      if (parsed.length === 0) {
        alert("⚠️ No se detectaron eventos con el formato esperado de Navixy a partir de la fila 8.");
        setIsProcessing(false);
        return;
      }

      // Ordenar por fecha cronológica
      parsed.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

      // 1. Kilometraje Total
      const sumKm = parsed.reduce((acc, curr) => acc + curr.distancia_km, 0);

      // 2. Paradas más largas (Tiempos muertos / Pernocta)
      const stopsWithInactive: InactiveStop[] = [];
      for (let i = 0; i < parsed.length - 1; i++) {
        const current = parsed[i];
        const next = parsed[i + 1];
        const diffHours = (next.datetime.getTime() - current.datetime.getTime()) / (1000 * 3600);
        
        stopsWithInactive.push({
          datetimeStr: current.datetimeStr,
          horasInactivo: Math.max(0, diffHours),
          lugar: current.lugar,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.lugar)}`
        });
      }
      stopsWithInactive.sort((a, b) => b.horasInactivo - a.horasInactivo);
      const topStops = stopsWithInactive.slice(0, 5);

      // 3. Top 5 Destinos Frecuentes (Excluyendo Base Operativa)
      const destCounts: Record<string, number> = {};
      const baseLower = baseOperativa.toLowerCase();

      parsed.forEach(item => {
        if (!item.lugar.toLowerCase().includes(baseLower)) {
          destCounts[item.lugar] = (destCounts[item.lugar] || 0) + 1;
        }
      });

      const topDest: DestinationCount[] = Object.entries(destCounts)
        .map(([lugar, count]) => ({
          lugar,
          count,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 4. Rutas Completas (Base -> Base)
      const routeCycles: RouteCycle[] = [];
      let inRoute = false;
      let startTime: Date | null = null;
      let routeKm = 0;

      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        const isBase = item.lugar.toLowerCase().includes(baseLower);

        if (isBase) {
          if (inRoute && startTime) {
            routeKm += item.distancia_km;
            routeCycles.push({
              salida: startTime.toLocaleString("es-MX", { hour12: false }),
              regreso: item.datetime.toLocaleString("es-MX", { hour12: false }),
              km: Math.round(routeKm * 100) / 100
            });
            inRoute = false;
            routeKm = 0;
            startTime = item.datetime;
          } else {
            startTime = item.datetime;
          }
        } else {
          if (startTime !== null) {
            inRoute = true;
            routeKm += item.distancia_km;
          }
        }
      }

      routeCycles.sort((a, b) => b.km - a.km);
      const topRoutes = routeCycles.slice(0, 10);

      // Guardar estados
      setParsedEvents(parsed);
      setTotalKm(sumKm);
      setRoutes(topRoutes);
      setTopDestinations(topDest);
      setLongestStops(topStops);
      setHasProcessed(true);

    } catch (err: any) {
      console.error("Error en Pipeline ETL:", err);
      alert(`Error al procesar el archivo Excel: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // GENERADOR DOCUMENTO WORD (.DOCX)
  // ==========================================
  const generateWordDoc = async () => {
    if (!hasProcessed) return;
    setIsGeneratingDocx(true);

    try {
      // 1. Tabla de Rutas
      const routeTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Salida de Base", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Regreso a Base", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "KM Recorridos", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
          ],
        }),
        ...(routes.length > 0 ? routes.map(r => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(r.salida)] }),
              new TableCell({ children: [new Paragraph(r.regreso)] }),
              new TableCell({ children: [new Paragraph(`${r.km} km`)] }),
            ]
          })
        ) : [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("No se detectaron ciclos completos")] }),
              new TableCell({ children: [new Paragraph("-")] }),
              new TableCell({ children: [new Paragraph("0 km")] }),
            ]
          })
        ])
      ];

      // 2. Tabla de Destinos
      const destTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ubicación / Geocerca", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Eventos", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Enlace Google Maps", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
          ],
        }),
        ...topDestinations.map(d =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(d.lugar)] }),
              new TableCell({ children: [new Paragraph(String(d.count))] }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new ExternalHyperlink({
                        children: [
                          new TextRun({
                            text: "Ver ubicación en Google Maps",
                            color: "2563EB",
                            underline: {},
                          }),
                        ],
                        link: d.mapsUrl,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          })
        )
      ];

      // 3. Tabla de Paradas más largas
      const stopsTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Fecha/Hora", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Horas Inactivo", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ubicación", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Enlace Google Maps", bold: true, color: "FFFFFF" })] })], shading: { fill: "1E3A8A" } }),
          ],
        }),
        ...longestStops.map(s =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(s.datetimeStr)] }),
              new TableCell({ children: [new Paragraph(`${s.horasInactivo.toFixed(1)} hrs`)] }),
              new TableCell({ children: [new Paragraph(s.lugar)] }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new ExternalHyperlink({
                        children: [
                          new TextRun({
                            text: "Ver punto en Maps",
                            color: "2563EB",
                            underline: {},
                          }),
                        ],
                        link: s.mapsUrl,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          })
        )
      ];

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: `Reporte de GPS unidad ${unidadNombre}`,
                heading: HeadingLevel.TITLE,
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Periodo: ${mesReporte}`, bold: true, color: "4B5563" }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Nota: Las ubicaciones incluyen coordenadas georreferenciadas con enlaces directos a Google Maps para facilitar la auditoría de rutas.",
                    italics: true,
                    color: "6B7280"
                  }),
                ],
              }),
              new Paragraph({ text: "" }),
              new Paragraph({
                text: `Análisis de Unidad: ${unidadNombre}`,
                heading: HeadingLevel.HEADING_1,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Kilometraje Total del Periodo: ${totalKm.toFixed(2)} km`,
                    bold: true,
                    size: 24,
                    color: "1E3A8A"
                  }),
                ],
              }),
              new Paragraph({ text: "" }),
              
              // Sección 1
              new Paragraph({
                text: `1. Rutas Completas (${baseOperativa} -> ${baseOperativa})`,
                heading: HeadingLevel.HEADING_2,
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: routeTableRows,
              }),
              new Paragraph({ text: "" }),

              // Sección 2
              new Paragraph({
                text: "2. Top 5 Destinos Frecuentes (Excluyendo Base)",
                heading: HeadingLevel.HEADING_2,
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: destTableRows,
              }),
              new Paragraph({ text: "" }),

              // Sección 3
              new Paragraph({
                text: "3. Paradas Más Largas (Tiempos Muertos / Pernocta)",
                heading: HeadingLevel.HEADING_2,
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: stopsTableRows,
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const fileName = `Reporte_${unidadNombre}_${mesReporte.replace(/\s+/g, "_")}.docx`;
      saveAs(blob, fileName);

    } catch (err: any) {
      console.error("Error generando Word:", err);
      alert(`No se pudo crear el archivo Word: ${err.message}`);
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER DE BIENVENIDA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-950/40 via-[#0a0a0a] to-orange-950/20 border border-zinc-800 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <Route className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Pipeline ETL de Auditoría • Ciclos de Base y Reportes Word
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                  v1.0 Python + Web
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Procesa reportes irregulares de Navixy, detecta viajes redondos desde/hacia la Base Operativa, clasifica destinos con georreferenciación y genera reportes ejecutivos en Word (.docx).
              </p>
            </div>
          </div>
        </div>

        {hasProcessed && (
          <button
            onClick={generateWordDoc}
            disabled={isGeneratingDocx}
            className="flex items-center gap-2.5 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 shrink-0"
          >
            {isGeneratingDocx ? (
              <Clock className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Descargar Reporte Word (.docx)
          </button>
        )}
      </div>

      {/* PARÁMETROS Y CARGA DE EXCEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PARÁMETROS DE CONFIGURACIÓN */}
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-orange-500" />
            Configuración del Análisis
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 font-medium mb-1 block">Unidad / Vehículo</label>
              <input
                type="text"
                value={unidadNombre}
                onChange={(e) => setUnidadNombre(e.target.value)}
                placeholder="Ej. AVH-033"
                className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500/60 font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 font-medium mb-1 block">Periodo de Reporte</label>
              <input
                type="text"
                value={mesReporte}
                onChange={(e) => setMesReporte(e.target.value)}
                placeholder="Ej. Agosto 2026"
                className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500/60"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 font-medium mb-1 block">Base Operativa (Retorno)</label>
              <input
                type="text"
                value={baseOperativa}
                onChange={(e) => setBaseOperativa(e.target.value)}
                placeholder="Ej. Oficina Comalcalco"
                className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500/60"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Los ciclos se miden desde que sale de esta base hasta que regresa a ella.
              </span>
            </div>
          </div>
        </div>

        {/* ZONA DE ARRASTRAR / CARGAR ARCHIVO */}
        <div className="lg:col-span-2">
          <div
            className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all duration-300 min-h-[220px] ${
              dragActive
                ? "border-orange-500 bg-orange-500/10 shadow-[0_0_40px_rgba(249,115,22,0.15)]"
                : "border-zinc-800 bg-[#050505] hover:bg-[#0a0a0a] hover:border-zinc-700"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".xlsx, .xls"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
            />

            {isProcessing ? (
              <div className="flex flex-col items-center text-center animate-in fade-in duration-300">
                <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-3 animate-spin">
                  <RotateCcw className="w-6 h-6 text-orange-500" />
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">Ejecutando Pipeline ETL...</h4>
                <p className="text-xs text-zinc-400 max-w-xs">
                  Leyendo registros a partir de fila 8, agrupando ciclos y calculando horas inactivas.
                </p>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">{file.name}</h4>
                <p className="text-xs text-zinc-400 mb-3">
                  {(file.size / 1024).toFixed(1)} KB • Procesado exitosamente ({parsedEvents.length} eventos)
                </p>
                <span className="text-[11px] text-orange-400 hover:underline">
                  Haz clic o arrastra otro archivo para reprocesar
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center pointer-events-none">
                <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center mb-3 border border-zinc-800 shadow-xl">
                  <UploadCloud className="w-6 h-6 text-orange-500" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-200 mb-1">
                  Subir Excel de Navixy (ej. AVH-033-AGO.xlsx)
                </h4>
                <p className="text-zinc-500 text-xs max-w-sm">
                  Arrastra el archivo irregular aquí. El algoritmo saltará los encabezados corruptos y extraerá automáticamente los recorridos.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RESULTADOS DEL ETL */}
      {hasProcessed && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          
          {/* TARJETAS DE KPIS PRINCIPALES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0a0a0a] border border-zinc-800 p-4 rounded-xl shadow-md">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Kilometraje Total</span>
              <div className="text-2xl font-black text-white mt-1">
                {totalKm.toFixed(2)} <span className="text-xs font-normal text-zinc-400">km</span>
              </div>
              <span className="text-[11px] text-emerald-400 mt-1 block">Sumatoria del periodo</span>
            </div>

            <div className="bg-[#0a0a0a] border border-zinc-800 p-4 rounded-xl shadow-md">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Ciclos Base ↔ Base</span>
              <div className="text-2xl font-black text-blue-400 mt-1">
                {routes.length} <span className="text-xs font-normal text-zinc-400">rutas</span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-1 block">Salida y retorno a {baseOperativa}</span>
            </div>

            <div className="bg-[#0a0a0a] border border-zinc-800 p-4 rounded-xl shadow-md">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Destinos Frecuentes</span>
              <div className="text-2xl font-black text-orange-400 mt-1">
                {topDestinations.length} <span className="text-xs font-normal text-zinc-400">puntos</span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-1 block">Ubicaciones fuera de base</span>
            </div>

            <div className="bg-[#0a0a0a] border border-zinc-800 p-4 rounded-xl shadow-md">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Tiempos Muertos Críticos</span>
              <div className="text-2xl font-black text-amber-400 mt-1">
                {longestStops[0]?.horasInactivo.toFixed(1) || "0"} <span className="text-xs font-normal text-zinc-400">hrs máx</span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-1 block">Parada más prolongada</span>
            </div>
          </div>

          {/* SUB-PESTAÑAS DE DETALLE */}
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex gap-1.5 bg-[#121212] p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setActiveSubTab("rutas")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === "rutas"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>1. Rutas Completas ({routes.length})</span>
                </button>

                <button
                  onClick={() => setActiveSubTab("destinos")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === "destinos"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>2. Top 5 Destinos ({topDestinations.length})</span>
                </button>

                <button
                  onClick={() => setActiveSubTab("paradas")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === "paradas"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>3. Paradas Más Largas ({longestStops.length})</span>
                </button>

                <button
                  onClick={() => setActiveSubTab("python")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === "python"
                      ? "bg-zinc-800 text-orange-400 border border-zinc-700 shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-orange-400" />
                  <span>Script Python Local</span>
                </button>
              </div>

              <button
                onClick={generateWordDoc}
                disabled={isGeneratingDocx}
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 font-bold bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar a Word (.docx)
              </button>
            </div>

            {/* TABLA 1: RUTAS COMPLETAS */}
            {activeSubTab === "rutas" && (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#121212] text-zinc-400 uppercase tracking-widest text-[10px] border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Salida de Base</th>
                      <th className="px-4 py-3">Regreso a Base</th>
                      <th className="px-4 py-3 text-right">KM Recorridos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                    {routes.length > 0 ? (
                      routes.map((r, i) => (
                        <tr key={i} className="hover:bg-zinc-900/60 transition-colors">
                          <td className="px-4 py-3 font-mono text-zinc-200">{r.salida}</td>
                          <td className="px-4 py-3 font-mono text-zinc-200">{r.regreso}</td>
                          <td className="px-4 py-3 text-right font-black text-blue-400 font-mono">
                            {r.km.toFixed(2)} km
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                          No se encontraron ciclos cerrados que salgan y regresen a la {baseOperativa}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TABLA 2: DESTINOS FRECUENTES */}
            {activeSubTab === "destinos" && (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#121212] text-zinc-400 uppercase tracking-widest text-[10px] border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Ubicación / Geocerca</th>
                      <th className="px-4 py-3 text-center">Total Eventos</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                    {topDestinations.map((d, i) => (
                      <tr key={i} className="hover:bg-zinc-900/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span>{d.lugar}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-orange-400">
                          <span className="bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">
                            {d.count} visitas
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={d.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:underline font-medium"
                          >
                            <span>Abrir Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TABLA 3: PARADAS MÁS LARGAS */}
            {activeSubTab === "paradas" && (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#121212] text-zinc-400 uppercase tracking-widest text-[10px] border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Fecha / Hora</th>
                      <th className="px-4 py-3 text-center">Horas Inactivo</th>
                      <th className="px-4 py-3">Ubicación Registrada</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                    {longestStops.map((s, i) => (
                      <tr key={i} className="hover:bg-zinc-900/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-zinc-200">{s.datetimeStr}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2.5 py-0.5 rounded font-black font-mono">
                            {s.horasInactivo.toFixed(1)} hrs
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-200">{s.lugar}</td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={s.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:underline font-medium"
                          >
                            <span>Ver punto en Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PESTAÑA 4: CÓMO USAR EN PYTHON LOCAL */}
            {activeSubTab === "python" && (
              <div className="p-4 bg-[#070707] border border-zinc-800 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-orange-400" />
                    <h4 className="text-sm font-bold text-white">Ejecutar Pipeline directamente con Python</h4>
                  </div>
                  <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                    Librerías ya instaladas: pandas, openpyxl, python-docx
                  </span>
                </div>

                <p className="text-xs text-zinc-400">
                  Ya dejamos creado el archivo maestro <code className="text-orange-400 bg-zinc-900 px-1.5 py-0.5 rounded">generador_reportes.py</code> en la raíz de tu proyecto. Puedes correrlo desde tu terminal de VS Code / PowerShell en cualquier momento:
                </p>

                <div className="bg-black border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-200 space-y-2">
                  <div className="text-zinc-500"># Opción 1: Ejecutar con los valores por defecto (AVH-033-AGO.xlsx)</div>
                  <div className="text-orange-400">python generador_reportes.py</div>
                  
                  <div className="text-zinc-500 mt-2"># Opción 2: Pasar archivo, unidad y mes como argumentos</div>
                  <div className="text-emerald-400">python generador_reportes.py &quot;AVH-033-AGO.xlsx&quot; &quot;AVH-033&quot; &quot;Agosto 2026&quot;</div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                  <span>El script generará instantáneamente el archivo <code className="text-zinc-300">Reporte_{unidadNombre}_{mesReporte.replace(/\s+/g, "_")}.docx</code> en la misma carpeta.</span>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}
