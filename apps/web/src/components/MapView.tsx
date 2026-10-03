"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";

// The worker is copied into /public by scripts/copy-maplibre-worker.mjs.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import { boundsOf, type LatLng } from "@repo/core";

// Free vector tiles, no API key. See https://openfreemap.org
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string; // shown in the pill, e.g. "4.3" or the name
  emoji?: string;
  color?: string;
  dim?: boolean;
  selected?: boolean;
  candidate?: boolean; // dashed style for "discovered but not added"
};

export type MapOrigin = LatLng & { emoji?: string };

type Props = {
  markers?: MapMarker[];
  origin?: MapOrigin | null;
  // Extra points to keep inside the initial view
  extraPoints?: LatLng[];
  center?: LatLng;
  zoom?: number;
  fitKey?: string; // when this changes the map refits to its markers
  onMarkerClick?: (id: string) => void;
  onMapClick?: (p: LatLng) => void;
  onMoveEnd?: (center: LatLng, zoom: number) => void;
  draggable?: { lat: number; lng: number; onDragEnd: (p: LatLng) => void } | null;
  className?: string;
  children?: React.ReactNode;
};

export function MapView({
  markers = [],
  origin,
  extraPoints = [],
  center,
  zoom = 12,
  fitKey,
  onMarkerClick,
  onMapClick,
  onMoveEnd,
  draggable,
  className = "",
  children,
}: Props) {
  const ref = useRef<MapRef>(null);

  // What the view should contain, in priority order: a draggable pin wins,
  // then live markers plus the origin, then (if nothing else) dimmed and
  // candidate markers so the map is never empty.
  const points: LatLng[] = [];
  if (draggable) points.push({ lat: draggable.lat, lng: draggable.lng });
  else {
    points.push(
      ...markers.filter((m) => !m.dim && !m.candidate).map((m) => ({ lat: m.lat, lng: m.lng })),
      ...(origin ? [origin] : []),
      ...extraPoints,
    );
    if (points.length === 0 && markers.length > 0) points.push(...markers.map((m) => ({ lat: m.lat, lng: m.lng })));
  }
  const bounds = boundsOf(points);
  const initialCenter = center ?? (bounds ? { lat: (bounds[0][1] + bounds[1][1]) / 2, lng: (bounds[0][0] + bounds[1][0]) / 2 } : { lat: 37.7749, lng: -122.4194 });

  // Refit whenever the caller says the set of things to show changed.
  const boundsKey = bounds ? bounds.flat().map((n) => n.toFixed(4)).join(",") : "";
  useEffect(() => {
    const map = ref.current;
    if (!map || !bounds) return;
    if (points.length === 1) {
      map.flyTo({ center: [points[0].lng, points[0].lat], zoom: Math.max(zoom, 14), duration: 600 });
    } else {
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 40, right: 40 }, duration: 600, maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, boundsKey]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Map
        ref={ref}
        initialViewState={
          bounds && points.length > 1
            ? { bounds, fitBoundsOptions: { padding: 60, maxZoom: 15 } }
            : { longitude: initialCenter.lng, latitude: initialCenter.lat, zoom: points.length === 1 ? Math.max(zoom, 14) : zoom }
        }
        mapStyle={STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        onClick={(e) => onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
        onMoveEnd={(e) => onMoveEnd?.({ lat: e.viewState.latitude, lng: e.viewState.longitude }, e.viewState.zoom)}
        cursor={onMapClick ? "crosshair" : undefined}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {origin && (
          <Marker longitude={origin.lng} latitude={origin.lat} anchor="center">
            <div className="marker-origin" title="Start">{origin.emoji ?? "🏠"}</div>
          </Marker>
        )}

        {markers.map((m) => (
          <Marker
            key={m.id}
            longitude={m.lng}
            latitude={m.lat}
            anchor="bottom"
            style={{ zIndex: m.selected ? 10 : m.dim ? 0 : 1 }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onMarkerClick?.(m.id);
            }}
          >
            {m.candidate ? (
              <div className="marker-candidate" title={m.label}>
                <span>{m.emoji ?? "＋"}</span>
                <span className="truncate">{m.label}</span>
              </div>
            ) : (
              <div
                className="marker"
                data-dim={m.dim ? "true" : "false"}
                data-selected={m.selected ? "true" : "false"}
                style={{ "--marker-color": m.color ?? "#2f855a" } as React.CSSProperties}
                title={m.label}
              >
                {m.emoji ? <span>{m.emoji}</span> : <span className="marker-dot" />}
                <span>{m.label}</span>
              </div>
            )}
          </Marker>
        ))}

        {draggable && (
          <Marker
            longitude={draggable.lng}
            latitude={draggable.lat}
            anchor="bottom"
            draggable
            onDragEnd={(e) => draggable.onDragEnd({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
          >
            <div className="text-3xl drop-shadow-md select-none cursor-grab">📍</div>
          </Marker>
        )}
        {children}
      </Map>
    </div>
  );
}
