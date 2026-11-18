import { useState } from 'react';
import Logo from '../assets/logo.svg';
import { CircleUserRound, Menu, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useI18n } from '../locale';
import { LanguageSwitch } from '../i18n';

export default function Navbar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="navbar"><div className="navbar-inner">
    <button className="brand-section" onClick={() => { navigate('/beranda'); setMenuOpen(false); }} aria-label={t('Beranda PitHole')}>
      <img src={Logo} alt="PitHole" style={{ height: 36, width: 'auto' }} />
    </button>
    <button className="navbar-toggle" type="button" aria-label={t(menuOpen ? 'Tutup menu' : 'Buka menu')}
      aria-expanded={menuOpen} aria-controls="public-navigation" onClick={() => setMenuOpen(value => !value)}>
      {menuOpen ? <X size={20} /> : <Menu size={20} />}
    </button>
    <div id="public-navigation" className={`navbar-menu${menuOpen ? ' is-open' : ''}`}>
      <nav className="navbar-middle" aria-label={t('Navigasi utama')}>
        <NavLink className="menu" to="/beranda" onClick={() => setMenuOpen(false)}>{t('Beranda')}</NavLink>
        <NavLink className="menu" to="/petajalanberlubang" onClick={() => setMenuOpen(false)}>{t('Peta Jalan Berlubang')}</NavLink>
      </nav>
      <div className="navbar-right"><LanguageSwitch /><NavLink className="menu" to="/admin" aria-label={t('Masuk admin')}><CircleUserRound size={22} /></NavLink></div>
    </div>
  </div></header>;
}
