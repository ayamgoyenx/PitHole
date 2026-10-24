import React from 'react';
import { Activity, CheckCircle2, Clock3, Gauge, MapPin, RefreshCw, Route, Wrench, TriangleAlert } from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminRoadMap from './AdminRoadMap';
import useAdminPotholes from './useAdminPotholes';
import useRoadHeat from './useRoadHeat';
import { LEVEL_LABEL } from './theme';

function averageRepairHours(potholes) {
  const durations = potholes
    .filter((item) => item.status === 'repaired' && item.first_detected_at && item.repaired_at)
    .map((item) => (new Date(item.repaired_at) - new Date(item.first_detected_at)) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  if (!durations.length) return { average: null, count: 0 };
  return { average: durations.reduce((sum, hours) => sum + hours, 0) / durations.length, count: durations.length };
}

function formatDuration(hours) {
  if (hours === null) return 'Belum ada data';
  return hours < 24 ? `${hours.toFixed(1)} jam` : `${(hours / 24).toFixed(1)} hari`;
}

export default function AdminDashboard() {
  const { potholes, loading, error, lastUpdated, refresh } = useAdminPotholes();
  const { roads, loading: roadsLoading, error: roadsError } = useRoadHeat(lastUpdated?.getTime());

  const counts = {
    active: potholes.filter((item) => item.status === 'active').length,
    in_progress: potholes.filter((item) => item.status === 'in_progress').length,
    repaired: potholes.filter((item) => item.status === 'repaired').length,
  };
  const severeRoads = roads.filter((road) => road.level === 'severe').length;
  const midRoads = roads.filter((road) => road.level === 'mid').length;
  const totalRoadsWithHoles = new Set(potholes.map((item) => item.segment_id).filter((id) => id != null)).size;
  const response = averageRepairHours(potholes);
  const dash = (value) => (loading ? '—' : value);

  return (
    <AdminLayout activePath="/admin-dashboard" eyebrow="Dashboard">
      <main className="admin-content">
        <div className="admin-page-heading">
          <div>
            <div className="admin-eyebrow">Ringkasan operasional</div>
            <h1 className="admin-title">Dashboard</h1>
            <p className="admin-subtitle">Kondisi ruas jalan, status penanganan, dan waktu respons perbaikan.</p>
          </div>
          <div className="admin-heading-actions">
            <button className="admin-button" type="button" onClick={refresh}>
              <RefreshCw size={14} /> Perbarui data
            </button>
            <div className="admin-sync-badge" title="Waktu sinkronisasi data terakhir">
              <Clock3 size={15} aria-hidden="true" />
              <span>Data terakhir tersinkronisasi {lastUpdated ? lastUpdated.toLocaleTimeString('id-ID') : 'belum tersedia'}</span>
            </div>
          </div>
        </div>

        {(error || roadsError) && <div className="admin-notice" role="alert">Terjadi kesalahan saat memuat data. Silakan coba lagi nanti.</div>}

        <section className="admin-stat-grid admin-stat-grid-3" aria-label="Ringkasan ruas jalan">
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>Ruas Parah</span><span className="admin-stat-icon admin-icon-severe"><TriangleAlert size={16} /></span></div>
            <div className="admin-stat-value">{roadsLoading ? '—' : severeRoads}</div>
            <div className="admin-stat-note">Kurang dari 45 m jalan per lubang</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>Ruas Sedang</span><span className="admin-stat-icon admin-icon-mid"><TriangleAlert size={16} /></span></div>
            <div className="admin-stat-value">{roadsLoading ? '—' : midRoads}</div>
            <div className="admin-stat-note">Ruas dengan lubang aktif tingkat sedang</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>Total Ruas Berlubang</span><span className="admin-stat-icon"><Route size={16} /></span></div>
            <div className="admin-stat-value">{dash(totalRoadsWithHoles)}</div>
            <div className="admin-stat-note">Semua ruas yang memiliki lubang tercatat</div>
          </article>
        </section>

        <section className="admin-stat-grid" aria-label="Ringkasan status lubang">
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>Aktif</span><span className="admin-stat-icon"><Activity size={16} /></span></div>
            <div className="admin-stat-value">{dash(counts.active)}</div>
            <div className="admin-stat-note">Lubang yang belum ditangani</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>Sedang diproses</span><span className="admin-stat-icon"><Wrench size={16} /></span></div>
            <div className="admin-stat-value">{dash(counts.in_progress)}</div>
            <div className="admin-stat-note">Sedang dalam perbaikan</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>Selesai</span><span className="admin-stat-icon"><CheckCircle2 size={16} /></span></div>
            <div className="admin-stat-value">{dash(counts.repaired)}</div>
            <div className="admin-stat-note">Lubang yang sudah diperbaiki</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>Total Lubang</span><span className="admin-stat-icon"><MapPin size={16} /></span></div>
            <div className="admin-stat-value">{dash(potholes.length)}</div>
            <div className="admin-stat-note">Seluruh lubang tercatat</div>
          </article>
        </section>

        <section className="admin-panel admin-response" aria-label="Waktu respons">
          <span className="admin-stat-icon"><Gauge size={18} /></span>
          <div>
            <div className="admin-stat-note admin-response-title">Waktu Respons Rata-rata</div>
            <div className="admin-stat-value admin-response-value">{loading ? '—' : formatDuration(response.average)}</div>
          </div>
          <p className="admin-panel-description">
            Rata-rata waktu dari lubang pertama kali terdeteksi hingga berstatus selesai, berdasarkan {response.count} perbaikan.
          </p>
        </section>

        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2 className="admin-panel-title">Peta Ruas Berlubang</h2>
              <div className="admin-map-legend">
                <span><i className="admin-status-dot admin-dot-severe" />Parah</span>
                <span><i className="admin-status-dot admin-dot-mid" />Sedang</span>
              </div>
            </div>
            {roadsLoading ? <div className="admin-empty">Memuat peta…</div> : <AdminRoadMap roads={roads} className="admin-map-tall" />}
          </section>

          <section className="admin-panel admin-road-panel">
            <div className="admin-panel-heading">
              <h2 className="admin-panel-title">Daftar Ruas Jalan</h2>
              <span className="admin-panel-description">{roads.length} ruas</span>
            </div>
            <ol className="admin-road-list">
              {roads.map((road) => (
                <li className="admin-road-item" key={road.id}>
                  <span className={`admin-road-badge ${road.level}`}>{LEVEL_LABEL[road.level]}</span>
                  <span className="admin-road-name">{road.name}</span>
                  <span className="admin-road-count">{road.holes} lubang</span>
                </li>
              ))}
            </ol>
            {!roadsLoading && !roads.length && <p className="admin-empty">Belum ada ruas dengan lubang aktif.</p>}
          </section>
        </div>
      </main>
    </AdminLayout>
  );
}
