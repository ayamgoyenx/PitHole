import { lazy, Suspense } from 'react';
import { Link, Routes, Route } from 'react-router-dom';
import { useI18n } from './locale';
import './App.css';
const Beranda = lazy(() => import('./pages/beranda'));
const PetaJalanBerlubang = lazy(() => import('./pages/petajalanberlubang'));
const AdminLogin = lazy(() => import('./pages/admin/login'));
const AdminDashboard = lazy(() => import('./pages/admin/admindashboard'));
const AdminPitholeMaps = lazy(() => import('./pages/admin/pitholemaps'));
export default function App() {
  const { t } = useI18n();
  return <Suspense fallback={<main className="state-message" role="status">{t('Memuat…')}</main>}><Routes>
    <Route path="/" element={<Beranda />} />
    <Route path="/beranda" element={<Beranda />} />
    <Route path="/tentang-kami" element={<Beranda />} />
    <Route path="/petajalanberlubang" element={<PetaJalanBerlubang />} />
    <Route path="/admin" element={<AdminLogin />} />
    <Route path="/admin-login" element={<AdminLogin />} />
    <Route path="/admin-dashboard" element={<AdminDashboard />} />
    <Route path="/admin-pitholemaps" element={<AdminPitholeMaps />} />
    <Route path="*" element={<main className="state-message"><h1>{t('Halaman tidak ditemukan','Page not found')}</h1><Link to="/beranda">{t('Kembali ke beranda')}</Link></main>} />
  </Routes></Suspense>;
}
