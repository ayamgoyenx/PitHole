import { Routes, Route } from 'react-router-dom';
import './App.css';
import Beranda from './pages/beranda';
import PetaJalanBerlubang from './pages/petajalanberlubang';
import AdminLogin from './pages/admin/login';
import AdminDashboard from './pages/admin/admindashboard';
import AdminPitholeMaps from './pages/admin/pitholemaps';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Beranda />} />
      <Route path="/beranda" element={<Beranda />} />
      <Route path="/tentang-kami" element={<Beranda />} />
      <Route path="/petajalanberlubang" element={<PetaJalanBerlubang />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route path="/admin-dashboard" element={<AdminDashboard />} />
      <Route path="/admin-pitholemaps" element={<AdminPitholeMaps />} />
      <Route path="/admin-pitholelmaps" element={<AdminPitholeMaps />} />
      <Route path="*" element={<main>Page not found</main>} />
    </Routes>
  );
}

export default App;
