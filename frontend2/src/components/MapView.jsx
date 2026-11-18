import { useCallback, useState } from 'react';
import { MapContainer, TileLayer, Marker, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import { ArrowUpRight, X } from 'lucide-react';
import StreetPinLayer from './StreetPinLayer';
import StreetPinLegend from './StreetPinLegend';
import DeviceLocation from './DeviceLocation';
import { useI18n } from '../locale';
import { hasCoordinates, STATUS_TEXT } from '../utils/display';

function markerIcon(item) {
  const status = Object.hasOwn(STATUS_TEXT, item.status) ? item.status : 'active';
  return L.divIcon({ html: `<div class="custom-pin-marker"><div class="pin-head pin-${status}"><span class="pin-number">${Number(item.id)}</span></div></div>`, className: '', iconSize: [36,48], iconAnchor: [18,48] });
}
export default function MapView({ potholes, selectedPothole, onSelectPothole, onOpenDetail, onCloseSelection, heatRefreshKey }) {
  const { t } = useI18n();
  const [locationControls, setLocationControls] = useState(null);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showStreetPins, setShowStreetPins] = useState(true);
  const [streetPinStatus, setStreetPinStatus] = useState({ state: 'loading', config: null });
  const handleStatus = useCallback(status => setStreetPinStatus(status), []);
  return <section className="map-card-container" aria-label={t('Peta laporan jalan berlubang')}>
    <div className="map-location-bar" ref={setLocationControls} />
    <div className="leaflet-map-wrapper">
      <MapContainer center={[-7.7702,110.3778]} zoom={16} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ScaleControl position="bottomleft" metric imperial={false} />
        <StreetPinLayer enabled={showStreetPins} refreshKey={heatRefreshKey} onStatusChange={handleStatus} />
        {showMarkers && potholes.filter(hasCoordinates).map(item => <Marker key={item.id} position={[Number(item.lat),Number(item.lon)]}
          icon={markerIcon(item)} title={`${t('Lubang')} #${item.id} - ${t(STATUS_TEXT[item.status])}`}
          eventHandlers={{ click: () => onSelectPothole(item) }} />)}
        <DeviceLocation controlsContainer={locationControls} />
      </MapContainer>
      <div className="map-layer-toggles" role="group" aria-label={t('Lapisan peta')}>
        <button type="button" className={`map-layer-toggle${showMarkers ? ' active' : ''}`} aria-pressed={showMarkers} onClick={() => setShowMarkers(value => !value)}>{t('Marker lubang')}</button>
        <button type="button" className={`map-layer-toggle${showStreetPins ? ' active' : ''}`} aria-pressed={showStreetPins} onClick={() => setShowStreetPins(value => !value)}>{t('Pin jalan')}</button>
      </div>
    {showStreetPins && streetPinStatus.state !== 'ready' && <p className="road-heat-message" role="status">
      {streetPinStatus.state === 'loading' && t('Memuat pin jalan…')}
      {streetPinStatus.state === 'empty' && t('Belum ada pin jalan di area ini.', 'No road pins in this area yet.')}
      {streetPinStatus.state === 'error' && t('Pin jalan gagal dimuat. Coba tekan Perbarui.')}
    </p>}
    {(showMarkers || (showStreetPins && streetPinStatus.config)) && <div className="map-controls">
      <div className={`map-legend${legendExpanded ? ' is-expanded' : ''}`} aria-label={t('Keterangan peta')}>
        <button type="button" className="mobile-legend-toggle" aria-expanded={legendExpanded} onClick={() => setLegendExpanded(value => !value)}>{t('Keterangan peta')} <span aria-hidden="true">{legendExpanded ? '−' : '+'}</span></button>
        {showMarkers && <div className="marker-legend"><span className="map-legend-title">{t('Status laporan')}</span>
          <div className="map-legend-items">{Object.entries(STATUS_TEXT).map(([key, value]) => <span className="legend-item" key={key}><i className={`legend-dot dot-${key === 'active' ? 'active' : key === 'repaired' ? 'repaired' : 'progress'}`} />{t(value)}</span>)}</div>
        </div>}
        {showStreetPins && <StreetPinLegend config={streetPinStatus.config} />}
      </div>
    </div>}
    </div>
    {selectedPothole && <aside className="map-selection-banner" aria-label={t('Detail laporan terpilih')}>
      <div className="selection-info"><strong>{t('Lubang')} #{selectedPothole.id}</strong><span>{selectedPothole.location_name || selectedPothole.street_name || t('Nama lokasi belum tersedia')}</span></div>
      <div className="selection-actions"><span className={`status-pill status-${selectedPothole.status}`}>{t(STATUS_TEXT[selectedPothole.status])}</span>
        <button className="btn-detail" onClick={() => onOpenDetail(selectedPothole)}>{t('Lihat detail')}<ArrowUpRight size={16} /></button>
        <button className="btn-close-banner" onClick={onCloseSelection} aria-label={t('Tutup detail laporan terpilih')}><X size={18} /></button>
      </div>
    </aside>}
  </section>;
}
