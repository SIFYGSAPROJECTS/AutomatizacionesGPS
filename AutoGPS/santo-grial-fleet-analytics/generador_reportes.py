import pandas as pd
from datetime import datetime
import urllib.parse
import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import sys
import os

# ==========================================
# 1. CONFIGURACIÓN DEL PROYECTO
# ==========================================
# Si se pasan argumentos por consola: python generador_reportes.py [archivo.xlsx] [unidad] [mes] [base]
# De lo contrario, usa los valores por defecto:
ARCHIVO_EXCEL = sys.argv[1] if len(sys.argv) > 1 else 'AVH-033-AGO.xlsx'
UNIDAD_NOMBRE = sys.argv[2] if len(sys.argv) > 2 else 'AVH-033'
MES_REPORTE = sys.argv[3] if len(sys.argv) > 3 else 'Agosto 2026'
BASE_OPERATIVA = sys.argv[4] if len(sys.argv) > 4 else 'Oficina Comalcalco'
ARCHIVO_GEOCERCAS = 'Tabla de Geocercas - puedes hacer una tabla con las geocercas y direcc....csv'

print(f"============================================================")
print(f"🚀 INICIANDO PIPELINE ETL DE AUDITORÍA (SIFYGSA)")
print(f"   Unidad        : {UNIDAD_NOMBRE}")
print(f"   Periodo       : {MES_REPORTE}")
print(f"   Base Operativa: {BASE_OPERATIVA}")
print(f"   Archivo Excel : {ARCHIVO_EXCEL}")
print(f"============================================================")

if not os.path.exists(ARCHIVO_EXCEL):
    print(f"⚠️ AVISO: No se encontró el archivo '{ARCHIVO_EXCEL}' en la carpeta actual ({os.getcwd()}).")
    print(f"   Por favor coloca tu archivo Excel aquí o ejecuta:")
    print(f"   python generador_reportes.py \"ruta/a/tu_archivo.xlsx\" \"{UNIDAD_NOMBRE}\" \"{MES_REPORTE}\"")
    sys.exit(1)

# ==========================================
# 2. EXTRACCIÓN Y LIMPIEZA (ETL)
# ==========================================
print(f"📥 Extrayendo y limpiando telemetría de '{ARCHIVO_EXCEL}'...")
df_raw = pd.read_excel(ARCHIVO_EXCEL, sheet_name=0, header=None)

parsed_data = []
current_date = None

# Recorremos a partir de la fila 8 (donde empiezan los datos reales de Navixy)
for index, row in df_raw.iloc[8:].iterrows():
    col0 = str(row[0]).strip()
    if col0 == 'nan' or not col0:
        continue
    
    # Detectar si la celda es una Fecha (ej. 31.07.2026 o 31/07/2026)
    if len(col0) == 10 and (col0[2] in ['.', '/', '-']) and (col0[5] in ['.', '/', '-']):
        current_date = col0.replace('/', '.').replace('-', '.')
    # Detectar si la celda es una Hora (ej. 17:56)
    elif len(col0) == 5 and col0[2] == ':':
        if current_date:
            dt_str = f"{current_date} {col0}"
            try:
                dt_obj = datetime.strptime(dt_str, "%d.%m.%Y %H:%M")
                lugar = str(row[1]).strip() if pd.notna(row[1]) else ""
                distancia = float(row[2]) if pd.notna(row[2]) else 0.0
                
                if lugar:
                    parsed_data.append({
                        'datetime': dt_obj,
                        'lugar': lugar,
                        'distancia_km': distancia
                    })
            except Exception:
                pass

if not parsed_data:
    print("❌ Error: No se encontraron registros de eventos válidos en el archivo Excel.")
    sys.exit(1)

df = pd.DataFrame(parsed_data)
df = df.sort_values('datetime').reset_index(drop=True)
print(f"✅ Se procesaron {len(df)} eventos válidos de telemetría.")

# ==========================================
# 3. LÓGICA DE NEGOCIO (KPIS)
# ==========================================
# A. Kilometraje Total
total_km = df['distancia_km'].sum()

# B. Paradas más largas (Tiempos muertos / Pernoctas)
df['next_datetime'] = df['datetime'].shift(-1)
df['horas_inactivo'] = (df['next_datetime'] - df['datetime']).dt.total_seconds() / 3600.0
df_stops = df.sort_values('horas_inactivo', ascending=False).head(5)

# C. Top Destinos Frecuentes (Excluyendo Base)
df_dest = df[~df['lugar'].str.contains(BASE_OPERATIVA, na=False, case=False)]
top_dest = df_dest['lugar'].value_counts().head(5).reset_index()
top_dest.columns = ['lugar', 'count']

# D. Rutas Completas (Base -> Base)
routes = []
in_route = False
start_time = None
route_km = 0

for i, row in df.iterrows():
    is_base = BASE_OPERATIVA.lower() in row['lugar'].lower()
    
    if is_base:
        if in_route:
            route_km += row['distancia_km']
            routes.append({
                'Salida': start_time.strftime("%Y-%m-%d %H:%M:%S") if start_time else "",
                'Regreso': row['datetime'].strftime("%Y-%m-%d %H:%M:%S"),
                'KM': round(route_km, 2)
            })
            in_route = False
            route_km = 0
            start_time = row['datetime']
        else:
            start_time = row['datetime']
    else:
        if start_time is not None:
            in_route = True
            route_km += row['distancia_km']

df_routes = pd.DataFrame(routes)
if not df_routes.empty:
    df_routes = df_routes.sort_values('KM', ascending=False).head(10)

print(f"📊 KPIs calculados:")
print(f"   - Kilometraje Total: {total_km:.2f} km")
print(f"   - Ciclos Base -> Base detectados: {len(routes)}")
print(f"   - Destinos distintos fuera de base: {len(df_dest['lugar'].unique())}")

# ==========================================
# 4. GENERACIÓN DEL ARCHIVO WORD (.DOCX)
# ==========================================
print("📝 Generando documento Word de alta calidad ejecutiva...")
doc = docx.Document()

# Título y metadatos
h0 = doc.add_heading(f'Reporte de GPS unidad {UNIDAD_NOMBRE}', 0)
doc.add_paragraph(f'Periodo: {MES_REPORTE}')
nota = doc.add_paragraph('Nota: Las ubicaciones incluyen coordenadas georreferenciadas con enlaces directos a Google Maps para facilitar la auditoría de rutas.')
nota.style = 'Intense Quote'

doc.add_heading(f'Análisis de Unidad: {UNIDAD_NOMBRE}', level=1)
p_km = doc.add_paragraph()
run_km = p_km.add_run(f'Kilometraje Total del Periodo: {total_km:.2f} km')
run_km.bold = True

# --- Sección 1: Rutas ---
doc.add_heading(f'1. Rutas Completas ({BASE_OPERATIVA} -> {BASE_OPERATIVA})', level=2)
table = doc.add_table(rows=1, cols=3)
table.style = 'Table Grid'
hdr_cells = table.rows[0].cells
hdr_cells[0].text = 'Salida de Base'
hdr_cells[1].text = 'Regreso a Base'
hdr_cells[2].text = 'KM Recorridos'

if not df_routes.empty:
    for index, row in df_routes.iterrows():
        row_cells = table.add_row().cells
        row_cells[0].text = str(row['Salida'])
        row_cells[1].text = str(row['Regreso'])
        row_cells[2].text = f"{row['KM']} km"
else:
    row_cells = table.add_row().cells
    row_cells[0].text = "No se detectaron ciclos completos"
    row_cells[1].text = "-"
    row_cells[2].text = "0 km"

# --- Sección 2: Destinos ---
doc.add_heading('2. Top 5 Destinos Frecuentes (Excluyendo Base)', level=2)
table2 = doc.add_table(rows=1, cols=3)
table2.style = 'Table Grid'
hdr2 = table2.rows[0].cells
hdr2[0].text = 'Ubicación / Geocerca'
hdr2[1].text = 'Total Eventos'
hdr2[2].text = 'Enlace Google Maps'

for index, row in top_dest.iterrows():
    lugar_limpio = row['lugar']
    link = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(str(lugar_limpio))
    
    row_cells = table2.add_row().cells
    row_cells[0].text = str(lugar_limpio)
    row_cells[1].text = str(row['count'])
    row_cells[2].text = link

# --- Sección 3: Paradas más largas ---
doc.add_heading('3. Paradas Más Largas (Tiempos Muertos / Pernocta)', level=2)
table3 = doc.add_table(rows=1, cols=4)
table3.style = 'Table Grid'
hdr3 = table3.rows[0].cells
hdr3[0].text = 'Fecha/Hora'
hdr3[1].text = 'Horas Inactivo'
hdr3[2].text = 'Ubicación'
hdr3[3].text = 'Enlace Google Maps'

for index, row in df_stops.iterrows():
    lugar_limpio = row['lugar']
    link = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(str(lugar_limpio))
    
    row_cells = table3.add_row().cells
    row_cells[0].text = row['datetime'].strftime("%d.%m.%Y %H:%M")
    row_cells[1].text = f"{row['horas_inactivo']:.1f} hrs"
    row_cells[2].text = str(lugar_limpio)
    row_cells[3].text = link

# Guardar el documento
nombre_archivo_salida = f"Reporte_{UNIDAD_NOMBRE}_{MES_REPORTE.replace(' ', '_')}.docx"
doc.save(nombre_archivo_salida)

print(f"============================================================")
print(f"🎉 ¡ÉXITO! Tu reporte ha sido generado y guardado como:")
print(f"   📄 {os.path.abspath(nombre_archivo_salida)}")
print(f"============================================================")
