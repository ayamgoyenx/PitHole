import React, { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { STATUS_COLORS, UGM_CENTER } from './theme';

function createIcon(status, selected) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.active;
  const size = selected ? 19 : 13;
  return L.divIcon({
    className: 'admin-map-marker-wrap',
    html: `<span style="display:block;width:${size}px;height:${size}px;border:${selected ? 3 : 2}px solid ${selected ? '#0C2846' : 'white'};border-radius:50%;background:${color};box-shadow:0 1px 5px #1238"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FocusSelected({ pothole }) {
  const map = useMap();
  const id = pothole?.id;
  const lat = pothole ? Number(pothole.lat) : null;
  const lon = pothole ? Number(pothole.lon) : null;
  useEffect(() => {
    if (id != null) map.panTo([lat, lon]);
  }, [id, lat, lon, map]);
  return null;
}

export default function AdminMap({ potholes = [], className = '', selectedId = null, onSelect }) {
  const selected = potholes.find((item) => item.id === selectedId) || null;
  return (
    <div className={`admin-map ${className}`}>
      <MapContainer center={UGM_CENTER} zoom={15} scrollWheelZoom style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FocusSelected pothole={selected} />
        {potholes.map((pothole) => (
          <Marker
            key={`${pothole.id}-${pothole.status}-${pothole.id === selectedId}`}
            position={[Number(pothole.lat), Number(pothole.lon)]}
            icon={createIcon(pothole.status, pothole.id === selectedId)}
            title={`Lubang #${pothole.id}`}
            eventHandlers={onSelect ? { click: () => onSelect(pothole.id) } : undefined}
          />
        ))}
      </MapContainer>
    </div>
  );
}
