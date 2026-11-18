import { useI18n } from '../../locale';
import { LanguageSwitch } from '../../i18n';
import { apiUrl, readJson } from '../../api';
import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, MapPinned, Menu, X } from 'lucide-react';
import logo from '../../assets/logo.svg';

const navigation = [
  { to: '/admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin-pitholemaps', label: 'Peta Jalan Berlubang', icon: MapPinned },
];

export default function AdminLayout({ activePath, eyebrow, children }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');
  const [sessionState, setSessionState] = useState('checking');
  const [username, setUsername] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const verifySession = () => {
      fetch(apiUrl('/api/v1/admin/session'), { credentials: 'include', cache: 'no-store' })
        .then(async (response) => {
          if (!active) return;
          if (response.ok) {
            const payload = await response.json().catch(() => ({}));
            if (!active) return;
            setUsername(payload.admin?.username || '');
            setSessionState('authenticated');
            return;
          }
          setSessionState('checking');
          if (response.status === 401 || response.status === 403) {
            navigate('/admin-login', { replace: true });
            return;
          }
          setSessionState('Terjadi kesalahan. Silakan coba lagi nanti.');
        })
        .catch(() => {
          if (active) setSessionState('Terjadi kesalahan. Silakan coba lagi nanti.');
        });
    };

    verifySession();
    // Re-check when the page is restored from the back/forward cache or the tab regains focus
    const onPageShow = (event) => { if (event.persisted) verifySession(); };
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', verifySession);
    return () => {
      active = false;
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', verifySession);
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await readJson(await fetch(apiUrl('/api/v1/admin/logout'), { method: 'POST', credentials: 'include' }));
      navigate('/admin-login', { replace: true });
    } catch { setLogoutError('Keluar gagal. Periksa koneksi dan coba lagi.'); }
  };

  if (sessionState !== 'authenticated') {
    return (
      <div className="admin-app admin-auth-check" role="status">
        {t(sessionState === 'checking' ? 'Memeriksa sesi admin…' : sessionState)}
      </div>
    );
  }

  const userBlock = (
    <div className="admin-user-block">
      <div className="admin-avatar" aria-hidden="true">{(username || 'AD').slice(0, 2).toUpperCase()}</div>
      <div className="admin-user-info">
        <div className="admin-user-name" title={username}>{username || 'PitHole Admin'}</div>
      </div>
      <button className="admin-logout" type="button" onClick={handleLogout} aria-label={t("Keluar admin")} title={t("Keluar admin")}>
        <LogOut size={16} />
      </button>
    </div>
  );

  const navLinks = navigation.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      className={`admin-nav-link${activePath === to ? ' active' : ''}`}
      aria-current={activePath === to ? 'page' : undefined}
      onClick={() => setMenuOpen(false)}
    >
      <Icon size={16} />
      {t(label)}
    </NavLink>
  ));

  return (
    <div className="admin-app admin-shell">
      <header className="admin-mobile-nav">
        <div className="admin-mobile-nav-bar"><LanguageSwitch />
          <img src={logo}           alt={t("Administrasi PitHole")} />
          <button
            className="admin-mobile-toggle"
            type="button"
            aria-label={t(menuOpen ? 'Tutup menu' : 'Buka menu')}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="admin-mobile-menu" id="admin-mobile-menu">
            <nav className="admin-mobile-links" aria-label={t("Navigasi admin")}>{navLinks}</nav>
            {userBlock}
          </div>
        )}
      </header>

      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src={logo} alt={t("PitHole administration")} />
        </div>
        <div className="admin-sidebar-label">{t("Operasional")}</div>
                <nav className="admin-nav" aria-label={t("Navigasi admin")}>{navLinks}</nav>
        <div className="admin-sidebar-bottom"><LanguageSwitch />{userBlock}</div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">PitHole / {t('Administrasi')} / {t(eyebrow)}</div>
          <div className="admin-topbar-actions">
            <span className="admin-live-dot" />
            {t('Administrasi')}
          </div>
        </header>
        {logoutError && <p role="alert" className="admin-notice">{t(logoutError)}</p>}{children}
      </div>
    </div>
  );
}
