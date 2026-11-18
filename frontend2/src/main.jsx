import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import './index.css'
import App from './App.jsx'
import { LocaleProvider } from './i18n';
import './pages/beranda.css';
import './pages/petajalanberlubang.css';
import './pages/admin/admin.css';
import './improvements.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider><App /></LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
)


