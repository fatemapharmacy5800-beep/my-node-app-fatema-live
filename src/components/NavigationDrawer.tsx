import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CreditCard,
  Download,
  HandCoins,
  LayoutDashboard,
  Moon,
  PackageCheck,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import type { AuthUser } from './AuthGate';
import type { DashboardAnalytics, DashboardPage, PharmacySettings } from '../types';

type NavigationDrawerProps = {
  open: boolean;
  onClose: () => void;
  page: DashboardPage;
  onNavigate: (page: DashboardPage) => void;
  analytics: DashboardAnalytics;
  pharmacy: PharmacySettings;
  onPharmacyUpdated: (pharmacy: PharmacySettings) => void;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  metrics: React.ReactNode;
  updatedLabel: string;
  reportStatus: { kind: 'success' | 'error'; message: string } | null;
  isSavingReport: boolean;
  onSaveSummary: () => void;
  onDownloadPdf: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onLogout?: () => Promise<void>;
  settingsLoadError: string | null;
};

const navItems: { page: DashboardPage; label: string; icon: React.ReactNode }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { page: 'reports', label: 'Analytics & reports', icon: <BarChart3 /> },
  { page: 'sales', label: 'Live sales', icon: <Activity /> },
  { page: 'purchases', label: 'Daily purchases', icon: <ShoppingCart /> },
  { page: 'dueCollections', label: 'Due collections', icon: <HandCoins /> },
  { page: 'expenses', label: 'Daily expenses', icon: <WalletCards /> },
  { page: 'payments', label: 'Supplier payments', icon: <CreditCard /> },
  { page: 'employeePayments', label: 'Employee payments', icon: <BadgeDollarSign /> },
];

async function responseError(response: Response, fallback: string): Promise<Error> {
  const result = await response.json().catch(() => ({}));
  return new Error(result.error || fallback);
}

function DialogFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pharmacy-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="pharmacy-dialog" role="dialog" aria-modal="true" aria-labelledby="pharmacy-dialog-title">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Pharmacy account</p>
            <h2 id="pharmacy-dialog-title" className="mt-1 text-lg font-black text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function PharmacySettingsDialog({
  pharmacy,
  onUpdated,
  onClose,
}: {
  pharmacy: PharmacySettings;
  onUpdated: (pharmacy: PharmacySettings) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(pharmacy.name);
  const [address, setAddress] = useState(pharmacy.address);
  const [phone, setPhone] = useState(pharmacy.phone);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, phone }),
      });
      if (!response.ok) throw await responseError(response, 'Pharmacy details could not be saved.');
      const result = await response.json();
      onUpdated(result.pharmacy as PharmacySettings);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pharmacy details could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame title="Pharmacy details" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className="pharmacy-form-label">Pharmacy name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus />
        </label>
        <label className="pharmacy-form-label">Address
          <textarea value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} rows={3} />
        </label>
        <label className="pharmacy-form-label">Phone number
          <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
        </label>
        {message && <p className="pharmacy-form-error" role="alert">{message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="pharmacy-secondary-button">Cancel</button>
          <button type="submit" disabled={saving} className="pharmacy-primary-button">{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </DialogFrame>
  );
}

function ProfileDialog({
  user,
  onUpdated,
  onClose,
}: {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (newPassword !== confirmPassword) {
      setMessage('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, currentPassword, newPassword }),
      });
      if (!response.ok) throw await responseError(response, 'Profile could not be updated.');
      const result = await response.json();
      onUpdated(result.user as AuthUser);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Profile could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame title="Edit profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className="pharmacy-form-label">Name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus />
        </label>
        <label className="pharmacy-form-label">Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} required />
        </label>
        <div className="border-t border-slate-200 pt-4">
          <p className="mb-3 text-xs font-bold text-slate-700">Password</p>
          <div className="space-y-4">
            <label className="pharmacy-form-label">Current password
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="current-password" required />
            </label>
            <label className="pharmacy-form-label">New password <span className="font-normal text-slate-400">(leave blank to keep current)</span>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" />
            </label>
            <label className="pharmacy-form-label">Confirm new password
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} maxLength={128} autoComplete="new-password" />
            </label>
          </div>
        </div>
        {message && <p className="pharmacy-form-error" role="alert">{message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="pharmacy-secondary-button">Cancel</button>
          <button type="submit" disabled={saving} className="pharmacy-primary-button">{saving ? 'Saving…' : 'Save profile'}</button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function NavigationDrawer({
  open,
  onClose,
  page,
  onNavigate,
  analytics,
  pharmacy,
  onPharmacyUpdated,
  user,
  onUserUpdated,
  metrics,
  updatedLabel,
  reportStatus,
  isSavingReport,
  onSaveSummary,
  onDownloadPdf,
  theme,
  onThemeToggle,
  onLogout,
  settingsLoadError,
}: NavigationDrawerProps) {
  const [showPharmacySettings, setShowPharmacySettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [logoMessage, setLogoMessage] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open && !showProfile && !showPharmacySettings) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showProfile) setShowProfile(false);
        else if (showPharmacySettings) setShowPharmacySettings(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, showPharmacySettings, showProfile]);

  const uploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1.5 * 1024 * 1024) {
      setLogoMessage('Choose a PNG or JPEG image no larger than 1.5 MB.');
      return;
    }

    setUploadingLogo(true);
    setLogoMessage('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.'));
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/settings/logo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (!response.ok) throw await responseError(response, 'Pharmacy logo could not be saved.');
      const result = await response.json();
      onPharmacyUpdated(result.pharmacy as PharmacySettings);
      setLogoMessage('Pharmacy logo updated.');
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : 'Pharmacy logo could not be saved.');
    } finally {
      setUploadingLogo(false);
    }
  };

  if (!open && !showProfile && !showPharmacySettings) return null;

  return (
    <>
      {open && (
        <>
          <button type="button" className="navigation-scrim" onClick={onClose} aria-label="Close navigation" />
          <aside className="navigation-drawer" aria-label="Main navigation">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {pharmacy.logoDataUrl
                    ? <img src={pharmacy.logoDataUrl} alt="" className="h-full w-full object-cover" />
                    : <Boxes className="h-5 w-5 text-teal-700" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{pharmacy.name}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Pharmacy workspace</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Collapse navigation drawer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            {settingsLoadError && <p className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">{settingsLoadError}</p>}

            <div className="navigation-drawer-scroll">
              <div className="px-3 pt-4">
                <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Navigation</p>
                <nav aria-label="Dashboard pages" className="space-y-1">
                  {navItems.map((item) => (
                    <button
                      type="button"
                      key={item.page}
                      onClick={() => onNavigate(item.page)}
                      aria-current={page === item.page ? 'page' : undefined}
                      className={`navigation-item ${page === item.page ? 'is-active' : ''}`}
                    >
                      {item.icon}<span>{item.label}</span>
                    </button>
                  ))}
                </nav>
              </div>

              <section className="px-4 pt-5" aria-labelledby="drawer-metrics-title">
                <div className="mb-2 flex items-center justify-between">
                  <h2 id="drawer-metrics-title" className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Daily snapshot</h2>
                  <span className="text-[10px] text-slate-400">{analytics.date || '—'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">{metrics}</div>
              </section>

              <section className="px-3 pt-5" aria-labelledby="drawer-actions-title">
                <h2 id="drawer-actions-title" className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Reports & actions</h2>
                <p className="mb-2 px-2 text-[10px] text-slate-400">{updatedLabel}</p>
                <button type="button" onClick={onSaveSummary} disabled={!analytics.date || isSavingReport} className="navigation-item">
                  <Save /><span>{isSavingReport ? 'Saving summary…' : 'Save summary'}</span>
                </button>
                <button type="button" onClick={onDownloadPdf} disabled={!analytics.date} className="navigation-item">
                  <Download /><span>Download PDF</span>
                </button>
                {reportStatus && <p className={`mx-2 mt-2 rounded-lg px-3 py-2 text-xs ${reportStatus.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`} role="status">{reportStatus.message}</p>}
              </section>

              <section className="px-3 pt-5" aria-labelledby="drawer-settings-title">
                <h2 id="drawer-settings-title" className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Settings</h2>
                <button type="button" onClick={() => setShowPharmacySettings(true)} className="navigation-item">
                  <Settings /><span>Pharmacy details</span>
                </button>
                <button type="button" onClick={() => setShowProfile(true)} className="navigation-item">
                  <UserRound /><span>Profile <span className="font-normal text-slate-400">· {user.name}</span></span>
                </button>
                <button type="button" onClick={() => logoInput.current?.click()} disabled={uploadingLogo} className="navigation-item">
                  <ShieldCheck /><span>{uploadingLogo ? 'Uploading logo…' : 'Edit logo'}</span>
                </button>
                <input ref={logoInput} type="file" accept="image/png,image/jpeg" onChange={(event) => void uploadLogo(event)} className="sr-only" aria-label="Upload pharmacy logo" />
                {logoMessage && <p className="mx-2 mt-2 text-xs text-slate-500" role="status">{logoMessage}</p>}
              </section>

              <div className="mt-5 border-t border-slate-200 px-3 py-3">
                <button type="button" onClick={onThemeToggle} className="navigation-item">
                  {theme === 'light' ? <Moon /> : <Sun />}
                  <span>Switch to {theme === 'light' ? 'dark' : 'light'} mode</span>
                </button>
                {onLogout && <button type="button" onClick={() => void onLogout()} className="navigation-item navigation-item-danger">
                  <ShieldCheck /><span>Sign out</span>
                </button>}
              </div>
            </div>
          </aside>
        </>
      )}
      {showPharmacySettings && <PharmacySettingsDialog pharmacy={pharmacy} onUpdated={onPharmacyUpdated} onClose={() => setShowPharmacySettings(false)} />}
      {showProfile && <ProfileDialog user={user} onUpdated={onUserUpdated} onClose={() => setShowProfile(false)} />}
    </>
  );
}