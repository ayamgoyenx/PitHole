import React, { useState } from 'react';
import { Cpu, Send, RefreshCw, X } from 'lucide-react';

export default function IoTTestModal({ onRefreshData }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Sample data simulasi dari ESP32 MicroSD
  const [simLat, setSimLat] = useState('-7.7708');
  const [simLon, setSimLon] = useState('110.3762');

  const handleSimulateUpload = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = {
        sync_time: new Date().toISOString(),
        potholes: [
          {
            lat: parseFloat(simLat),
            lon: parseFloat(simLon),
            detected_at: new Date().toISOString(),
          },
        ],
      };

      const res = await fetch('http://localhost:5000/api/v1/potholes/batch-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`Success: ${data.message}`);
        onRefreshData();
      } else {
        setMessage(`Error: ${data.message}`);
      }
    } catch (err) {
      setMessage(`Gagal koneksi backend: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedReset = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('http://localhost:5000/api/v1/potholes/seed', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Seed data UGM berhasil diisikan (${data.count} titik).`);
        onRefreshData();
      } else {
        setMessage(`Error seed: ${data.message}`);
      }
    } catch (err) {
      setMessage(`Gagal koneksi seed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className="btn-iot-test-float" onClick={() => setIsOpen(true)}>
        <Cpu size={18} />
        Simulasi IoT ESP32
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={20} color="#3B82F6" />
                Simulasi Device ESP32 (MicroSD Batch)
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
              Kirimkan log data deteksi titik jalan berlubang dari sepeda ke endpoint <code>POST /api/v1/potholes/batch-upload</code>.
            </p>

            <form onSubmit={handleSimulateUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Latitude:</label>
                <input
                  type="text"
                  value={simLat}
                  onChange={(e) => setSimLat(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    marginTop: '4px',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Longitude:</label>
                <input
                  type="text"
                  value={simLon}
                  onChange={(e) => setSimLon(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    marginTop: '4px',
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    background: '#3B82F6',
                    color: '#FFF',
                    border: 'none',
                    padding: '10px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Send size={16} />
                  Kirim Batch Data
                </button>

                <button
                  type="button"
                  onClick={handleSeedReset}
                  disabled={loading}
                  style={{
                    background: '#F1F5F9',
                    color: '#0F172A',
                    border: '1px solid #CBD5E1',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <RefreshCw size={16} />
                  Reset Seed UGM
                </button>
              </div>
            </form>

            {message && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: message.startsWith('Success') || message.startsWith('Seed') ? '#F0FFF4' : '#FFF5F5',
                  color: message.startsWith('Success') || message.startsWith('Seed') ? '#2F855A' : '#C53030',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
