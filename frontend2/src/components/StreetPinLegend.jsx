import React from 'react';
import { LEVEL_COLORS } from './streetPinConstants';

export default function StreetPinLegend({ config }) {
  if (!config) return null;
  const { thresholdA, thresholdB } = config;
  const items = [
    { level: 'severe', label: `Parah (≥ ${thresholdA} lubang / 100 m)` },
    { level: 'medium', label: `Sedang (${thresholdB} – < ${thresholdA} lubang / 100 m)` },
    { level: 'safe', label: `Aman (< ${thresholdB} lubang / 100 m)` },
  ];

  return (
    <div className="road-heat-legend" aria-label="Keterangan pin jalan">
      <span className="road-heat-legend-title">Pin kondisi jalan</span>
      {items.map((item) => (
        <span className="legend-item" key={item.level}>
          <i className="street-pin-dot" style={{ background: LEVEL_COLORS[item.level] }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
