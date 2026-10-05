"use client";

import { useMemo, useState, useEffect } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { BadgeDollarSign, Moon, AlertTriangle, User, Map, Fuel, Truck, Calendar, MapPin, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { loadGeofences, checkProximity } from "@/lib/geofenceEngine";

interface TripDetail {
  conductor: string;
  vehiculo: string;
  fecha: string;
  hora: string;
  origen: string;
  destino: string;
  distancia: number;
  velMax: string;
  weekendId: string;
  lat?: number;
  lng?: number;
  isJustified?: boolean;
}

interface DriverOffHoursStat {
  conductor: string;
  vehiculos: Set<string>;
  totalKm: number;
  totalTrips: number;
  cost: number;
}

interface VehicleOffHoursStat {
  vehiculo: string;
  conductores: Set<string>;
  totalKm: number;
  totalTrips: number;
  diasUso: Set<string>;
  finesSemana: Set<string>;
  estimatedGasCost: number;
}

export function DeshorasPanel() {
  const { rawParsedData } = useFleetStore();
  
  // Settings for off-hours
  const [saturdayStartHour, setSaturdayStartHour] = useState<number>(15);
  const [sundayActive, setSundayActive] = useState<boolean>(true);
  const [ratePerKm, setRatePerKm] = useState<number>(5);

  // Settings for Vehicles & Gas
  const [fuelPrice, setFuelPrice] = useState<number>(24);
  const [fuelEfficiency, setFuelEfficiency] = useState<number>(8);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterDay, setFilterDay] = useState<string>("all");
  const [filterWeekend, setFilterWeekend] = useState<string>("all");

  const [tableTab, setTableTab] = useState<"drivers" | "vehicles">("drivers");

  const stats = useMemo(() => {
    if (!rawParsedData) return null;

    let totalOffHoursKm = 0;
    let totalOffHoursCost = 0;
    let totalOffHoursTrips = 0;
    const driverStats: Record<string, DriverOffHoursStat> = {};
    const vehicleStats: Record<string, VehicleOffHoursStat> = {};
    const vehicleOrigins: Record<string, string> = {};
    const extractedWeekends = new Set<string>();
    const globalTrips: TripDetail[] = [];
    const vehicleCoords: Record<string, Array<{lat: number, lng: number}>> = {};

    const processableRows = rawParsedData.map(row => {
      const getField = (keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
          if (match && row[match]) return row[match].trim();
        }
        return "";
      };
      const fecha = getField(["fecha", "date"]);
      const horaStr = getField(["hora"]);
      const vehiculo = getField(["vehiculo", "vehículo", "matricula"]);
      const timestamp = new Date(`${fecha} ${horaStr}`).getTime() || 0;
      return { row, getField, fecha, horaStr, vehiculo, timestamp };
    }).sort((a, b) => a.timestamp - b.timestamp);

    processableRows.forEach(({ row, getField, fecha, horaStr, vehiculo }) => {
      const conductor = getField(["conductor"]) || "Desconocido";
      const actualVehiculo = vehiculo || "Desconocido";

      const distanciaStr = getField(["distancia (km)", "distancia", "km"]);
      const lugar = getField(["lugar", "direccion", "dirección"]);
      const velMax = getField(["vel. máxima", "vel maxima", "velocidad maxima"]);
      
      const timeMatch = horaStr.match(/(\d{1,2}):\d{2}:\d{2}/);
      if (!timeMatch) return;
      const hour = parseInt(timeMatch[1], 10);
      
      const origin = vehicleOrigins[actualVehiculo] || "Punto de Partida (Desconocido)";
      
      let isOffHours = false;
      let weekendId = "N/A";
      let dayOfWeek = -1;

      const parsedDate = new Date(fecha);
      if (!isNaN(parsedDate.getTime())) {
        dayOfWeek = parsedDate.getUTCDay(); 
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
           const satDate = new Date(parsedDate);
           if (dayOfWeek === 0) satDate.setDate(satDate.getDate() - 1);
           const sunDate = new Date(satDate);
           sunDate.setDate(sunDate.getDate() + 1);
           const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
           weekendId = `${satDate.getUTCDate()} ${monthNames[satDate.getUTCMonth()]} - ${sunDate.getUTCDate()} ${monthNames[sunDate.getUTCMonth()]}`;
           extractedWeekends.add(weekendId);
        }

        if (dayOfWeek === 0 && sundayActive) {
          isOffHours = true;
        } else if (dayOfWeek === 6) {
          isOffHours = hour >= saturdayStartHour;
        }
      }

      if (filterWeekend !== "all" && weekendId !== filterWeekend) isOffHours = false;
      if (filterDay === "saturday" && dayOfWeek !== 6) isOffHours = false;
      if (filterDay === "sunday" && dayOfWeek !== 0) isOffHours = false;

      if (isOffHours) {
        const dist = parseFloat(distanciaStr);
        if (isNaN(dist) || dist <= 0) {
           vehicleOrigins[actualVehiculo] = lugar;
           return;
        }

        // Driver Stats
        if (!driverStats[conductor]) {
          driverStats[conductor] = { conductor, vehiculos: new Set<string>(), totalKm: 0, totalTrips: 0, cost: 0 };
        }
        driverStats[conductor].totalKm += dist;
        driverStats[conductor].totalTrips += 1;
        driverStats[conductor].vehiculos.add(actualVehiculo);

        // Vehicle Stats
        if (!vehicleStats[actualVehiculo]) {
          vehicleStats[actualVehiculo] = {
             vehiculo: actualVehiculo, conductores: new Set<string>(), 
             totalKm: 0, totalTrips: 0, diasUso: new Set<string>(),
             finesSemana: new Set<string>(), estimatedGasCost: 0
          };
        }
        vehicleStats[actualVehiculo].totalKm += dist;
        vehicleStats[actualVehiculo].totalTrips += 1;
        vehicleStats[actualVehiculo].conductores.add(conductor);
        vehicleStats[actualVehiculo].diasUso.add(fecha);
        vehicleStats[actualVehiculo].finesSemana.add(weekendId);

        // Capturar coordenadas para verificación de proximidad (Limpiar comillas/espacios)
        const latStr = String(getField(["Latitud", "latitud", "lat"])).replace(/[^\d.-]/g, '');
        const lngStr = String(getField(["Longitud", "longitud", "lng", "lon"])).replace(/[^\d.-]/g, '');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng)) {
          if (!vehicleCoords[actualVehiculo]) vehicleCoords[actualVehiculo] = [];
          vehicleCoords[actualVehiculo].push({ lat, lng });
        }
        
        // Limpieza de hora (Eliminar fecha de Excel 1899 y milisegundos)
        let horaLimpia = horaStr.replace("1899-12-30 ", "").split(".")[0]; 
        // Si la hora aún tiene segundos :00, quitarlos para que sea HH:mm
        const horaParts = horaLimpia.split(":");
        if (horaParts.length >= 2) {
          horaLimpia = `${horaParts[0].padStart(2, '0')}:${horaParts[1].padStart(2, '0')}`;
        }

        // Obtener el nombre del día abreviado (SÁB/DOM)
        const diasSemana = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
        const nombreDia = !isNaN(parsedDate.getTime()) ? diasSemana[parsedDate.getUTCDay()] : "";

        globalTrips.push({
          conductor,
          vehiculo: actualVehiculo,
          fecha: fecha ? `${nombreDia} ${fecha.split(" ")[0]}` : "N/A",
          hora: horaLimpia,
          origen: origin,
          destino: lugar || "Sin dirección",
          distancia: dist,
          velMax: velMax || "-",
          weekendId,
          lat,
          lng
        });

        totalOffHoursKm += dist;
        totalOffHoursTrips += 1;
      }
      
      vehicleOrigins[actualVehiculo] = lugar;
    });

    const driversArray = Object.values(driverStats).map(d => {
      d.cost = d.totalKm * ratePerKm;
      return d;
    }).sort((a, b) => b.cost - a.cost);

    const vehiclesArray = Object.values(vehicleStats).map(v => {
      // Cálculo: (Distancia / Rendimiento) * Precio Litro
      v.estimatedGasCost = (v.totalKm / fuelEfficiency) * fuelPrice;
      return v;
    }).sort((a, b) => b.totalKm - a.totalKm);

    (driversArray as any[]).forEach(d => totalOffHoursCost += d.cost);

    return {
      totalOffHoursKm,
      totalOffHoursCost,
      totalOffHoursTrips,
      drivers: driversArray,
      vehicles: vehiclesArray,
      trips: globalTrips.sort((a, b) => b.distancia - a.distancia),
      availableWeekends: Array.from(extractedWeekends).sort(),
      vehicleCoords
    };
  }, [rawParsedData, saturdayStartHour, sundayActive, ratePerKm, filterDay, filterWeekend, fuelPrice, fuelEfficiency]);

  // Estado para el filtro de geocercas (debe estar ANTES de los early returns)
  const [justifiedVehicles, setJustifiedVehicles] = useState<Set<string>>(new Set());
  const [hideJustified, setHideJustified] = useState<boolean>(true);

  // Cargar geocercas y determinar cuáles vehículos están justificados
  useEffect(() => {
    if (!stats || !stats.vehicleCoords) return;
    async function filterByProximity() {
      // 1. Cargar geocercas oficiales
      await loadGeofences();
      
      // 2. Inyectar las casas validadas del localStorage si existen
      const saved = localStorage.getItem("santo_grial_census_v2");
      if (saved) {
        const savedData = JSON.parse(saved);
        // El motor ya las leerá si las inyectamos adecuadamente (aunque aquí las inyectamos cada vez)
        // Pero para esta vista local, usaremos una lógica directa
      }

      const justified = new Set<string>();
      // Palabras que NO justifican por sí solas si vienen de geocercas genéricas del GPS
      const GENERIC_GEOFENCES = ["oxxo", "gasolinera", "7-eleven", "7 eleven", "super", "tienda", "domicilio"];

      (stats?.trips as any[] || []).forEach(t => {
        // 1. Justificación por Corredor Industrial (Zonas de trabajo)
        const WORK_ZONES = ["minatitlan", "minatitlán", "comalcalco", "veracruz", "boca del rio", "boca del río", "coatzacoalcos", "nanchital", "villahermosa", "chihuahua", "cadereyta"];
        const originLow = (t.origen || "").toLowerCase();
        const destLow = (t.destino || "").toLowerCase();
        
        const isWorkRoute = WORK_ZONES.some(z => originLow.includes(z)) && WORK_ZONES.some(z => destLow.includes(z));

        if (isWorkRoute) {
          t.isJustified = true;
          justified.add(t.vehiculo);
        } 
        
        // 2. Justificación por Proximidad a Geocercas MAESTRAS (Pernoctas y Bases)
        if (t.lat && t.lng && !isNaN(t.lat) && !isNaN(t.lng)) {
          const destResult = checkProximity(t.lat, t.lng, 0.5); // 500m de radio
          
          if (destResult.isNearGeofence) {
            const geoName = destResult.nearestGeofence.toUpperCase();
            
            // SI ES CASA STAFF o BASE, SE JUSTIFICA AUTOMÁTICAMENTE
            const isOfficialSite = geoName.includes("STAFF") || geoName.includes("BASE") || geoName.includes("OFICINA") || geoName.includes("CENSO");
            const isGeneric = GENERIC_GEOFENCES.some(gg => geoName.toLowerCase().includes(gg));

            if (isOfficialSite && !isGeneric) {
              t.isJustified = true;
              justified.add(t.vehiculo);
            }
          }
        }
      });
      setJustifiedVehicles(justified);
    }
    filterByProximity();
  }, [stats]);

  if (!rawParsedData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
          <Moon className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="font-heading text-4xl text-white mt-4">Sin Datos</h2>
        <p className="text-zinc-400">Carga un reporte y selecciona un mes en el Time Machine.</p>
      </div>
    );
  }

  if (!stats) return null;

  const filteredDrivers = stats.drivers.filter(d => {
    const matchesSearch = d.conductor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      Array.from(d.vehiculos).some(v => v.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;
    if (hideJustified) {
      // Excluir si TODOS sus vehículos están justificados
      const allJustified = Array.from(d.vehiculos).every(v => justifiedVehicles.has(v));
      if (allJustified) return false;
    }
    return true;
  });

  const filteredVehicles = stats.vehicles.filter(v => {
    const matchesSearch = v.vehiculo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      Array.from(v.conductores).some(c => c.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;
    if (hideJustified && justifiedVehicles.has(v.vehiculo)) return false;
    return true;
  });

  const filteredTrips = stats.trips.filter(t => {
    if (hideJustified && t.isJustified) return false;
    return true;
  });

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const top10 = filteredDrivers.slice(0, 10);

  return (
    <div className="flex flex-col gap-8 pb-20 animate-in fade-in duration-500">
      
      {/* SECCIÓN DE CONTROLES (Multilínea) */}
      <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-5 shadow-2xl flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
        <div className="flex flex-col lg:flex-row gap-6 w-full xl:w-auto">
          {/* Parámetros de Horario y Nómina */}
          <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
            <div className="flex items-center gap-3 pr-4 border-r border-zinc-800">
              <Moon className="w-5 h-5 text-orange-400" />
              <div className="hidden sm:block">
                <h3 className="text-white font-bold text-sm">Horario y Nómina</h3>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sábados</label>
              <div className="relative">
                <input 
                  type="number" min="0" max="23"
                  value={saturdayStartHour}
                  onChange={e => setSaturdayStartHour(parseInt(e.target.value) || 0)}
                  className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-1.5 w-20 text-center focus:ring-1 focus:ring-orange-500 text-sm"
                />
                <span className="absolute right-2 top-2 text-zinc-500 text-[10px] font-mono">h</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Domingos</label>
              <button 
                onClick={() => setSundayActive(!sundayActive)}
                className={`border rounded-lg px-2 py-1.5 w-20 text-center font-bold text-sm transition-colors ${sundayActive ? 'bg-orange-500/10 border-orange-500/50 text-orange-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
              >
                {sundayActive ? "ON" : "OFF"}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tarifa de Cobro</label>
              <div className="relative">
                <span className="absolute left-2 top-2 text-zinc-500 text-xs">$</span>
                <input 
                  type="number" min="0" step="0.5"
                  value={ratePerKm}
                  onChange={e => setRatePerKm(parseFloat(e.target.value) || 0)}
                  className="bg-zinc-950 border border-zinc-800 text-orange-400 font-bold rounded-lg pl-5 pr-2 py-1.5 w-24 focus:ring-1 focus:ring-orange-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Calculadora de Gasolina */}
          <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
            <div className="flex items-center gap-3 pr-4 border-r border-zinc-800">
              <Fuel className="w-5 h-5 text-emerald-400" />
              <div className="hidden sm:block">
                <h3 className="text-white font-bold text-sm">Combustible</h3>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Eficiencia (km/L)</label>
              <input 
                type="number" min="1" step="0.5"
                value={fuelEfficiency}
                onChange={e => setFuelEfficiency(parseFloat(e.target.value) || 1)}
                className="bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold rounded-lg px-2 py-1.5 w-20 text-center focus:ring-1 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Precio Litro ($)</label>
              <input 
                type="number" min="1" step="0.5"
                value={fuelPrice}
                onChange={e => setFuelPrice(parseFloat(e.target.value) || 0)}
                className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-1.5 w-20 text-center focus:ring-1 focus:ring-emerald-500 text-sm"
              />
            </div>
          </div>

          {/* Filtro de Geocercas */}
          <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
            <div className="flex items-center gap-3 pr-4 border-r border-zinc-800">
              <MapPin className="w-5 h-5 text-blue-400" />
              <div className="hidden sm:block">
                <h3 className="text-white font-bold text-sm">Geocercas</h3>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Filtrar Justificados</label>
              <button 
                onClick={() => {
                  console.log("Toggle hideJustified:", !hideJustified);
                  setHideJustified(!hideJustified);
                }}
                className={`border rounded-lg px-3 py-1.5 text-center font-bold text-sm transition-all duration-300 ${hideJustified ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
              >
                {hideJustified ? `OCULTAR (${justifiedVehicles.size})` : `MOSTRAR (${justifiedVehicles.size})`}
              </button>
            </div>
          </div>
        </div>

        {/* Filtros Globales (Máquina del Tiempo) */}
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <select
            value={filterWeekend}
            onChange={e => setFilterWeekend(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 w-full focus:ring-1 focus:ring-blue-500 text-sm font-medium"
          >
            <option value="all">Todos los Fines</option>
            {stats.availableWeekends.map((wk, i) => (
              <option key={i} value={wk}>{wk}</option>
            ))}
          </select>
          <select
            value={filterDay}
            onChange={e => setFilterDay(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 w-full focus:ring-1 focus:ring-blue-500 text-sm font-medium"
          >
            <option value="all">Sáb y Dom</option>
            <option value="saturday">Solo Sábados</option>
            <option value="sunday">Solo Domingos</option>
          </select>
        </div>
      </div>

      {/* SECCIÓN KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 hover:border-orange-500/30 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-orange-500/10 border border-orange-500/20">
            <BadgeDollarSign className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-500 font-medium">Deuda de Nómina (Total)</p>
            <p className="text-2xl font-bold text-white">{formatMoney(stats.totalOffHoursCost)}</p>
          </div>
        </div>
        
        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 hover:border-emerald-500/30 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20">
            <Fuel className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-500 font-medium">Gasolina Quemada (Estimada)</p>
            <p className="text-2xl font-bold text-white">{formatMoney((stats.totalOffHoursKm / fuelEfficiency) * fuelPrice)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-900 bg-[#0a0a0a] p-5 flex items-center gap-4 hover:border-zinc-700 transition-colors">
          <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-zinc-900 border border-zinc-800">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-500 font-medium">Km No Autorizados (Total)</p>
            <p className="text-2xl font-bold text-white">{stats.totalOffHoursKm.toLocaleString(undefined, {maximumFractionDigits: 1})} km</p>
          </div>
        </div>
      </div>

      {/* SECCIÓN GRÁFICA Y TABLAS INTEGRADAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRÁFICA TOP 10 CONDUCTORES */}
        <div className="lg:col-span-1 bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl flex flex-col">
          <h3 className="text-lg font-bold text-white mb-2">Top 10 Deudores</h3>
          <p className="text-xs text-zinc-500 mb-6">Conductores con más cargos en nómina.</p>
          
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="conductor" type="category" hide />
                <Tooltip 
                  cursor={{fill: '#18181b'}}
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff', borderRadius: '8px' }}
                  formatter={(value: any) => [formatMoney(value || 0), "Deuda"]}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {top10.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "#ef4444" : index < 3 ? "#f97316" : "#3f3f46"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 flex flex-col gap-2">
            {top10.slice(0, 5).map((d, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span className="text-zinc-400 truncate max-w-[150px]" title={d.conductor}>
                  {i + 1}. {d.conductor}
                </span>
                <span className={i === 0 ? "text-red-400 font-bold" : "text-white"}>
                  {formatMoney(d.cost)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CONTENEDOR MULTI-PESTAÑA (Conductores / Vehículos) */}
        <div className="lg:col-span-2 bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl flex flex-col">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            
            {/* Pestañas UI */}
            <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
               <button 
                 onClick={() => setTableTab("drivers")}
                 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tableTab === "drivers" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
               >
                 <User className="w-4 h-4" /> Conductores
               </button>
               <button 
                 onClick={() => setTableTab("vehicles")}
                 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tableTab === "vehicles" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-zinc-500 hover:text-zinc-300"}`}
               >
                 <Truck className="w-4 h-4" /> Vehículos
               </button>
            </div>

            <input 
              type="text" 
              placeholder="Buscar nombre o placas..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 w-full md:w-64 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar max-h-[500px]">
            {tableTab === "drivers" ? (
               // TABLA CONDUCTORES
               <table className="w-full text-left border-collapse animate-in fade-in zoom-in-95 duration-300">
                 <thead className="sticky top-0 bg-[#050505] z-10 shadow-sm">
                   <tr>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase">Conductor</th>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Viajes</th>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-right">Km Totales</th>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-right">Cobro a Nómina</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800/50">
                   {filteredDrivers.map((d, i) => (
                     <tr key={i} className="hover:bg-zinc-900/30 transition-colors">
                       <td className="py-4 px-4 min-w-0">
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                             <User className="w-4 h-4 text-zinc-400" />
                           </div>
                           <div className="flex flex-col gap-1 w-full max-w-[200px]">
                             <p className="text-sm font-bold text-white truncate" title={d.conductor}>{d.conductor}</p>
                             <div className="flex items-center gap-1">
                               <Map className="w-3 h-3 text-zinc-500" />
                               <p className="text-xs text-zinc-500 truncate" title={Array.from(d.vehiculos).join(", ")}>
                                 {Array.from(d.vehiculos).slice(0, 2).join(", ")}
                               </p>
                             </div>
                           </div>
                         </div>
                       </td>
                       <td className="py-4 px-4 text-center">
                         <span className="text-zinc-300 font-mono">{d.totalTrips}</span>
                       </td>
                       <td className="py-4 px-4 text-right">
                         <span className="text-zinc-300">{d.totalKm.toLocaleString(undefined, {maximumFractionDigits: 1})} km</span>
                       </td>
                       <td className="py-4 px-4 text-right">
                         <span className={`font-bold ${d.cost > 1000 ? 'text-red-400' : 'text-orange-400'}`}>
                           {formatMoney(d.cost)}
                         </span>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            ) : (
               // TABLA VEHÍCULOS
               <table className="w-full text-left border-collapse animate-in fade-in zoom-in-95 duration-300">
                 <thead className="sticky top-0 bg-[#050505] z-10 shadow-sm">
                   <tr>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase">Vehículo y Usuario(s)</th>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-center">Días de Uso</th>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-right">Km Totales</th>
                     <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase text-right">Gasto Gasolina</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800/50">
                   {filteredVehicles.map((v, i) => (
                     <tr key={i} className="hover:bg-zinc-900/30 transition-colors">
                       <td className="py-4 px-4 min-w-0">
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                             <Truck className="w-4 h-4 text-emerald-500" />
                           </div>
                           <div className="flex flex-col gap-1 w-full max-w-[200px]">
                             <p className="text-sm font-bold text-white truncate" title={v.vehiculo}>{v.vehiculo}</p>
                             <div className="flex items-center gap-1">
                               <User className="w-3 h-3 text-zinc-500" />
                               <p className="text-xs text-zinc-500 truncate" title={Array.from(v.conductores).join(", ")}>
                                 {Array.from(v.conductores).join(", ")}
                               </p>
                             </div>
                           </div>
                         </div>
                       </td>
                       <td className="py-4 px-4 text-center">
                         <div className="flex flex-col items-center gap-0.5">
                           <span className="text-white font-bold text-lg leading-none">{v.diasUso.size}</span>
                           <span className="text-[10px] text-zinc-500 uppercase">Días</span>
                         </div>
                         <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-zinc-400">
                           <Calendar className="w-3 h-3" />
                           <span>En {v.finesSemana.size} Fines</span>
                         </div>
                       </td>
                       <td className="py-4 px-4 text-right">
                         <span className="text-zinc-300 font-mono">{v.totalKm.toLocaleString(undefined, {maximumFractionDigits: 1})} km</span>
                       </td>
                       <td className="py-4 px-4 text-right">
                         <span className="font-bold text-emerald-400">
                           {formatMoney(v.estimatedGasCost)}
                         </span>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            )}
            
            {/* Vaciado visual si no hay coincidencias */}
            {((tableTab === "drivers" && filteredDrivers.length === 0) || (tableTab === "vehicles" && filteredVehicles.length === 0)) && (
              <div className="py-12 text-center text-zinc-500">
                No se encontraron registros con esos criterios.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BITÁCORA DETALLADA DE VIAJES (REDiseño UX 2.0) */}
      <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-6 shadow-2xl flex flex-col mt-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Moon className="w-5 h-5 text-orange-500" />
              Bitácora Forense de Deshoras
            </h3>
            <p className="text-xs text-zinc-500 mt-1">Análisis detallado por unidad y severidad de horario.</p>
          </div>
          <div className="flex items-center gap-3 bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2 px-3 py-1 border-r border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Crítico</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 border-r border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Nocturno</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Temprano</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Agrupamos los viajes filtrados por vehículo para la vista de acordeón */}
          {Object.entries(
            filteredTrips.reduce((acc, trip) => {
              if (!acc[trip.vehiculo]) acc[trip.vehiculo] = [];
              acc[trip.vehiculo].push(trip);
              return acc;
            }, {} as Record<string, TripDetail[]>)
          ).map(([vehiculo, trips], idx) => (
            <details key={idx} className="group bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden hover:border-orange-500/30 transition-all">
              <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-zinc-800/50 transition-colors list-none select-none">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-black border border-zinc-800 flex items-center justify-center text-orange-500">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white leading-tight">{vehiculo}</h4>
                    <p className="text-xs text-zinc-500">{trips[0].conductor} • {trips.length} eventos detectados</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="hidden md:flex flex-col items-end">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Recorrido</span>
                    <span className="text-lg font-mono font-bold text-zinc-200">
                      {trips.reduce((sum, t) => sum + t.distancia, 0).toLocaleString(undefined, {maximumFractionDigits:1})} km
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600 group-open:rotate-90 transition-transform" />
                </div>
              </summary>

              <div className="p-6 pt-2 border-t border-zinc-800/50 bg-black/40">
                <div className="space-y-3">
                  {trips.map((trip, tIdx) => {
                    const hour = parseInt(trip.hora.split(":")[0], 10);
                    let severityColor = "bg-zinc-800 text-zinc-400 border-zinc-700";
                    let severityLabel = "NORMAL";
                    let severityBg = "bg-transparent";

                    if (hour >= 0 && hour < 5) {
                      severityColor = "bg-red-500/10 text-red-500 border-red-500/20";
                      severityLabel = "🚨 CRÍTICO";
                      severityBg = "bg-red-500/5";
                    } else if (hour >= 22 || hour === 23) {
                      severityColor = "bg-orange-500/10 text-orange-500 border-orange-500/20";
                      severityLabel = "🔥 NOCTURNO";
                      severityBg = "bg-orange-500/5";
                    } else if (hour >= 5 && hour < 8) {
                      severityColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                      severityLabel = "☀️ TEMPRANO";
                      severityBg = "bg-amber-500/5";
                    }

                    return (
                      <div key={tIdx} className={`flex flex-col lg:flex-row items-start lg:items-center justify-between p-4 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-all gap-4 ${severityBg} group/trip`}>
                        <div className="flex items-center gap-4 min-w-[180px]">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-bold text-white">{trip.fecha}</span>
                            <span className="text-lg font-mono font-black text-orange-500 leading-tight">{trip.hora}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-tighter ${severityColor}`}>
                            {severityLabel}
                          </span>
                        </div>

                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                           <div className="flex items-center gap-2 text-xs text-zinc-500">
                             <MapPin className="w-3 h-3" />
                             <span className="truncate" title={trip.origen}>De: {trip.origen}</span>
                           </div>
                           <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></div>
                             <span className="text-sm font-medium text-zinc-200 truncate" title={trip.destino}>A: {trip.destino}</span>
                             {trip.isJustified ? (
                               <span className="ml-2 flex items-center gap-1 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20 whitespace-nowrap">
                                 ✅ JUSTIFICADO
                               </span>
                             ) : (
                               <span className="ml-2 flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full border border-red-500/20 whitespace-nowrap animate-pulse">
                                 ⚠️ DESCONOCIDO
                               </span>
                             )}
                           </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                             <span className="block text-xs text-zinc-500 font-mono uppercase tracking-widest leading-none">Distancia</span>
                             <span className="text-lg font-black text-white">{trip.distancia.toLocaleString(undefined, {maximumFractionDigits:1})} <small className="text-[10px] text-zinc-500">km</small></span>
                          </div>
                          <button 
                            onClick={() => {
                              // Aquí podrías abrir un modal con el mapa del viaje
                              alert(`Analizando ruta: ${trip.origen} -> ${trip.destino}`);
                            }}
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                            title="Ver en Mapa"
                          >
                            <Map className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          ))}
          
          {filteredTrips.length === 0 && (
            <div className="py-20 text-center border-2 border-dashed border-zinc-900 rounded-3xl">
              <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-zinc-700" />
              </div>
              <p className="text-zinc-500 font-medium">No se encontraron viajes registrados en deshoras.</p>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-between items-center text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          <span>Mostrando análisis forense de {filteredTrips.length} eventos</span>
          <span>Santo Grial Fleet Analytics v3.0</span>
        </div>
      </div>
    </div>
  );
}
