import React, { useState } from 'react';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.svg';
import { apiUrl } from '../../api';
import './admin.css';
import background from '../../assets/background.svg';

// 1. take username and password input from the user
// 2. hash password
// 3. send username and hashed password to the server
// 4. authenticate 
// 5. give token to the client
// 6. client can access website

export default function AdminLogin() {
  const navigate = useNavigate();
  //username => current val, setUsername => fungsi untuk update username
  const [username, setUsername] = useState('');
  //password => current val, setPassword => fungsi untuk update password
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    //errornya diset null dulu sebelum submit
    setError(''); 
    //submit diset true, useState hook akan menandai form sedang disubmit
    setSubmitting(true);
    try {
      //mengirim request login ke server dengan username dan password
      const response = await fetch(apiUrl('/api/v1/admin/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      //mengambil response dari server dan parsing menjadi JSON
      const payload = await response.json().catch(() => ({}));

      //hanya kredensial salah (401) yang ditampilkan detail; error lain dibuat umum
      if (response.status === 401) {
        setError(payload.message || 'Username or password is incorrect.');
        return;
      }
      if (!response.ok) throw new Error('server');
      navigate('/admin-dashboard', { replace: true });
    } catch {
      setError('Something went wrong. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  // <section className="about-hero" aria-labelledby="about-heading">
  //         <img
  //           src={background}
  //           alt=""
  //           aria-hidden="true"
  //           className="about-background"
  //         />
  //       </section>
  return (
      <main className="admin-app admin-auth-page">
        <section className="admin-auth-art">
          {/* <img className="admin-auth-logo" src={logo} alt="PitHole" /> */}
          <div className="admin-auth-message">
            <h1>Lakukan pemantauan dan pengelolaan jalan berlubang bersama</h1>
            <span>
              <img className="admin-auth-logo" 
                src={logo} alt="PitHole"
                /></span>
          </div>
        </section>
        <section className="admin-auth-panel">
          <form className="admin-auth-form" onSubmit={handleSubmit}>
            <h2>Masuk</h2>
            <p>Masukkan username dan password Anda untuk masuk sebagai Admin Pithole.</p>
            {error && <div className="admin-notice" role="alert">{error}</div>}
            <label className="admin-field">
              Username
              <input
                name="username"
                autoComplete="username"
                value={username}
                //menangani perubahan input username
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>
            <label className="admin-field">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="admin-button admin-button-primary" type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
    </main>
  );
}