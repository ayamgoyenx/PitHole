import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LocaleProvider } from '../src/i18n';
import Navbar from '../src/components/Navbar';
import StatusChangeDialog from '../src/components/StatusChangeDialog';
import DeviceLocation from '../src/components/DeviceLocation';
import PotholeList from '../src/components/PotholeList';
import SyncStatus from '../src/components/SyncStatus';
import usePotholes from '../src/hooks/usePotholes';
import AdminPitholeMaps from '../src/pages/admin/pitholemaps';
import PetaJalanBerlubang from '../src/pages/petajalanberlubang';

const map = vi.hoisted(() => ({ flyTo: vi.fn() }));
vi.mock('react-leaflet', () => ({ useMap: () => map,
  Circle: () => null, CircleMarker: ({ children }) => <div>{children}</div>, Popup: ({ children }) => <div>{children}</div>,
  MapContainer: ({ children }) => <div>{children}</div>, TileLayer: () => null, Marker: () => null, ScaleControl: () => null }));
vi.mock('../src/pages/admin/AdminLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../src/pages/admin/AdminMap', () => ({ default: () => <div>Map test placeholder</div> }));
vi.mock('../src/components/StreetPinLayer', () => ({ default: () => null }));
function Wrapper({ children }) { return <MemoryRouter initialEntries={['/petajalanberlubang']}><LocaleProvider>{children}</LocaleProvider></MemoryRouter>; }
const item = { id: 154, status: 'active', location_name: 'Jalan Uji' };
const response = body => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => {
  localStorage.clear(); map.flyTo.mockClear();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  window.matchMedia = () => ({ matches: false });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('language and accessibility', () => {
  it('switches language without navigation and persists preference', async () => {
    function Location() { return <output>{useLocation().pathname}</output>; }
    render(<><Navbar /><Location /></>, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('link', { name: 'Pothole Map' })).toBeTruthy();
    expect(screen.getByText('/petajalanberlubang')).toBeTruthy();
    expect(localStorage.getItem('pithole-language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
  it('opens a report with Enter, using a semantic button', async () => {
    const select = vi.fn();
    render(<PotholeList potholes={[item]} hasLoaded activeFilter="" onFilterChange={() => {}} onSelectPothole={select} />, { wrapper: Wrapper });
    screen.getByRole('button', { name: /Lubang #154/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(select).toHaveBeenCalledWith(item);
  });
  it('does not display fake sync time when only page refresh time is known', () => {
    render(<SyncStatus lastUpdated={new Date('2026-11-17T01:00:00Z')} />, { wrapper: Wrapper });
    expect(screen.getByText('Waktu unggahan belum tersedia')).toBeTruthy();
    expect(screen.queryByText(/5 menit/)).toBeNull();
  });
  it('does not mistake connection failure for an absent device upload', () => {
    render(<SyncStatus error="Network failure" />, { wrapper: Wrapper });
    expect(screen.getByText('Belum dapat diperiksa')).toBeTruthy();
    expect(screen.queryByText('Waktu unggahan belum tersedia')).toBeNull();
  });
  it('keeps a known sync timestamp explicitly stale after a failed refresh', () => {
    render(<SyncStatus lastDeviceSync="2026-11-17T01:00:00Z" lastUpdated={new Date('2026-11-17T01:01:00Z')} error="Network failure" />, { wrapper: Wrapper });
    expect(screen.getByText(/catatan terakhir yang berhasil dimuat/)).toBeTruthy();
    expect(screen.queryByText('Belum dapat diperiksa')).toBeNull();
  });
});

describe('device location', () => {
  it('requests location only on click and centers on actual returned coordinates', async () => {
    const getCurrentPosition = vi.fn(ok => ok({ coords: { latitude: -7.7, longitude: 110.3, accuracy: 30 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<DeviceLocation />, { wrapper: Wrapper });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Pusatkan ke lokasi saya' }));
    expect(map.flyTo).toHaveBeenCalledWith([-7.7, 110.3], 16, { animate: true });
    expect(screen.getByText('Lokasi perangkat Anda')).toBeTruthy();
  });
  it.each([[1, /Izin lokasi ditolak/], [2, /Lokasi belum ditemukan/], [3, /terlalu lama/]])('handles location error %s without moving the map', async (code, message) => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok, fail) => fail({ code }) }, configurable: true });
    render(<DeviceLocation />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'Pusatkan ke lokasi saya' }));
    expect(screen.getByRole('alert').textContent).toMatch(message);
    expect(map.flyTo).not.toHaveBeenCalled();
  });
});

describe('admin status confirmation', () => {
  async function choose() {
    await userEvent.click(screen.getByRole('radio', { name: /Perbaikan telah selesai/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tinjau perubahan' }));
  }
  it('does not mutate on selection or cancel; requires explicit confirmation', async () => {
    const updateStatus = vi.fn(); const onClose = vi.fn();
    render(<StatusChangeDialog item={item} updateStatus={updateStatus} onClose={onClose} onSaved={() => {}} />, { wrapper: Wrapper });
    await choose();
    expect(screen.getByRole('heading', { name: 'Yakin mengubah status?' })).toBeTruthy();
    expect(updateStatus).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(onClose).toHaveBeenCalledOnce(); expect(updateStatus).not.toHaveBeenCalled();
  });
  it('prevents duplicate saves and reports success only after the request resolves', async () => {
    let resolve; const updateStatus = vi.fn(() => new Promise(done => { resolve = done; })); const onSaved = vi.fn();
    render(<StatusChangeDialog item={item} updateStatus={updateStatus} onClose={() => {}} onSaved={onSaved} />, { wrapper: Wrapper });
    await choose(); await userEvent.click(screen.getByRole('button', { name: 'Ya, simpan perubahan' }));
    expect(screen.getByRole('button', { name: 'Menyimpan…' }).disabled).toBe(true);
    expect(onSaved).not.toHaveBeenCalled(); expect(updateStatus).toHaveBeenCalledExactlyOnceWith(154, 'repaired');
    await act(async () => resolve({ ...item, status: 'repaired' }));
    expect(onSaved).toHaveBeenCalledWith(154, 'repaired');
  });
  it('shows failed saves without a success notification', async () => {
    const onSaved = vi.fn();
    render(<StatusChangeDialog item={item} updateStatus={async () => { throw new Error('offline'); }} onClose={() => {}} onSaved={onSaved} />, { wrapper: Wrapper });
    await choose(); await userEvent.click(screen.getByRole('button', { name: 'Ya, simpan perubahan' }));
    expect(screen.getByRole('alert').textContent).toContain('Perubahan belum dapat dikonfirmasi');
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('data refresh and synchronization', () => {
  it('admin page shows a toast only after a confirmed successful save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ potholes: [item] }))
      .mockResolvedValueOnce(response({ pothole: { ...item, status: 'repaired' } })));
    render(<AdminPitholeMaps />, { wrapper: Wrapper });
    await userEvent.click(await screen.findByRole('button', { name: 'Ubah status lubang #154' }));
    await userEvent.click(screen.getByRole('radio', { name: /Perbaikan telah selesai/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tinjau perubahan' }));
    expect(screen.queryByText('Status berhasil diubah')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ya, simpan perubahan' }));
    expect(await screen.findByText('Status berhasil diubah')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('an open public detail follows new data without reopening the report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ potholes: [item] }))
      .mockResolvedValueOnce(response({ potholes: [{ ...item, status: 'repaired', report_count: 8 }] })));
    render(<PetaJalanBerlubang />, { wrapper: Wrapper });
    await userEvent.click(await screen.findByRole('button', { name: /Lubang #154/ }));
    expect(screen.getByRole('heading', { name: 'Lubang #154' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Perbarui' }));
    await waitFor(() => expect(screen.getByText('8')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Lubang #154' })).toBeTruthy();
  });
  it('refresh keeps last successful data after an error and never substitutes device sync', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ potholes: [item], sync: { last_device_sync_at: '2026-11-17T01:12:00Z' } }))
      .mockRejectedValueOnce(new Error('offline')));
    const { result } = renderHook(() => usePotholes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.refresh());
    expect(result.current.potholes).toEqual([item]);
    expect(result.current.lastDeviceSync).toBe('2026-11-17T01:12:00Z');
    expect(result.current.error).not.toBe('');
  });
  it('admin update changes the report, but not the last device upload timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ potholes: [item], sync: { last_device_sync_at: '2026-11-17T01:12:00Z' } }))
      .mockResolvedValueOnce(response({ pothole: { ...item, status: 'repaired' } })));
    const { result } = renderHook(() => usePotholes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.updateStatus(154, 'repaired'));
    expect(result.current.potholes[0].status).toBe('repaired');
    expect(result.current.lastDeviceSync).toBe('2026-11-17T01:12:00Z');
    expect(fetch.mock.calls[1][1].credentials).toBe('include');
  });
});
