import React, { useState } from 'react';
import Logo from '../assets/logo.svg';
import { CircleUserRound, Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ onResetToHome, isAdmin }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navigateTo = (path) => {
    navigate(path);
    setMenuOpen(false);
  };
  
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-left">
          <button className="brand-section" onClick={() => navigateTo('/tentang-kami')} aria-label="PitHole home">
              <div className="brand-logo">
                <img 
                  src= {Logo}
                  alt="pithole logo" 
                  style = {{width:"auto", height:"36px"}}
                />
              </div>
            </button>
        </div>
        <button
          className="navbar-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className={`navbar-menu${menuOpen ? ' is-open' : ''}`}>
          <nav className="navbar-middle" aria-label="Main navigation">
            <button className="menu" onClick={() => navigateTo('/beranda')}>
              Beranda
            </button>
            <button className="menu" onClick={() => navigateTo('/petajalanberlubang')}>
              Peta Jalan Berlubang
            </button>
          </nav>
          <div className="navbar-right">
            <button className="menu" onClick={onResetToHome}>EN</button>
            <button className="menu" onClick={onResetToHome}>ID</button>
            {isAdmin ? (
                <>
                  <button className="menu" onClick={() => navigateTo('/admin-dashboard')}>Dashboard</button>
                  <button className="menu" onClick={() => navigateTo('/admin-pitholelist')}>Pothole List</button>
                </>
              ) : (
                <button className="menu" aria-label="Admin login" onClick={() => navigateTo('/admin')}> <CircleUserRound size={20} /> </button>
              )}

          </div>
        </div>
      </div>
    </header>
  );
}
