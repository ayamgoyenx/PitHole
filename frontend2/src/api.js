// Same-origin proxy for development; set VITE_API_URL for a separate backend.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const apiUrl = (path) => `${API_BASE}${path}`;

export async function readJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(response.status === 401 || response.status === 403 ? 'Sesi berakhir. Silakan masuk kembali.' : 'Permintaan gagal. Silakan coba lagi.');
    error.status = response.status;
    throw error;
  }
  if (!payload || payload.status === 'error') throw new Error('Respons server tidak valid.');
  return payload;
}
