import { useEffect, useState } from 'react';
import { apiUrl } from '../../api';

// Admin hanya menampilkan ruas bermasalah: parah dan sedang (label 'mid' dipertahankan untuk UI admin)
const LEVEL_MAP = { severe: 'severe', medium: 'mid' };
const LEVEL_ORDER = { severe: 0, mid: 1 };

export default function useRoadHeat(refreshKey) {
  const [roads, setRoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl('/api/v1/street-pins?level=severe,medium'), { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error('gagal');
        const list = (payload.pins || [])
          .map((pin) => ({
            id: pin.location_key,
            name: pin.location_name || 'Ruas tanpa nama',
            holes: pin.hole_count,
            level: LEVEL_MAP[pin.level],
            position: [Number(pin.lat), Number(pin.lon)],
          }))
          .filter((road) => road.level && Number.isFinite(road.position[0]) && Number.isFinite(road.position[1]))
          .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.holes - a.holes);
        setRoads(list);
        setError('');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError('Data ruas jalan gagal dimuat.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  return { roads, loading, error };
}
