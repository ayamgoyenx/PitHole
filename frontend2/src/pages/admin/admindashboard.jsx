import { useI18n } from '../../locale';
import SyncStatus from '../../components/SyncStatus';
import React from 'react';
import { Activity, CheckCircle2, Gauge, MapPin, RefreshCw, Route, Wrench, TriangleAlert } from 'lucide-react';
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

function formatDuration(hours, t) {
  if (hours === null) return t('Belum ada data');
  return hours < 24 ? `${hours.toFixed(1)} ${t('jam')}` : `${(hours / 24).toFixed(1)} ${t('hari')}`;
}

export default function AdminDashboard() {
  const { t } = useI18n();
  const data = useAdminPotholes();
  const { potholes, refreshing, error, lastUpdated, refresh } = data;
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
  const dash = (value) => (!lastUpdated ? '—' : value);

  return (
    <AdminLayout activePath="/admin-dashboard" eyebrow="Dashboard">
      <main className="admin-content">
        <div className="admin-page-heading">
          <div>
            <div className="admin-eyebrow">{t("Ringkasan operasional")}</div>
            <h1 className="admin-title">Dashboard</h1>
            <p className="admin-subtitle">{t("Kondisi ruas jalan, status penanganan, dan waktu respons perbaikan.")}</p>
          </div>
          <div className="admin-heading-actions">
            <button className="admin-button" type="button" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={14} />{t("Perbarui data")}</button>
            <SyncStatus {...data} />
          </div>
        </div>

        {(error || roadsError) && <div className="admin-notice" role="alert">{t("Terjadi kesalahan saat memuat data. Silakan coba lagi nanti.")}</div>}

        <section className="admin-stat-grid admin-stat-grid-3" aria-label={t("Ringkasan ruas jalan")}>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>{t("Ruas Parah")}</span><span className="admin-stat-icon admin-icon-severe"><TriangleAlert size={16} /></span></div>
            <div className="admin-stat-value">{roadsLoading || roadsError ? '—' : severeRoads}</div>
            <div className="admin-stat-note">{t("Kategori parah sesuai ambang kepadatan pin jalan")}</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>{t("Ruas Sedang")}</span><span className="admin-stat-icon admin-icon-mid"><TriangleAlert size={16} /></span></div>
            <div className="admin-stat-value">{roadsLoading || roadsError ? '—' : midRoads}</div>
            <div className="admin-stat-note">{t("Ruas dengan lubang aktif tingkat sedang")}</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>{t("Total Ruas Berlubang")}</span><span className="admin-stat-icon"><Route size={16} /></span></div>
            <div className="admin-stat-value">{dash(totalRoadsWithHoles)}</div>
            <div className="admin-stat-note">{t("Semua ruas yang memiliki lubang tercatat")}</div>
          </article>
        </section>

        <section className="admin-stat-grid" aria-label={t("Ringkasan status lubang")}>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>{t("Aktif")}</span><span className="admin-stat-icon"><Activity size={16} /></span></div>
            <div className="admin-stat-value">{dash(counts.active)}</div>
            <div className="admin-stat-note">{t("Lubang yang belum ditangani")}</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>{t("Sedang diproses")}</span><span className="admin-stat-icon"><Wrench size={16} /></span></div>
            <div className="admin-stat-value">{dash(counts.in_progress)}</div>
            <div className="admin-stat-note">{t("Sedang dalam perbaikan")}</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>{t("Selesai")}</span><span className="admin-stat-icon"><CheckCircle2 size={16} /></span></div>
            <div className="admin-stat-value">{dash(counts.repaired)}</div>
            <div className="admin-stat-note">{t("Lubang yang sudah diperbaiki")}</div>
          </article>
          <article className="admin-stat-card">
            <div className="admin-stat-top"><span>{t("Total Lubang")}</span><span className="admin-stat-icon"><MapPin size={16} /></span></div>
            <div className="admin-stat-value">{dash(potholes.length)}</div>
            <div className="admin-stat-note">{t("Seluruh lubang tercatat")}</div>
          </article>
        </section>

        <section className="admin-panel admin-response" aria-label={t("Waktu respons")}>
          <span className="admin-stat-icon"><Gauge size={18} /></span>
          <div>
            <div className="admin-stat-note admin-response-title">{t("Waktu Respons Rata-rata")}</div>
            <div className="admin-stat-value admin-response-value">{!lastUpdated ? '—' : formatDuration(response.average, t)}</div>
          </div>
          <p className="admin-panel-description">
            {t('Rata-rata sejak deteksi pertama hingga selesai. Jumlah perbaikan')}: {response.count}.
          </p>
        </section>

        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2 className="admin-panel-title">{t("Peta Ruas Berlubang")}</h2>
              <div className="admin-map-legend">
                <span><i className="admin-status-dot admin-dot-severe" />{t("Parah")}</span>
                <span><i className="admin-status-dot admin-dot-mid" />{t("Sedang")}</span>
              </div>
            </div>
            {roadsLoading ? <div className="admin-empty">{t("Memuat peta…")}</div> : <AdminRoadMap roads={roads} className="admin-map-tall" />}
          </section>

          <section className="admin-panel admin-road-panel">
            <div className="admin-panel-heading">
              <h2 className="admin-panel-title">{t("Daftar Ruas Jalan")}</h2>
              <span className="admin-panel-description">{roads.length} {t('ruas')}</span>
            </div>
            <ol className="admin-road-list">
              {roads.map((road) => (
                <li className="admin-road-item" key={road.id}>
                  <span className={`admin-road-badge ${road.level}`}>{t(LEVEL_LABEL[road.level])}</span>
                  <span className="admin-road-name">{road.name}</span>
                  <span className="admin-road-count">{road.holes} {t('lubang')}</span>
                </li>
              ))}
            </ol>
            {!roadsLoading && !roadsError && !roads.length && <p className="admin-empty">{t("Belum ada ruas dengan lubang aktif.")}</p>}
          </section>
        </div>
      </main>
    </AdminLayout>
  );
}
