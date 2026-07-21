import React, { useState, useEffect } from 'react';
import CustomerForm from './components/CustomerForm';
import AdminDashboard from './components/AdminDashboard';
import { ShieldAlert, AlertTriangle, Sparkles } from 'lucide-react';
import { isSupabaseConfigured } from './supabaseClient';

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash || '#/');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return (
    <div className="app-container">
      {/* Missing Env Warning Banner */}
      {!isSupabaseConfigured && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b',
          padding: '0.6rem 1rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          zIndex: 100
        }}>
          <AlertTriangle size={16} />
          <span>تنبيه: لم يتم ضبط رابط وتفاصيل Supabase في ملف <code>.env</code> (VITE_SUPABASE_URL). التطبيق يعمل حالياً في وضع المعاينة.</span>
        </div>
      )}

      {/* Main Page View */}
      {currentPath.startsWith('#/admin') ? (
        <AdminDashboard />
      ) : (
        <CustomerForm />
      )}
    </div>
  );
}

export default App;

