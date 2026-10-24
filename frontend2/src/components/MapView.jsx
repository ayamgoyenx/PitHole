import React, { useCallback, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import { ArrowUpRight, MapPin, MapPinned, X } from 'lucide-react';
import StreetPinLayer from './StreetPinLayer';
import StreetPinLegend from './StreetPinLegend';

// UGM Coordinates Center
const UGM_CENTER = [-7.7702, 110.3778];
const DEFAULT_ZOOM = 16;

// Helper untuk membuat Custom HTML Marker Icon Leaflet
function createCustomMarkerIcon(id, status) {
  const statusClass =
    status === 'active'
      ? 'pin-active'
      : status === 'in_progress'
        ? 'pin-in_progress'
        : 'pin-repaired';

  const html = `
    <div class="custom-pin-marker">
      <div class="pin-head ${statusClass}">
        <span class="pin-number">${id}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: '',
    iconSize: [36, 48],
    iconAnchor: [18, 48],
  });
}

export default function MapView({
  potholes,
  selectedPothole,
  onSelectPothole,
  onOpenDetail,
  onCloseSelection,
  heatRefreshKey = 0,
}) {
  const mapRef = useRef(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showStreetPins, setShowStreetPins] = useState(true);
  const [streetPinStatus, setStreetPinStatus] = useState({ state: 'loading', config: null });
  const handleStreetPinStatus = useCallback((status) => setStreetPinStatus(status), []);

  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.flyTo(UGM_CENTER, DEFAULT_ZOOM, { duration: 1 });
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'in_progress':
        return 'Lubang sedang diproses';
      case 'repaired':
        return 'Lubang dilaporkan selesai';
      case 'active':
      default:
        return 'Lubang aktif';
    }
  };

  return (
    <section className="map-card-container" aria-label="Peta laporan jalan berlubang">
      <header className="map-panel-header">
        {/* <div className="map-heading"> */}
          {/* <div className="map-heading-copy">
            <h2 className="map-heading-title">Peta Jalan Berlubang</h2>
            <p className="map-heading-description">
              Pantau lokasi laporan dan status penanganan jalan dalam satu peta.
            </p>
          </div> */}
          {/* <div className="map-summary-count">
          <span className="map-summary-count-number">{potholes.length}</span>
          <span className="map-summary-count-label">Total Lokasi</span>
          </div> */}
        {/* </div> */}

        {/* <div className="map-header-meta"> */}
          {/* <div className="sync-badge" title="Waktu sinkronisasi data terakhir">
            <span className="sync-indicator" aria-hidden="true" />
            <Clock3 size={15} aria-hidden="true" />
            <span>
              Data terakhir tersinkronisasi {lastSyncText || '5 menit yang lalu'}
            </span>
          </div> */}

          {/* <button
            type="button"
            className="btn-recenter"
            onClick={handleRecenter}
            aria-label="Pusatkan peta kembali ke Universitas Gadjah Mada"
          >
            <Navigation size={16} />
            <span>Pusatkan Kembali</span>
          </button> */}
        {/* </div> */}
      </header>

      
        {/* <div className="map-summary-title">
          <span className="map-summary-icon"><MapPin size={17} /></span>
          <div>
            <strong>Peta laporan</strong>
            <span>Pilih penanda untuk melihat ringkasan laporan.</span>
          </div>
        </div> */}
        {/* <div className="map-summary-count">
          <span className="map-summary-count-number">{potholes.length}</span>
          <span className="map-summary-count-label">Total Lokasi</span>
        </div>
      </div> */}

      <div className="leaflet-map-wrapper">
        <MapContainer
          center={UGM_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
          >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ScaleControl position="bottomleft" metric imperial={false} maxWidth={120} />

          <StreetPinLayer
            enabled={showStreetPins}
            refreshKey={heatRefreshKey}
            onStatusChange={handleStreetPinStatus}
          />

          {showMarkers && potholes
            .filter((item) => {
              const lat = Number(item.lat);
              const lon = Number(item.lon);
              return Number.isFinite(lat) && Number.isFinite(lon)
                && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
            })
            .map((item) => (
              <Marker
                key={item.id}
                position={[Number(item.lat), Number(item.lon)]}
                icon={createCustomMarkerIcon(item.id, item.status)}
                eventHandlers={{
                  click: () => onSelectPothole(item),
                }}
              />
          ))}
        </MapContainer>

        <div className="map-layer-toggles" role="group" aria-label="Lapisan peta">
          <button
            type="button"
            className={`map-layer-toggle${showMarkers ? ' active' : ''}`}
            aria-pressed={showMarkers}
            onClick={() => setShowMarkers((visible) => !visible)}
          >
            Marker lubang
          </button>
          <button
            type="button"
            className={`map-layer-toggle${showStreetPins ? ' active' : ''}`}
            aria-pressed={showStreetPins}
            onClick={() => setShowStreetPins((visible) => !visible)}
          >
            Pin jalan
          </button>
        </div>

        {showStreetPins && streetPinStatus.state !== 'ready' && (
          <div className="road-heat-message" role="status">
            {streetPinStatus.state === 'loading' && 'Memuat pin jalan…'}
            {streetPinStatus.state === 'empty' && 'Belum ada ruas jalan dengan lubang aktif di area ini.'}
            {streetPinStatus.state === 'error' && 'Pin jalan gagal dimuat. Coba tekan Perbarui.'}
          </div>
        )}

        <div className="map-controls" aria-label="Kontrol peta">
          <button
            type="button"
            className="map-recenter-button"
            onClick={handleRecenter}
            aria-label="Pusatkan peta kembali ke Universitas Gadjah Mada"
            title="Pusatkan peta"
          >
            <MapPinned size={18} />
          </button>
          {(showMarkers || (showStreetPins && streetPinStatus.config)) && (
          <div className="map-legend" aria-label="Keterangan peta">
            {showMarkers && (
              <div className="marker-legend" aria-label="Keterangan status laporan">
                <span className="map-legend-title">Status laporan</span>
                <div className="map-legend-items">
                  <span className="legend-item">
                    <i className="legend-dot dot-active" />
                    Aktif
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot dot-progress" />
                    Sedang diproses
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot dot-repaired" />
                    Selesai
                  </span>
                </div>
              </div>
            )}
            {showStreetPins && <StreetPinLegend config={streetPinStatus.config} />}
          </div>
          )}
        </div>
      </div>
      

      {selectedPothole && (
        <aside className="map-selection-banner" aria-label="Detail laporan terpilih">
          <div className="selection-left">
            <div className="selection-id-badge">#{selectedPothole.id}</div>
            <div className="selection-info">
              <span className="selection-kicker">LAPORAN TERPILIH</span>
              <span className="selection-title">Pothole #{selectedPothole.id}</span>
              <span className="selection-coords">
                <MapPin size={13} aria-hidden="true" />
                {selectedPothole.location_name || 'Lokasi tidak diketahui'}
              </span>
            </div>
          </div>

          <div className="selection-actions">
            <span className={`status-pill status-${selectedPothole.status}`}>
              <i className="status-pill-dot" aria-hidden="true" />
              {getStatusLabel(selectedPothole.status)}
            </span>

            <button
              type="button"
              className="btn-detail"
              onClick={() => onOpenDetail(selectedPothole)}
            >
              Lihat detail <ArrowUpRight size={16} />
            </button>

            <button
              type="button"
              className="btn-close-banner"
              onClick={onCloseSelection}
              aria-label="Tutup detail laporan terpilih"
              title="Tutup"
            >
              <X size={18} />
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
