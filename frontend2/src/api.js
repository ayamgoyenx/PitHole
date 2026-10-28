// Kosong saat dev (request lewat proxy Vite); berisi URL backend saat production.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const apiUrl = (path) => `${API_BASE}${path}`;
