"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RouteMapProps {
  origin: [number, number];
  destination: [number, number];
}

export default function RouteMap({ origin, destination }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Inicializar mapa
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstance.current);
    }

    const map = mapInstance.current;

    // Limpiar capas previas
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    // Iconos personalizados
    const originIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div class="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-lg shadow-blue-500/50"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const destIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div class="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg shadow-red-500/50"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    // Añadir marcadores
    L.marker(origin, { icon: originIcon }).addTo(map);
    L.marker(destination, { icon: destIcon }).addTo(map);

    // Trazar línea de ruta (Dashed para indicar trayecto)
    const polyline = L.polyline([origin, destination], {
      color: '#fb923c',
      weight: 3,
      opacity: 0.6,
      dashArray: '5, 10'
    }).addTo(map);

    // Ajustar vista para ver ambos puntos
    map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

    return () => {
      // No destruimos el mapa para evitar parpadeos en el acordeón
    };
  }, [origin, destination]);

  return <div ref={mapRef} className="w-full h-full rounded-xl" />;
}
