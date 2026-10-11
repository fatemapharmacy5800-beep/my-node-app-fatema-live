import React from 'react';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AuthGate } from './components/AuthGate';

export default function App() {
  return (
    <AuthGate>
      {({ user, onLogout, onUserUpdated }) => (
        <AnalyticsDashboard user={user} onUserUpdated={onUserUpdated} onLogout={onLogout} />
      )}
    </AuthGate>
  );
}