import React from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { STATUS_COLORS, LEVEL_LABEL, UGM_CENTER } from './theme';

// Pin berbentuk tetesan dengan jumlah lubang, berbeda dari penanda bulat untuk satu lubang
function createPin(road) {
  const color = road.level === 'severe' ? STATUS_COLORS.active : STATUS_COLORS.in_progress;
  const textColor = road.level === 'severe' ? '#FFFFFF' : '#0C2846';
  return L.divIcon({
    className: 'admin-road-pin-wrap',
    html: `<span class="admin-road-pin" style="background:${color};color:${textColor}"><b>${road.holes}</b></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -30],
  });
}

export default function AdminRoadMap({ roads = [], className = '' }) {
  return (
    <div className={`admin-map ${className}`}>
      <MapContainer center={UGM_CENTER} zoom={15} scrollWheelZoom style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {roads.map((road) => (
          <Marker key={road.id} position={road.position} icon={createPin(road)} title={`${road.name} (${LEVEL_LABEL[road.level]})`}>
            <Popup>
              <strong>{road.name}</strong>
              <br />
              {LEVEL_LABEL[road.level]} · {road.holes} lubang
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
