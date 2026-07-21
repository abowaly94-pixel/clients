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

      {/* Sleek Floating Navigation Pill */}
      <nav className="floating-nav-bar" aria-label="التنقل الرئيسي">
        <a 
          href="#/" 
          className={`floating-nav-item ${currentPath === '#/' || currentPath === '' ? 'active' : ''}`}
        >
          <Sparkles size={16} />
          <span>طلب جديد</span>
        </a>
        <div className="floating-nav-divider"></div>
        <a 
          href="#/admin" 
          className={`floating-nav-item ${currentPath.startsWith('#/admin') ? 'active' : ''}`}
        >
          <ShieldAlert size={16} />
          <span>لوحة التحكم</span>
        </a>
      </nav>
    </div>
  );
}

export default App;

