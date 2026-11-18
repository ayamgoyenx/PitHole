import { Clock3 } from 'lucide-react';
import { useI18n } from '../locale';
import { formatTimestamp } from '../utils/display';

export default function SyncStatus({ lastDeviceSync, lastUpdated, error, loading }) {
  const { t, locale } = useI18n();
  const unavailable = Boolean(error) || (!loading && !lastUpdated);
  return <div className={`sync-status${error ? ' is-stale' : ''}`}>
    <div><Clock3 size={16} aria-hidden="true" /><span>{t('Sinkronisasi terakhir', 'Last synchronization')}: <strong>
      {loading ? t('Memeriksa sinkronisasi…', 'Checking synchronization…') : lastDeviceSync ? formatTimestamp(lastDeviceSync, locale) : unavailable ? t('Belum dapat diperiksa', 'Unable to check') : t('Waktu unggahan belum tersedia', 'Upload time not available')}
    </strong></span></div>
    {lastUpdated && <small>{`${t('Halaman diperbarui')}: ${formatTimestamp(lastUpdated, locale)}`}</small>}
    {!loading && unavailable && <small>{lastDeviceSync
      ? t('Pemeriksaan terbaru gagal. Waktu di atas adalah catatan terakhir yang berhasil dimuat.', 'The latest check failed. The time above is the last successfully retrieved record.')
      : t('Data backend belum berhasil diambil, sehingga status sinkronisasi alat belum dapat dipastikan.', 'Backend data could not be retrieved, so device synchronization status cannot be determined.')}</small>}
  </div>;
}
