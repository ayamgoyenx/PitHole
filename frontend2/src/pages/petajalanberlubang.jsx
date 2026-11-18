import { useRef, useState } from 'react';
import { CircleAlert, CircleCheckBig, Clock3, RefreshCw } from 'lucide-react';
import Navbar from '../components/Navbar';
import MapView from '../components/MapView';
import PotholeList from '../components/PotholeList';
import PotholeDetail from '../components/PotholeDetail';
import SyncStatus from '../components/SyncStatus';
import usePotholes from '../hooks/usePotholes';
import { useI18n } from '../locale';

export default function PetaJalanBerlubang() {
  const { t } = useI18n();
  const data = usePotholes();
  const { potholes, loading, refreshing, error, lastUpdated, revision, refresh } = data;
  const [selectedId, setSelectedId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('');
  const returnFocus = useRef(null);
  const listHeading = useRef(null);
  const selected = potholes.find(item => item.id === selectedId) || null;
  const detail = potholes.find(item => item.id === detailId) || null;
  const filtered = activeFilter ? potholes.filter(item => item.status === activeFilter) : potholes;
  const openDetail = item => {
    returnFocus.current = document.activeElement;
    setSelectedId(item.id); setDetailId(item.id);
  };
  const closeDetail = () => {
    setDetailId(null);
    requestAnimationFrame(() => {
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
      else (document.getElementById(`pothole-card-${detailId}`) || listHeading.current)?.focus();
    });
  };
  const stats = [['active', 'Aktif', CircleAlert], ['in_progress', 'Sedang diperbaiki', Clock3], ['repaired', 'Selesai', CircleCheckBig]];
  return <div className="public-map-page">
    <Navbar />
    <main className="public-map-main">
      <section className="public-map-heading"><div className="map-heading-copy">
        <h1 className="map-heading-title">{t('Peta Jalan Berlubang')}</h1>
        <p className="map-heading-description">{t('Pantau lokasi laporan dan status penanganan jalan dalam satu peta.')}</p>
      </div><div className="public-map-heading-actions">
        <button className="public-map-refresh" disabled={refreshing} onClick={refresh}><RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />{t(refreshing ? 'Memuat…' : 'Perbarui')}</button>
        <SyncStatus {...data} />
      </div></section>
      <section className="map-panel-header-recaphole" aria-label={t('Ringkasan status laporan')}>
        <h2 className="recaphole-header-title">{t('Ringkasan Jalan Berlubang')}</h2>
        <div className="public-map-stats" aria-busy={loading}>
          {stats.map(([key, label, Icon]) => <div key={key}><Icon size={20} /><span>{t(label)}</span><strong>{lastUpdated ? potholes.filter(item => item.status === key).length : '—'}</strong></div>)}
          <div className="public-map-stat-total"><span>{t('Total lokasi lubang')}</span><strong>{lastUpdated ? potholes.length : '—'}</strong></div>
        </div>
      </section>
      {error && <div className="public-map-error" role="alert">{t(error)} {lastUpdated && t('Data terakhir tetap ditampilkan.')} <button onClick={refresh} disabled={refreshing}>{t('Coba lagi')}</button></div>}
      {detailId != null ? <section className="public-map-detail">
        {detail ? <PotholeDetail pothole={detail} onBack={closeDetail} /> : <><p>{t('Laporan ini tidak lagi tersedia.')}</p><button className="btn-back-pill" onClick={closeDetail}>{t('Kembali')}</button></>}
      </section> : <>
        <MapView potholes={filtered} selectedPothole={selected} onSelectPothole={item => setSelectedId(item.id)}
          onOpenDetail={openDetail} onCloseSelection={() => setSelectedId(null)} heatRefreshKey={revision} />
        <PotholeList potholes={potholes} loading={loading} error={error} hasLoaded={!!lastUpdated} headingRef={listHeading}
          activeFilter={activeFilter} onFilterChange={value => { setActiveFilter(value); setSelectedId(null); }} onSelectPothole={openDetail} />
      </>}
    </main>
  </div>;
}
