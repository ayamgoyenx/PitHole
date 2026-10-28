import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Pane, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LEVEL_COLORS, LEVEL_LABELS } from './streetPinConstants';
import { apiUrl } from '../api';

const REFRESH_MS = 30000;
const MOVE_DEBOUNCE_MS = 300;

function createStreetPinIcon(pin) {
  const color = LEVEL_COLORS[pin.level] || LEVEL_COLORS.safe;
  const html = `
    <div class="street-pin" style="--street-pin-color:${color}">
      <span class="street-pin-head"><b>${Number(pin.hole_count) || 0}</b></span>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [34, 44], iconAnchor: [17, 44], popupAnchor: [0, -40] });
}

function formatNumber(value, digits) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
}

export default function StreetPinLayer({ enabled, refreshKey, onStatusChange }) {
  const map = useMap();
  const [pins, setPins] = useState([]);
  const controllerRef = useRef(null);
  const statusRef = useRef(onStatusChange);

  useEffect(() => {
    statusRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!enabled) {
      statusRef.current({ state: 'disabled', config: null });
      return undefined;
    }

    let timer = null;
    let firstLoad = true;

    const load = () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const bounds = map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',');
      if (firstLoad) statusRef.current({ state: 'loading', config: null });

      fetch(apiUrl(`/api/v1/street-pins?bbox=${encodeURIComponent(bbox)}`), { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || 'Gagal memuat pin jalan.');
          if (controller.signal.aborted) return;
          firstLoad = false;
          setPins(Array.isArray(payload.pins) ? payload.pins : []);
          statusRef.current({
            state: payload.pins?.length ? 'ready' : 'empty',
            config: payload.config || null,
          });
        })
        .catch((error) => {
          if (error.name === 'AbortError' || controller.signal.aborted) return;
          statusRef.current({ state: 'error', config: null });
        });
    };

    const onMoveEnd = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, MOVE_DEBOUNCE_MS);
    };

    load();
    map.on('moveend', onMoveEnd);
    const interval = window.setInterval(load, REFRESH_MS);

    return () => {
      map.off('moveend', onMoveEnd);
      window.clearTimeout(timer);
      window.clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, [enabled, refreshKey, map]);

  const markers = useMemo(
    () => pins.filter((pin) => Number.isFinite(Number(pin.lat)) && Number.isFinite(Number(pin.lon))),
    [pins]
  );

  if (!enabled || !markers.length) return null;

  return (
    <Pane name="street-pins" style={{ zIndex: 650 }}>
      {markers.map((pin) => (
        <Marker
          key={`${pin.location_key}-${pin.level}-${pin.hole_count}`}
          position={[Number(pin.lat), Number(pin.lon)]}
          icon={createStreetPinIcon(pin)}
          pane="street-pins"
        >
          <Popup>
            <div className="street-pin-popup">
              <strong>{pin.location_name || 'Lokasi tidak diketahui'}</strong>
              <span className={`street-pin-level ${pin.level}`}>{LEVEL_LABELS[pin.level] || pin.level}</span>
              <div>{pin.hole_count} lubang aktif</div>
              <div>Panjang ruas: {formatNumber(pin.length_m, 0)} m</div>
              <div>Kepadatan: {formatNumber(pin.density_per_100m, 2)} lubang / 100 m</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </Pane>
  );
}
