import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, CircleMarker, Popup, useMap } from 'react-leaflet';
import { LocateFixed, MapPinned } from 'lucide-react';
import { useI18n } from '../locale';
import { hasCoordinates } from '../utils/display';

// Requested only on click; no separate user-location persistence. Map viewport requests still apply.
export default function DeviceLocation({ controlsContainer }) {
  const map = useMap();
  const { t } = useI18n();
  const [position, setPosition] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const locate = () => {
    if (pending.current) return;
    setError('');
    if (!window.isSecureContext || !navigator.geolocation) {
      setError('Lokasi perangkat tidak tersedia. Buka melalui HTTPS atau geser peta secara manual.'); return;
    }
    pending.current = true; setBusy(true);
    navigator.geolocation.getCurrentPosition(result => {
      pending.current = false;
      if (!active.current) return;
      setBusy(false);
      const next = { lat: result.coords.latitude, lon: result.coords.longitude, accuracy: result.coords.accuracy };
      if (!hasCoordinates(next)) { setError('Lokasi belum ditemukan. Coba lagi di area terbuka.'); return; }
      setPosition(next);
      map.flyTo([next.lat, next.lon], 16, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    }, failure => {
      pending.current = false;
      if (!active.current) return;
      setBusy(false);
      setError(failure.code === 1 ? 'Izin lokasi ditolak. Izinkan lokasi di pengaturan browser atau geser peta secara manual.'
        : failure.code === 3 ? 'Pencarian lokasi terlalu lama. Coba lagi.' : 'Lokasi belum ditemukan. Coba lagi di area terbuka.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  const controls = <div className="device-location-control" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      <button type="button" className="location-primary" onClick={locate} disabled={busy} aria-label={t('Pusatkan ke lokasi saya')}>
        <LocateFixed size={18} aria-hidden="true" />{busy ? t('Mencari lokasi…') : t('Lokasi saya')}
      </button>
      <button type="button" onClick={() => map.flyTo([-7.7702, 110.3778], 16)} title={t('Lihat area UGM')} aria-label={t('Lihat area UGM')}><MapPinned size={18} /></button>
      {error && <div className="location-message" role="alert">{t(error)}</div>}
      {position && !error && <div className="location-accuracy" role="status">{t('Perkiraan akurasi')}: ±{Math.round(position.accuracy)} m</div>}
    </div>;
  return <>
    {controlsContainer ? createPortal(controls, controlsContainer) : controls}
    {position && <>
      {Number.isFinite(position.accuracy) && <Circle center={[position.lat, position.lon]} radius={position.accuracy} interactive={false} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: .08 }} />}
      <CircleMarker center={[position.lat, position.lon]} radius={8} pathOptions={{ color: 'white', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}><Popup>{t('Lokasi perangkat Anda')}</Popup></CircleMarker>
    </>}
  </>;
}
