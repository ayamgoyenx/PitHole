// Warna status mengikuti halaman publik (--status-red / --status-yellow / --status-green di index.css).
export const STATUS_COLORS = {
  active: '#C94B45',
  in_progress: '#F2B705',
  repaired: '#398568',
};

export const STATUS_LABEL = {
  active: 'Aktif',
  in_progress: 'Sedang diproses',
  repaired: 'Selesai',
};

export const LEVEL_LABEL = {
  severe: 'Parah',
  mid: 'Sedang',
};

export const UGM_CENTER = [-7.7702, 110.3778];

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString('id-ID', { dateStyle: 'medium' });
}
