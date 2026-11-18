import { MapPin, ArrowUpRight } from 'lucide-react';
import { useI18n } from '../locale';
import { STATUS_TEXT } from '../utils/display';
export default function PotholeList({ potholes, activeFilter, onFilterChange, onSelectPothole, loading, error, hasLoaded, headingRef }) {
  const { t } = useI18n();
  const filtered = activeFilter ? potholes.filter(item => item.status === activeFilter) : potholes;
  return <section className="map-panel-header-recaphole report-list-section">
    <div className="report-list-heading"><h2 ref={headingRef} tabIndex={-1}>{t('Daftar laporan lubang')}</h2>
      <label>{t('Filter status')} <select value={activeFilter} onChange={event => onFilterChange(event.target.value)}>
        <option value="">{t('Semua status')}</option>
        {Object.entries(STATUS_TEXT).map(([key, text]) => <option key={key} value={key}>{t(text)}</option>)}
      </select></label>
    </div>
    {loading ? <p role="status" className="state-message">{t('Memuat laporan…')}</p> : !hasLoaded && error ? <p className="state-message">{t('Laporan belum dapat ditampilkan.')}</p> :
      <div className="pothole-list-container">{filtered.map(item => <button type="button" id={`pothole-card-${item.id}`} key={item.id}
        className="pothole-item-card" onClick={() => onSelectPothole(item)}>
        <span className="pothole-item-left"><span className="pothole-item-header"><MapPin size={18} />{t('Lubang')} #{item.id}</span>
          <span className="pothole-item-coords">{item.location_name || item.street_name || t('Nama lokasi belum tersedia')}</span></span>
        <span className={`status-pill status-${item.status}`}>{t(STATUS_TEXT[item.status] || 'Status tidak diketahui')}</span><ArrowUpRight size={18} aria-hidden="true" />
      </button>)}{!filtered.length && <p className="state-message">{t('Tidak ada laporan yang sesuai dengan filter.')}</p>}</div>}
  </section>;
}
