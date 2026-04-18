"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface StopMiniMapProps {
  lat: number;
  lng: number;
  address: string;
}

export default function StopMiniMap({ lat, lng, address }: StopMiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Destruir instancia previa si existe
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
    });

    // Tiles de OpenStreetMap con estilo oscuro (CartoDB Dark Matter)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Marcador con icono naranja personalizado
    const orangeIcon = L.divIcon({
      className: "custom-orange-marker",
      html: `<div style="
        width: 28px; height: 28px;
        background: #ea580c;
        border: 3px solid #000;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 0 15px rgba(234, 88, 12, 0.5);
      "></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28],
    });

    L.marker([lat, lng], { icon: orangeIcon })
      .addTo(map)
      .bindPopup(`<div style="color:#18181b;font-size:12px;max-width:220px;"><strong>${address}</strong><br/><span style="color:#71717a;">Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}</span></div>`)
      .openPopup();

    mapInstance.current = map;

    // Forzar re-render del tamaño del mapa
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [lat, lng, address]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
