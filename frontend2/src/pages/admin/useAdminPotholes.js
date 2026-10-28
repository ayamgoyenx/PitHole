import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '../../api';

const API_URL = apiUrl('/api/v1/potholes');

export default function useAdminPotholes() {
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API_URL);
      const payload = await response.json();
      if (!response.ok) throw new Error('Gagal memuat laporan lubang.');
      setError('');
      setPotholes(Array.isArray(payload.potholes) ? payload.potholes : []);
      setLastUpdated(new Date());
    } catch (requestError) {
      setError(requestError.message || 'Tidak dapat terhubung ke server PitHole.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const updateStatus = async (id, status) => {
    const response = await fetch(`${API_URL}/${id}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error('Gagal memperbarui status laporan.');
    setPotholes((current) => current.map((item) => item.id === id ? payload.pothole : item));
    setLastUpdated(new Date());
    return payload.pothole;
  };

  return { potholes, loading, error, lastUpdated, refresh, updateStatus };
}
