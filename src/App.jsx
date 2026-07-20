import React, { useState, useEffect } from 'react';
import CustomerForm from './components/CustomerForm';
import AdminDashboard from './components/AdminDashboard';
import { ShoppingBag, ShieldAlert, AlertTriangle } from 'lucide-react';
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
          justify: 'center',
          gap: '0.5rem',
          zIndex: 100
        }}>
          <AlertTriangle size={16} />
          <span>تنبيه: لم يتم ضبط رابط وتفاصيل Supabase في ملف <code>.env</code> (VITE_SUPABASE_URL). التطبيق يعمل حالياً في وضع المعاينة.</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="app-header">
        <a href="#/" className="logo-container">
          <div className="logo-icon-wrapper" style={{ background: '#ffffff', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <img src="/logo.png" alt="Clean Code Logo" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
          </div>
          <span className="logo-text">Clean Code</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)', marginRight: '0.25rem' }}>كلين كود</span>
        </a>

        <div className="nav-links">
          <a 
            href="#/" 
            className={`btn-nav ${currentPath === '#/' || currentPath === '' ? 'active' : ''}`}
          >
            طلب غسيل جديد
          </a>
          <a 
            href="#/admin" 
            className={`btn-nav ${currentPath.startsWith('#/admin') ? 'active' : ''}`}
          >
            <ShieldAlert size={14} /> لوحة التحكم
          </a>
        </div>
      </header>

      {/* Page Routing */}
      {currentPath.startsWith('#/admin') ? (
        <AdminDashboard />
      ) : (
        <CustomerForm />
      )}
    </div>
  );
}

export default App;

