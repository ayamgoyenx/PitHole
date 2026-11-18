import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../locale';
import { STATUS_TEXT } from '../utils/display';

export default function StatusChangeDialog({ item, updateStatus, onClose, onSaved }) {
  const { t } = useI18n();
  const dialog = useRef(null);
  const submitting = useRef(false);
  const [originalStatus] = useState(item.status);
  const [draft, setDraft] = useState(item.status);
  const [step, setStep] = useState('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const changedElsewhere = item.status !== originalStatus;
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element.showModal();
    return () => { element.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  const save = async () => {
    if (submitting.current || changedElsewhere || draft === item.status) return;
    submitting.current = true; setBusy(true); setError(''); setExpired(false);
    try {
      await updateStatus(item.id, draft);
      onSaved(item.id, draft);
    } catch (failure) {
      setExpired(failure.status === 401 || failure.status === 403);
      setError(failure.status === 401 || failure.status === 403 ? 'Sesi berakhir. Silakan masuk kembali.'
        : 'Perubahan belum dapat dikonfirmasi. Periksa koneksi atau perbarui data sebelum mencoba kembali.');
    } finally { submitting.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="status-dialog" aria-labelledby="status-dialog-title" aria-describedby="status-dialog-description"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-eyebrow">{t('Manajemen laporan')} · #{item.id}</div>
    <h2 id="status-dialog-title">{t(step === 'choose' ? 'Ubah status lubang' : 'Yakin mengubah status?')}</h2>
    <p id="status-dialog-description">{item.location_name || item.street_name || t('Nama lokasi belum tersedia')}</p>
    {step === 'choose' ? <fieldset disabled={busy}><legend>{t('Pilih status baru')}</legend>
      {Object.entries(STATUS_TEXT).map(([key, label]) => <label className={`status-choice${draft === key ? ' selected' : ''}`} key={key}>
        <input type="radio" name="next-status" value={key} checked={draft === key} onChange={() => setDraft(key)} />
        <span><strong>{t(label)}</strong><small>{t(key === 'active' ? 'Lubang masih memerlukan penanganan.' : key === 'in_progress' ? 'Pekerjaan perbaikan sedang berlangsung.' : 'Perbaikan telah selesai.')}</small></span>
        {key === originalStatus && <small>{t('Saat ini')}</small>}
      </label>)}
    </fieldset> : <><div className="status-transition"><span>{t(STATUS_TEXT[originalStatus])}</span><span aria-hidden="true">→</span><strong>{t(STATUS_TEXT[draft])}</strong></div>
      <p>{t('Status baru akan terlihat oleh pengguna setelah berhasil disimpan.')}</p></>}
    {changedElsewhere && <p className="admin-notice" role="alert">{t('Status telah berubah sejak dialog dibuka. Tutup dan periksa kembali laporan.')}</p>}
    {error && <p className="admin-notice" role="alert">{t(error)} {expired && <Link to="/admin-login">{t('Masuk kembali')}</Link>}</p>}
    <div className="dialog-actions">
      <button type="button" className="admin-button" autoFocus disabled={busy} onClick={onClose}>{t('Batal')}</button>
      {step === 'choose' ? <button type="button" className="admin-button admin-button-primary" disabled={draft === originalStatus || changedElsewhere} onClick={() => setStep('confirm')}>{t('Tinjau perubahan')}</button>
        : <><button type="button" className="admin-button" disabled={busy} onClick={() => { setStep('choose'); setError(''); }}>{t('Ubah pilihan')}</button>
          <button type="button" className="admin-button admin-button-primary" disabled={busy || changedElsewhere} onClick={save}>{t(busy ? 'Menyimpan…' : 'Ya, simpan perubahan')}</button></>}
    </div>
  </dialog>;
}
