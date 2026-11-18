export function hasCoordinates(item) {
  return item?.lat != null && item?.lon != null && String(item.lat).trim() !== '' && String(item.lon).trim() !== ''
    && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))
    && Math.abs(Number(item.lat)) <= 90 && Math.abs(Number(item.lon)) <= 180;
}
export function formatTimestamp(value, locale = 'id', dateOnly = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
  }).format(new Date(value)) + (dateOnly ? '' : ' WIB');
}
export function deviceSyncTimestamp(payload) {
  const value = payload?.sync?.last_device_sync_at;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
export const STATUS_TEXT = { active: 'Aktif', in_progress: 'Sedang diperbaiki', repaired: 'Selesai' };
