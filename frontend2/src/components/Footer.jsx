import React from 'react';
import { Home, Phone, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        {/* Kolom Tentang Kami */}
        <div className="footer-column">
          <h3>Tentang Kami</h3>
          <p>
            Selamat datang, warga UGM! PitHoles merupakan platform yang membantu pengguna sepeda untuk memantau sebaran lubang yang ada di area sekitar UGM. Kami berupaya memaksimalkan infrastruktur memadai bagi kawan UGM.
          </p>
        </div>

        {/* Kolom Kontak */}
        <div className="footer-column">
          <h3>Kontak</h3>
          <div className="footer-contact-list">
            <div className="footer-contact-item">
              <Home size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>
                Bulaksumur, Caturtunggal, Kec. Depok, Kabupaten Sleman, Daerah Istimewa Yogyakarta 55281
              </span>
            </div>
            <div className="footer-contact-item">
              <Phone size={18} style={{ flexShrink: 0 }} />
              <span>(+62)8112869988</span>
            </div>
            <div className="footer-contact-item">
              <Mail size={18} style={{ flexShrink: 0 }} />
              <span>info@ugm.ac.id</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
