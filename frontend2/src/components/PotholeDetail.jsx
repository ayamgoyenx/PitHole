import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useI18n } from '../locale';
import { formatTimestamp, hasCoordinates, STATUS_TEXT } from '../utils/display';
export default function PotholeDetail({ pothole, onBack }) {
  const { t, locale } = useI18n();
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [pothole?.id]);
  if (!pothole) return null;
  const coordinates = hasCoordinates(pothole);
  const methods = Array.isArray(pothole.validation_methods) ? [...new Set(pothole.validation_methods.filter(value => typeof value === 'string'))] : [];
  return <div className="detail-page-container">
    <button className="btn-back-pill" onClick={onBack}><ArrowLeft size={18} />{t('Kembali')}</button>
    <div className="detail-header-bar"><div><h2 className="detail-title" ref={heading} tabIndex={-1}>{t('Lubang')} #{pothole.id}</h2><p>{t('Detail Informasi')}</p></div>
      <span className={`status-pill status-${pothole.status}`}>{t(STATUS_TEXT[pothole.status] || 'Status tidak diketahui')}</span></div>
    <div className="detail-grid"><section className="dashboard-card detail-left-card"><h3>{t('Detail Lokasi Lubang')}</h3>
      {coordinates ? <div className="mini-map-box"><MapContainer key={`${pothole.id}-${pothole.lat}-${pothole.lon}`} center={[Number(pothole.lat),Number(pothole.lon)]} zoom={17} scrollWheelZoom={false} style={{height:'100%',width:'100%'}}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CircleMarker center={[Number(pothole.lat),Number(pothole.lon)]} radius={9} />
      </MapContainer></div> : <p>{t('Lokasi peta tidak tersedia.')}</p>}
      <p><strong>{t('Lokasi')}:</strong> {pothole.location_name || pothole.street_name || t('Nama lokasi belum tersedia')}</p>
      {coordinates && <p className="detail-coordinate">{Number(pothole.lat).toFixed(6)}, {Number(pothole.lon).toFixed(6)}</p>}
      <p>{t('Jumlah laporan')}: <strong>{pothole.report_count ?? '—'}</strong></p>
      {coordinates && <a className="btn-gmaps" href={`https://www.google.com/maps?q=${Number(pothole.lat)},${Number(pothole.lon)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />{t('Buka di Google Maps')}</a>}
    </section><div className="detail-right-stack">
      <section className="dashboard-card"><h3>{t('Waktu deteksi')}</h3><dl className="detail-times">
        <div><dt>{t('Pertama terdeteksi')}</dt><dd>{formatTimestamp(pothole.first_detected_at,locale)}</dd></div>
        <div><dt>{t('Terakhir terdeteksi')}</dt><dd>{formatTimestamp(pothole.last_detected_at,locale)}</dd></div>
        {pothole.repaired_at && <div><dt>{t('Diperbaiki')}</dt><dd>{formatTimestamp(pothole.repaired_at,locale)}</dd></div>}
      </dl></section>
      <section className="dashboard-card"><h3>{t('Metode yang tercatat')}</h3>
        {methods.length ? methods.map(method => <div className="info-box-pill" key={method}>{method === 'camera' ? t('Deteksi Kamera (FOMO ML)') : method === 'imu' ? t('Konfirmasi IMU (MPU6050 Shock Sensor)') : method}</div>) : <p>{t('Belum tersedia')}</p>}
        <p className="detail-note">{t('Metode ditampilkan sesuai catatan laporan; bukan verifikasi sensor tambahan oleh website.')}</p>
      </section>
    </div></div>
  </div>;
}
