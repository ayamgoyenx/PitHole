import React from 'react';
import { MapPin } from 'lucide-react';

export default function PotholeList({
  potholes,
  activeFilter,
  onFilterChange,
  onSelectPothole,
}) {
  const getStatusLabel = (status) => {
    switch (status) {
      case 'in_progress': return 'Lubang sedang diproses';
      case 'repaired': return 'Lubang dilaporkan selesai';
      case 'active':
      default: return 'Lubang aktif';
    }
  };

  const filteredPotholes = activeFilter
    ? potholes.filter((p) => p.status === activeFilter)
    : potholes;

  return (
    <div className="dashboard-pitholelist">
      {/* Status Legend Panel (Kiri - Gambar Mockup 1) */}
      {/* <div className="dashboard-card">
        <h2 className="card-title-bar">Status Lubang Oleh Admin</h2>
        <div className="status-legend-list">
          <div
            className={`legend-item ${activeFilter === 'active' ? 'active' : ''}`}
            onClick={() => onFilterChange(activeFilter === 'active' ? null : 'active')}
          >
            <span className="legend-dot dot-active"></span>
            <span>Lubang aktif</span>
          </div>
          <div
            className={`legend-item ${activeFilter === 'in_progress' ? 'active' : ''}`}
            onClick={() => onFilterChange(activeFilter === 'in_progress' ? null : 'in_progress')}
          >
            <span className="legend-dot dot-progress"></span>
            <span>Lubang sedang diproses</span>
          </div>
          <div
            className={`legend-item ${activeFilter === 'repaired' ? 'active' : ''}`}
            onClick={() => onFilterChange(activeFilter === 'repaired' ? null : 'repaired')}
          >
            <span className="legend-dot dot-repaired"></span>
            <span>Lubang dilaporkan selesai</span>
          </div>
        </div>
    
      {/* Deteksi Terkini Panel (Kanan - Gambar Mockup 1) */}
      <div className="map-panel-header-recaphole">
        <h2 className="card-title-bar">Deteksi Lubang Terkini</h2>
        <div className="pothole-list-container">
          {filteredPotholes.map((item) => (
            <div
              key={item.id}
              className="pothole-item-card"
              onClick={() => onSelectPothole(item)}
            >
              <div className="pothole-item-left">
                <div className="pothole-item-header">
                  <MapPin size={18} color="#0F172A" />
                  <span>Pothole #{item.id}</span>
                </div>
                <div className="pothole-item-coords">
                  <MapPin size={14} color="#64748B" />
                  <span>{item.location_name || 'Lokasi tidak diketahui'}</span>
                </div>
              </div>
              <span className={`status-pill status-${item.status}`}>
                {getStatusLabel(item.status)}
              </span>
            </div>
          ))}
          {filteredPotholes.length === 0 && (
            <p style={{ color: '#64748B', textAlign: 'center', padding: '20px' }}>
              Tidak ada data titik jalan berlubang.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
