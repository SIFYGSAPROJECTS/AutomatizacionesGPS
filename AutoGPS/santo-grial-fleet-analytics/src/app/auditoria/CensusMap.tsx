"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface CensusMarker {
  lat: number;
  lng: number;
  title: string;
  color: string;
  popup: string;
}

interface CensusMapProps {
  center: [number, number];
  zoom: number;
  markers: CensusMarker[];
  selectedId?: string;
}

export default function CensusMap({ center, zoom, markers, selectedId }: CensusMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstance.current) {
      const map = L.map(mapRef.current, {
        center: center,
        zoom: zoom,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapInstance.current = map;
      markerGroupRef.current = L.layerGroup().addTo(map);
    } else {
      mapInstance.current.setView(center, zoom);
    }

    // Actualizar marcadores
    if (markerGroupRef.current) {
      markerGroupRef.current.clearLayers();

      markers.forEach(m => {
        const icon = L.divIcon({
          className: "custom-census-marker",
          html: `<div style="
            width: 20px; height: 20px;
            background: ${m.color};
            border: 2px solid #fff;
            border-radius: 50%;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const marker = L.marker([m.lat, m.lng], { icon })
          .addTo(markerGroupRef.current!)
          .bindPopup(`<div style="color:#000; font-size:12px;">${m.popup}</div>`);
        
        // Si es el seleccionado, abrir popup
        if (m.lat === center[0] && m.lng === center[1]) {
           marker.openPopup();
        }
      });
    }

    setTimeout(() => mapInstance.current?.invalidateSize(), 200);

  }, [center, zoom, markers]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
