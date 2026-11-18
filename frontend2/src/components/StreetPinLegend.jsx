import { LEVEL_COLORS, LEVEL_LABELS } from './streetPinConstants';
import { useI18n } from '../locale';
export default function StreetPinLegend({ config }) {
  const { t } = useI18n();
  if (!config) return null;
  return <div className="road-heat-legend"><span className="road-heat-legend-title">{t('Pin kondisi jalan')}</span>
    {['severe','medium','safe'].map(level => <span className="legend-item" key={level}><i className="street-pin-dot" style={{background:LEVEL_COLORS[level]}} />
      {t(LEVEL_LABELS[level])} ({level === 'severe' ? `≥ ${config.thresholdA}` : level === 'medium' ? `${config.thresholdB} – < ${config.thresholdA}` : `< ${config.thresholdB}`} {t('lubang / 100 m')})
    </span>)}
  </div>;
}
