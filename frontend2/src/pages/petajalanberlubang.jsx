import React, { useEffect, useState } from 'react';
import { CircleAlert, CircleCheckBig, Clock3, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import MapView from '../components/MapView';
import PotholeList from '../components/PotholeList';
import PotholeDetail from '../components/PotholeDetail';
import './petajalanberlubang.css';

export default function PetaJalanBerlubang({ lastSyncText = '5 menit yang lalu' }) {
  const navigate = useNavigate();
  const [potholes, setPotholes] = useState([]);
  const [selectedPothole, setSelectedPothole] = useState(null);
  const [detailPothole, setDetailPothole] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [heatRefreshKey, setHeatRefreshKey] = useState(0);

  const fetchPotholes = async () => {
    try {
      const response = await fetch('/api/v1/potholes');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Gagal memuat data lubang.');
      setError('');
      setPotholes(Array.isArray(payload.potholes) ? payload.potholes : []);
      setLastUpdated(new Date());
      setHeatRefreshKey((current) => current + 1);
    } catch (fetchError) {
      setError(fetchError.message || 'Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(fetchPotholes, 0);
    const timer = window.setInterval(fetchPotholes, 30000);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(timer);
    };
  }, []);

  const statusCounts = {
    active: potholes.filter((item) => item.status === 'active').length,
    in_progress: potholes.filter((item) => item.status === 'in_progress').length,
    repaired: potholes.filter((item) => item.status === 'repaired').length,
  };

  const handleOpenDetail = (item) => {
    setDetailPothole(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  return (
    <div className="public-map-page">
      <Navbar onResetToHome={() => navigate('/beranda')} />
      <main className="public-map-main">
        <div className="public-map-heading">
          <header className="map-panel-header-mapview">
            <div className="map-heading">
              <div className="map-heading-copy">
                <h1 className="map-heading-title">Peta Jalan Berlubang</h1>
                <p className="map-heading-description">
                  Pantau lokasi laporan dan status penanganan jalan dalam satu peta.
                </p>
              </div>
              <div className="public-map-heading-actions">
                <button className="public-map-refresh" type="button" onClick={fetchPotholes} disabled={loading}>
                  <RefreshCw size={15} /> Perbarui
                </button>
                <section className="public-map-actions">
                  <div className="sync-badge" title="Waktu sinkronisasi data terakhir">
                    <span className="sync-indicator" aria-hidden="true" />
                    <Clock3 size={15} aria-hidden="true" />
                    <span>Data terakhir tersinkronisasi {lastSyncText}</span>
                  </div>
                </section>
              </div>
            </div>
          </header>
        </div>
        
        <div className="map-panel-header-recaphole">
          <div className="recaphole-header-title">
            Ringkasan Jalan Berlubang
          </div>
          {/* <h2 className="map-heading-title">Ringkasan Data Jalan Berlubang</h2> */}
          <section className="public-map-stats" aria-label="Ringkasan status laporan">
            <div>
              <CircleAlert className="public-map-stat-icon active" />
              <span>Aktif</span>
              <strong>{statusCounts.active}</strong>
            </div>
            <div>
              <Clock3 className="public-map-stat-icon progress" />
              <span>Sedang diperbaiki</span>
              <strong>{statusCounts.in_progress}</strong>
            </div>
            <div>
              <CircleCheckBig className="public-map-stat-icon repaired" />
              <span>Selesai</span>
              <strong>{statusCounts.repaired}</strong>
            </div>
            <div className="public-map-stat-total"><span>Total Laporan Lubang</span><strong>{potholes.length}</strong></div>
          </section>
        </div>
        {/* <section className="public-map-actions">
          <div className="sync-badge" title="Waktu sinkronisasi data terakhir">
                <span className="sync-indicator" aria-hidden="true" />
                <Clock3 size={15} aria-hidden="true" />
                <span>
                  Data terakhir tersinkronisasi {lastSyncText || '5 menit yang lalu'}
                </span>
              </div>
        </section> */}

        {error && <div className="public-map-error" role="alert">{error} Pastikan backend berjalan untuk memuat laporan terbaru.</div>}

        {detailPothole ? (
          <section className="public-map-detail">
            <PotholeDetail pothole={detailPothole} onBack={() => setDetailPothole(null)} />
          </section>
        ) : (
          <>
            <MapView
              potholes={potholes}
              selectedPothole={selectedPothole}
              onSelectPothole={setSelectedPothole}
              onOpenDetail={handleOpenDetail}
              onCloseSelection={() => setSelectedPothole(null)}
              lastSyncText={lastUpdated ? 'Baru saja' : 'Belum tersinkronisasi'}
              heatRefreshKey={heatRefreshKey}
            />
            <PotholeList
              potholes={potholes}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              onSelectPothole={(item) => {
                setSelectedPothole(item);
                handleOpenDetail(item);
              }}
            />
          </>
        )}
      </main>
    </div>

  );
}