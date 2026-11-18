import { useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, CheckCircle2, X } from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminMap from './AdminMap';
import useAdminPotholes from './useAdminPotholes';
import StatusChangeDialog from '../../components/StatusChangeDialog';
import SyncStatus from '../../components/SyncStatus';
import { useI18n } from '../../locale';
import { formatTimestamp, hasCoordinates, STATUS_TEXT } from '../../utils/display';

export default function AdminPitholeMaps() {
  const { t, locale } = useI18n();
  const data = useAdminPotholes();
  const { potholes, loading, refreshing, error, lastUpdated, refresh, updateStatus } = data;
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const heading = useRef(null);
  const locations = useMemo(() => [...new Set(potholes.map(item => item.location_name).filter(Boolean))].sort(),[potholes]);
  const invalidDates = from && to && from > to;
  const visible = useMemo(() => potholes.filter(item => {
    if (invalidDates || (status && item.status !== status) || (location && item.location_name !== location)) return false;
    const time = Date.parse(item.first_detected_at);
    if (from && (!Number.isFinite(time) || time < Date.parse(`${from}T00:00:00+07:00`))) return false;
    if (to && (!Number.isFinite(time) || time > Date.parse(`${to}T23:59:59.999+07:00`))) return false;
    const needle = search.trim().replace(/^#/, '').toLocaleLowerCase();
    return !needle || [item.id,item.location_name,item.street_name,item.lat,item.lon].join(' ').toLocaleLowerCase().includes(needle);
  }),[potholes,status,location,search,from,to,invalidDates]);
  const selected = potholes.find(item => item.id === selectedId);
  const editing = potholes.find(item => item.id === editingId);
  const select = id => { setSelectedId(id); requestAnimationFrame(() => heading.current?.focus()); };
  const onSaved = (id, nextStatus) => { setNotice({ id, status: nextStatus }); setEditingId(null); };
  return <AdminLayout activePath="/admin-pitholemaps" eyebrow="Peta Jalan Berlubang">
    <main className="admin-content">
      <div className="admin-page-heading"><div><div className="admin-eyebrow">{t('Peta dan manajemen laporan')}</div>
        <h1 className="admin-title">{t('Peta Jalan Berlubang')}</h1><p className="admin-subtitle">{t('Pilih laporan, tinjau status baru, lalu konfirmasi perubahan.')}</p></div>
        <div className="admin-heading-actions"><button className="admin-button" disabled={refreshing || Boolean(editing)} onClick={refresh}><RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />{t(refreshing ? 'Memuat…' : 'Perbarui data')}</button><SyncStatus {...data} /></div>
      </div>
      {error && <div className="admin-notice" role="alert">{t(error)} {lastUpdated && t('Data terakhir tetap ditampilkan.')}</div>}
      <div className="admin-map-layout">
        <section className="admin-panel"><div className="admin-panel-heading"><h2 className="admin-panel-title">{t('Peta laporan')}</h2><span>{lastUpdated ? visible.length : '—'} {t('lokasi')}</span></div>
          <AdminMap potholes={visible} className="admin-map-tall" selectedId={selectedId} onSelect={select} />
        </section>
        <section className="admin-panel" aria-labelledby="admin-detail-title"><div className="admin-panel-heading">
          <h2 ref={heading} tabIndex={-1} id="admin-detail-title" className="admin-panel-title">{selected ? `${t('Lubang')} #${selected.id}` : t('Detail Lubang')}</h2>
          {selected && <button className="admin-button" onClick={() => setSelectedId(null)}>{t('Tutup')}</button>}</div>
          {selected ? <div className="admin-panel-body admin-detail"><span className={`admin-status-pill ${selected.status}`}>{t(STATUS_TEXT[selected.status])}</span>
            <h3>{selected.location_name || selected.street_name || t('Nama lokasi belum tersedia')}</h3>
            <dl className="admin-detail-list"><div><dt>{t('Nama jalan')}</dt><dd>{selected.street_name || '—'}</dd></div>
              <div><dt>{t('Koordinat')}</dt><dd>{hasCoordinates(selected) ? `${Number(selected.lat).toFixed(6)}, ${Number(selected.lon).toFixed(6)}` : '—'}</dd></div>
              <div><dt>{t('Jumlah laporan')}</dt><dd>{selected.report_count ?? '—'}</dd></div>
              <div><dt>{t('Pertama terdeteksi')}</dt><dd>{formatTimestamp(selected.first_detected_at,locale)}</dd></div>
              <div><dt>{t('Terakhir terdeteksi')}</dt><dd>{formatTimestamp(selected.last_detected_at,locale)}</dd></div>
              {selected.repaired_at && <div><dt>{t('Diperbaiki')}</dt><dd>{formatTimestamp(selected.repaired_at,locale)}</dd></div>}
            </dl><button className="admin-button admin-button-primary" onClick={() => setEditingId(selected.id)}>{t('Ubah status')}</button>
            <p className="admin-panel-description">{t('Perubahan hanya disimpan setelah Anda mengonfirmasi.')}</p>
          </div> : <p className="admin-empty">{t('Pilih penanda atau tombol detail pada daftar laporan.')}</p>}
        </section>
      </div>
      <section className="admin-panel admin-manage"><div className="admin-panel-heading"><h2 className="admin-panel-title">{t('Manajemen Laporan Lubang')}</h2><span>{lastUpdated ? `${visible.length} / ${potholes.length}` : '—'}</span></div>
        <div className="report-filters">
          <label>{t('Pencarian')}<span className="filter-search"><Search size={16}/><input type="search" placeholder={t('Cari ID, lokasi, jalan, atau koordinat')} value={search} onChange={event => setSearch(event.target.value)} /></span></label>
          <label>{t('Status')}<select value={status} onChange={event => setStatus(event.target.value)}><option value="">{t('Semua status')}</option>{Object.entries(STATUS_TEXT).map(([key,text]) => <option key={key} value={key}>{t(text)}</option>)}</select></label>
          <label>{t('Nama lokasi')}<select value={location} onChange={event => setLocation(event.target.value)}><option value="">{t('Semua lokasi')}</option>{locations.map(name => <option key={name}>{name}</option>)}</select></label>
          <label>{t('Terdeteksi sejak (WIB)')}<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
          <label>{t('Sampai tanggal (WIB)')}<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
          <button className="admin-button" onClick={() => { setStatus('');setLocation('');setSearch('');setFrom('');setTo(''); }}>{t('Atur ulang filter')}</button>
        </div>
        {invalidDates && <p role="alert" className="admin-notice">{t('Rentang tanggal tidak valid.')}</p>}
        {loading ? <p role="status" className="admin-empty">{t('Memuat laporan…')}</p> : !lastUpdated && error ? <p className="admin-empty">{t('Laporan belum dapat ditampilkan.')}</p> :
          <div className="admin-table-wrap"><table className="admin-table manage-table"><thead><tr><th>{t('Laporan / lokasi')}</th><th>{t('Status')}</th><th>{t('Terakhir terdeteksi')}</th><th>{t('Tindakan')}</th></tr></thead><tbody>
            {visible.map(item => <tr key={item.id} className={item.id === selectedId ? 'selected' : ''}>
              <td><strong>#{item.id}</strong><div>{item.location_name || item.street_name || t('Nama lokasi belum tersedia')}</div></td>
              <td><span className={`admin-status-pill ${item.status}`}>{t(STATUS_TEXT[item.status])}</span></td>
              <td>{formatTimestamp(item.last_detected_at,locale)}</td>
              <td><div className="row-actions"><button className="admin-button" aria-label={`${t('Detail Lubang')} #${item.id}`} onClick={() => select(item.id)}>{t('Lihat detail')}</button>
                <button className="admin-button" aria-label={`${t('Ubah status lubang')} #${item.id}`} onClick={() => setEditingId(item.id)}>{t('Ubah status')}</button></div></td>
            </tr>)}
          </tbody></table>{!visible.length && <p className="admin-empty">{t('Tidak ada laporan yang sesuai dengan filter.')}</p>}</div>}
      </section>
      {editing && <StatusChangeDialog key={editing.id} item={editing} updateStatus={updateStatus} onClose={() => setEditingId(null)} onSaved={onSaved} />}
      {notice && <div className="success-toast" role="status"><CheckCircle2 size={22}/><div><strong>{t('Status berhasil diubah')}</strong><p>{t('Lubang')} #{notice.id}: {t(STATUS_TEXT[notice.status])}</p></div><button aria-label={t('Tutup notifikasi')} onClick={() => setNotice(null)}><X size={18}/></button></div>}
    </main>
  </AdminLayout>;
}
