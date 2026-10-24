import React, { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminMap from './AdminMap';
import useAdminPotholes from './useAdminPotholes';
import { STATUS_COLORS, STATUS_LABEL, formatDate, formatDateTime } from './theme';

const STATUS_KEYS = ['active', 'in_progress', 'repaired'];

function matchesSearch(item, term) {
  if (!term) return true;
  const needle = term.replace(/^#/, '').toLowerCase();
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  const haystack = [String(item.id), String(item.lat), String(item.lon), `${lat.toFixed(6)}, ${lon.toFixed(6)}`, `${lat.toFixed(6)},${lon.toFixed(6)}`];
  return haystack.some((value) => value.toLowerCase().includes(needle));
}

export default function AdminPitholeMaps() {
  const { potholes, loading, error, lastUpdated, refresh, updateStatus } = useAdminPotholes();
  const [selectedId, setSelectedId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [statusFilter, setStatusFilter] = useState({ active: true, in_progress: true, repaired: true });
  const [selectedNames, setSelectedNames] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const locationNames = useMemo(
    () => [...new Set(potholes.map((item) => item.location_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [potholes],
  );

  const visible = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    return potholes.filter((item) => {
      if (!statusFilter[item.status]) return false;
      if (selectedNames.length && !selectedNames.includes(item.location_name)) return false;
      if (from || to) {
        const detected = new Date(item.first_detected_at);
        if (Number.isNaN(detected.valueOf())) return false;
        if (from && detected < from) return false;
        if (to && detected > to) return false;
      }
      return matchesSearch(item, search.trim());
    });
  }, [potholes, statusFilter, selectedNames, dateFrom, dateTo, search]);

  const selected = potholes.find((item) => item.id === selectedId) || null;
  const filtersActive = STATUS_KEYS.some((key) => !statusFilter[key]) || selectedNames.length || dateFrom || dateTo || search;

  const handleSelect = (id) => {
    setSelectedId(id);
    setActionError('');
  };

  const handleStatusChange = async (id, status) => {
    setSavingId(id);
    setActionError('');
    try {
      await updateStatus(id, status);
    } catch {
      setActionError('Terjadi kesalahan. Silakan coba lagi nanti.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleName = (name) => setSelectedNames((current) => (
    current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
  ));

  const resetFilters = () => {
    setStatusFilter({ active: true, in_progress: true, repaired: true });
    setSelectedNames([]);
    setDateFrom('');
    setDateTo('');
    setSearch('');
  };

  const statusSelect = (item, label) => (
    <select
      className="admin-select"
      aria-label={label}
      value={item.status}
      disabled={savingId === item.id}
      onChange={(event) => handleStatusChange(item.id, event.target.value)}
    >
      {STATUS_KEYS.map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
    </select>
  );

  return (
    <AdminLayout activePath="/admin-pitholemaps" eyebrow="Peta Jalan Berlubang">
      <main className="admin-content">
        <div className="admin-page-heading">
          <div>
            <div className="admin-eyebrow">Peta dan manajemen laporan</div>
            <h1 className="admin-title">Peta Jalan Berlubang</h1>
            <p className="admin-subtitle">Klik penanda pada peta atau baris tabel untuk melihat detail dan mengubah status lubang.</p>
          </div>
          <div className="admin-heading-actions">
            <button className="admin-button" type="button" onClick={refresh}><RefreshCw size={14} /> Perbarui data</button>
            <span className="admin-status-pill active">{visible.length} dari {potholes.length} lubang</span>
          </div>
        </div>

        {error && <div className="admin-notice" role="alert">Terjadi kesalahan saat memuat data. Silakan coba lagi nanti.</div>}

        <div className="admin-map-layout">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2 className="admin-panel-title">Area UGM</h2>
              <div className="admin-map-legend">
                {STATUS_KEYS.map((key) => (
                  <span key={key}><i className="admin-status-dot" style={{ background: STATUS_COLORS[key] }} />{STATUS_LABEL[key]}</span>
                ))}
              </div>
            </div>
            {loading && !potholes.length
              ? <div className="admin-empty">Memuat lokasi…</div>
              : <AdminMap potholes={visible} className="admin-map-tall" selectedId={selectedId} onSelect={handleSelect} />}
          </section>

          <section className="admin-panel" aria-label="Detail lubang">
            <div className="admin-panel-heading">
              <h2 className="admin-panel-title">{selected ? `Lubang #${selected.id}` : 'Detail Lubang'}</h2>
              {selected && <button className="admin-button" type="button" onClick={() => setSelectedId(null)}>Tutup</button>}
            </div>
            {selected ? (
              <div className="admin-panel-body admin-detail">
                <dl className="admin-detail-list">
                  <div><dt>Nama jalan</dt><dd>{selected.street_name || '—'}</dd></div>
                  <div><dt>Nama lokasi</dt><dd>{selected.location_name || 'Lokasi tidak diketahui'}</dd></div>
                  <div><dt>Koordinat</dt><dd className="admin-coordinate">{Number(selected.lat).toFixed(6)}, {Number(selected.lon).toFixed(6)}</dd></div>
                  <div><dt>Jumlah laporan</dt><dd>{selected.report_count ?? 1}</dd></div>
                  <div><dt>Pertama terdeteksi</dt><dd>{formatDateTime(selected.first_detected_at)}</dd></div>
                  <div><dt>Terakhir terdeteksi</dt><dd>{formatDateTime(selected.last_detected_at)}</dd></div>
                  {selected.repaired_at && <div><dt>Diperbaiki</dt><dd>{formatDateTime(selected.repaired_at)}</dd></div>}
                </dl>
                <label className="admin-detail-status">
                  <span>Status</span>
                  {statusSelect(selected, `Ubah status lubang ${selected.id}`)}
                </label>
                {actionError && <div className="admin-notice" role="alert">{actionError}</div>}
              </div>
            ) : (
              <p className="admin-empty">Pilih penanda pada peta atau baris pada tabel untuk melihat detail.</p>
            )}
          </section>
        </div>

        <section className="admin-panel admin-manage">
          <div className="admin-panel-heading">
            <h2 className="admin-panel-title">Manajemen Laporan Lubang</h2>
            <span className="admin-panel-description">
              {lastUpdated ? `Diperbarui ${lastUpdated.toLocaleTimeString('id-ID')}` : ''}
            </span>
          </div>

          <div className="admin-filters">
            <fieldset className="admin-filter-field">
              <legend>Status</legend>
              <div className="admin-check-row">
                {STATUS_KEYS.map((key) => (
                  <label className="admin-check" key={key}>
                    <input
                      type="checkbox"
                      checked={statusFilter[key]}
                      onChange={() => setStatusFilter((current) => ({ ...current, [key]: !current[key] }))}
                    />
                    <i className="admin-status-dot" style={{ background: STATUS_COLORS[key] }} />
                    {STATUS_LABEL[key]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="admin-filter-field">
              <span className="admin-filter-label">Nama lokasi</span>
              <details className="admin-multiselect">
                <summary>{selectedNames.length ? `${selectedNames.length} lokasi dipilih` : 'Semua lokasi'}</summary>
                <div className="admin-multiselect-list">
                  {locationNames.map((name) => (
                    <label className="admin-check" key={name}>
                      <input type="checkbox" checked={selectedNames.includes(name)} onChange={() => toggleName(name)} />
                      {name}
                    </label>
                  ))}
                  {!locationNames.length && <span className="admin-panel-description">Belum ada nama lokasi.</span>}
                </div>
              </details>
            </div>

            <div className="admin-filter-field">
              <span className="admin-filter-label">Tanggal pertama terdeteksi</span>
              <div className="admin-date-row">
                <label>
                  <span className="admin-sr-only">Dari tanggal</span>
                  <input className="admin-input" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
                </label>
                <span aria-hidden="true">–</span>
                <label>
                  <span className="admin-sr-only">Sampai tanggal</span>
                  <input className="admin-input" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
                </label>
              </div>
            </div>

            <div className="admin-filter-field admin-filter-search">
              <span className="admin-filter-label">Pencarian manual</span>
              <label className="admin-search-wrap">
                <Search size={14} aria-hidden="true" />
                <input
                  className="admin-search"
                  type="search"
                  placeholder="Cari ID atau koordinat"
                  aria-label="Cari berdasarkan ID atau koordinat"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>

            {filtersActive ? <button className="admin-button" type="button" onClick={resetFilters}>Atur ulang filter</button> : null}
          </div>

          {loading && !potholes.length ? <div className="admin-empty">Memuat laporan…</div> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nama lokasi</th>
                    <th>Nama jalan</th>
                    <th>Koordinat</th>
                    <th>Laporan</th>
                    <th>Pertama terdeteksi</th>
                    <th>Terakhir terdeteksi</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr
                      key={item.id}
                      className={`admin-row${item.id === selectedId ? ' selected' : ''}`}
                      onClick={() => handleSelect(item.id)}
                    >
                      <td className="admin-table-primary">#{item.id}</td>
                      <td>{item.location_name || 'Lokasi tidak diketahui'}</td>
                      <td>{item.street_name || '—'}</td>
                      <td className="admin-coordinate">{Number(item.lat).toFixed(5)}, {Number(item.lon).toFixed(5)}</td>
                      <td>{item.report_count ?? 1}</td>
                      <td>{formatDate(item.first_detected_at)}</td>
                      <td>{formatDate(item.last_detected_at)}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {statusSelect(item, `Ubah status lubang ${item.id}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p className="admin-empty">Tidak ada lubang yang sesuai dengan filter.</p>}
            </div>
          )}
        </section>
      </main>
    </AdminLayout>
  );
}
