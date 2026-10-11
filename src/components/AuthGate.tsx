import React, { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { BRAND_NAME, COPYRIGHT_NOTICE } from '../brand';

export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

type AuthGateProps = {
  children: (props: {
    user: AuthUser;
    onLogout: () => Promise<void>;
    onUserUpdated: (user: AuthUser) => void;
  }) => React.ReactNode;
};

type AuthMode = 'login' | 'signup';

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then(async (response) => {
        if (response.ok) {
          const payload = await response.json();
          setUser(payload.user);
        } else if (response.status !== 401) {
          const payload = await response.json().catch(() => ({}));
          setMessage(payload.error || 'Authentication service is unavailable.');
        }
      })
      .catch(() => setMessage('Unable to reach the authentication service.'))
      .finally(() => setLoading(false));
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      const body = mode === 'login'
        ? { identifier, password }
        : { username, email, password };
      const response = await fetch(`/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error || 'Authentication failed.');
        return;
      }
      setUser(payload.user);
      setPassword('');
    } catch {
      setMessage('Unable to reach the authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  const onLogout = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    setUser(null);
    setMode('login');
  };

  if (loading) {
    return <div className="auth-loading"><ShieldCheck className="h-6 w-6 animate-pulse" /> Checking secure session…</div>;
  }

  if (user) return <>{children({ user, onLogout, onUserUpdated: setUser })}</>;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand-mark"><LockKeyhole className="h-7 w-7" /></div>
        <p className="auth-eyebrow">Fatema Pharmacy · secure access</p>
        <p className="mt-2 text-xs font-semibold text-slate-500">{BRAND_NAME}</p>
        <h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth-copy">
          {mode === 'login' ? 'Sign in to open the pharmacy operations center.' : 'Create an account to access live pharmacy data.'}
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          {mode === 'signup' ? (
            <>
              <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required minLength={3} maxLength={50} /></label>
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            </>
          ) : (
            <label>Username or email<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /></label>
          )}
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} required /></label>
          {message && <p className="auth-error" role="alert">{message}</p>}
          <button type="submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>
          {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
        <p className="auth-security"><ShieldCheck className="h-4 w-4" /> Passwords are protected with bcrypt hashing.</p>
        <p className="mt-5 border-t border-slate-200 pt-4 text-center text-[10px] font-semibold tracking-wide text-slate-500">{COPYRIGHT_NOTICE}</p>
      </section>
    </main>
  );
}