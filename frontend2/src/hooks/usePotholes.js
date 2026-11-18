import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, readJson } from '../api';
import { deviceSyncTimestamp } from '../utils/display';

export default function usePotholes() {
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastDeviceSync, setLastDeviceSync] = useState(null);
  const [revision, setRevision] = useState(0);
  const request = useRef(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (saving.current || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    const timeout = setTimeout(() => controller.abort('timeout'), 20000);
    try {
      const payload = await readJson(await fetch(apiUrl('/api/v1/potholes'), { cache: 'no-store', signal: controller.signal }));
      if (!Array.isArray(payload.potholes)) throw new Error('Respons server tidak valid.');
      if (controller.signal.aborted || !mounted.current) return;
      setPotholes(payload.potholes);
      setLastDeviceSync(deviceSyncTimestamp(payload));
      setLastUpdated(new Date());
      setRevision(value => value + 1);
      setError('');
    } catch {
      if (mounted.current && (!controller.signal.aborted || controller.signal.reason === 'timeout')) {
        setError('Data terbaru gagal dimuat. Periksa koneksi lalu coba lagi.');
      }
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) { setRefreshing(false); setLoading(false); }
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 30000);
    return () => { mounted.current = false; clearTimeout(initial); clearInterval(timer); request.current?.abort(); request.current = null; };
  }, [refresh]);

  const updateStatus = useCallback(async (id, status) => {
    if (saving.current) throw new Error('Perubahan sedang disimpan.');
    saving.current = true;
    request.current?.abort(); request.current = null;
    setRefreshing(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const payload = await readJson(await fetch(apiUrl(`/api/v1/potholes/${id}/status`), {
        method: 'PATCH', credentials: 'include', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      }));
      if (!payload.pothole || payload.pothole.id !== id || payload.pothole.status !== status) throw new Error('Respons server tidak valid.');
      if (mounted.current) {
        setPotholes(current => current.map(item => item.id === id ? payload.pothole : item));
        setRevision(value => value + 1);
      }
      return payload.pothole;
    } finally { clearTimeout(timeout); saving.current = false; }
  }, []);
  return { potholes, loading, refreshing, error, lastUpdated, lastDeviceSync, revision, refresh, updateStatus };
}
