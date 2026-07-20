import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Search, 
  MapPin, 
  Phone, 
  MessageSquare, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Lock, 
  CheckCircle, 
  Clock, 
  Truck, 
  RefreshCw, 
  Layers,
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import L from 'leaflet';

const ADMIN_PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE || '12345';

const STATUS_LABELS = {
  pending: { label: 'معلق (بانتظار الاستلام)', color: 'pending', next: 'picked_up', nextLabel: 'تأكيد استلام الملابس' },
  picked_up: { label: 'تم الاستلام (بالمغسلة)', color: 'picked_up', next: 'in_progress', nextLabel: 'بدء الغسيل والكي' },
  in_progress: { label: 'قيد الغسيل والكي', color: 'in_progress', next: 'ready', nextLabel: 'تجهيز الطلب للتسليم' },
  ready: { label: 'جاهز للتسليم', color: 'ready', next: 'delivered', nextLabel: 'تأكيد توصيل الطلب للعميل' },
  delivered: { label: 'تم التوصيل للعميل', color: 'delivered', next: null, nextLabel: null },
};

const LAUNDRY_ITEM_LABELS = {
  blankets: { name: 'بطاطين / لحاف', icon: '🛏️' },
  suits: { name: 'بدل / فساتين', icon: '👔' },
  clothes: { name: 'قطع ملابس عادي', icon: '👕' },
  carpets: { name: 'سجاد / موكيت', icon: '🧹' },
  others: { name: 'أخرى (ستائر / إلخ)', icon: '🧺' },
};

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState(['', '', '', '', '']);
  const [passcodeError, setPasscodeError] = useState(false);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, picked_up, in_progress, ready, delivered
  const [soundEnabled, setSoundEnabled] = useState(true);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerInstanceRef = useRef(null);
  const passcodeRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];

  // Synthesize a premium double-beep notification sound
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      // First beep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain1.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);

      // Second beep
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12); // A5 note
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.12);
      gain2.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.17);
      gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.32);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.32);
    } catch (e) {
      console.warn('Could not play notification sound:', e);
    }
  };

  // Fetch initial orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
      
      // Auto select the first order if available on desktop
      if (data && data.length > 0 && !selectedOrder) {
        setSelectedOrder(data[0]);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Real-time Database Subscription
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchOrders();

    // Subscribe to INSERT & UPDATE changes on orders table
    const ordersChannel = supabase
      .channel('public:orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Realtime update received:', payload);
          
          if (payload.eventType === 'INSERT') {
            setOrders((prev) => [payload.new, ...prev]);
            playNotificationSound();
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) => 
              prev.map((order) => order.id === payload.new.id ? payload.new : order)
            );
            // Update selected order details if currently viewing it
            setSelectedOrder((prev) => 
              prev && prev.id === payload.new.id ? payload.new : prev
            );
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) => prev.filter((order) => order.id !== payload.old.id));
            setSelectedOrder((prev) => prev && prev.id === payload.old.id ? null : prev);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, [isAuthenticated]);

  // Update Detail Map when selected order changes
  useEffect(() => {
    if (selectedOrder && mapContainerRef.current) {
      const { latitude, longitude } = selectedOrder;

      const timer = setTimeout(() => {
        if (!mapInstanceRef.current) {
          const map = L.map(mapContainerRef.current, {
            center: [latitude, longitude],
            zoom: 15,
            zoomControl: true,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
          }).addTo(map);

          const marker = L.marker([latitude, longitude]).addTo(map);

          mapInstanceRef.current = map;
          markerInstanceRef.current = marker;
        } else {
          mapInstanceRef.current.setView([latitude, longitude], 15);
          markerInstanceRef.current.setLatLng([latitude, longitude]);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [selectedOrder]);

  // Handle Passcode Input Change
  const handlePasscodeChange = (index, value) => {
    if (isNaN(value)) return;
    const newPasscode = [...passcode];
    newPasscode[index] = value;
    setPasscode(newPasscode);

    // Auto-focus next field
    if (value !== '' && index < 4) {
      passcodeRefs[index + 1].current.focus();
    }

    // Verify passcode once 5 digits are entered
    const entered = newPasscode.join('');
    if (entered.length === 5) {
      if (entered === ADMIN_PASSCODE) {
        setIsAuthenticated(true);
        setPasscodeError(false);
      } else {
        setPasscodeError(true);
        setPasscode(['', '', '', '', '']);
        passcodeRefs[0].current.focus();
      }
    }
  };

  const handlePasscodeKeyDown = (index, e) => {
    // Handle backspace back-focus
    if (e.key === 'Backspace' && passcode[index] === '' && index > 0) {
      passcodeRefs[index - 1].current.focus();
    }
  };

  // Update Order Status
  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .select();

      if (error) throw error;
    } catch (err) {
      alert('فشل تحديث حالة الطلب: ' + err.message);
    }
  };

  // Delete Order
  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;
    } catch (err) {
      alert('فشل حذف الطلب: ' + err.message);
    }
  };

  // Stats computation
  const getStats = () => {
    const total = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const working = orders.filter(o => o.status === 'picked_up' || o.status === 'in_progress').length;
    
    let totalItems = 0;
    orders.forEach(o => {
      if (o.items) {
        totalItems += Object.values(o.items).reduce((a, b) => a + b, 0);
      }
    });

    return { total, pending, working, totalItems };
  };

  const stats = getStats();

  // Filters application
  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.phone.includes(searchQuery);

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Pre-filled WhatsApp notification message builders
  const getWhatsAppLink = (order, type) => {
    let msg = '';
    const totalPcs = order.items ? Object.values(order.items).reduce((a, b) => a + b, 0) : 0;
    
    if (type === 'pickup') {
      msg = `مرحباً ${order.customer_name}، نحن شركة لاندري جو. مندوبنا في الطريق إليك الآن لاستلام الملابس (إجمالي: ${totalPcs} قطع). يرجى التجهيز.`;
    } else if (type === 'ready') {
      msg = `مرحباً ${order.customer_name}، يسعدنا إخبارك بأن ملابسك جاهزة وتم غسلها وكيها بالكامل. مندوب التوصيل سيتصل بك قريباً للتسليم. شكراً لاختيارك لاندري جو!`;
    }
    
    // Format customer phone (strip lead 0 and add country code if needed, assuming Egypt +20 default)
    let cleanPhone = order.phone.replace(/[\s-+]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '20' + cleanPhone.substring(1);
    }
    
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  // Helper count of orders by status type
  const getStatusCount = (status) => {
    if (status === 'all') return orders.length;
    return orders.filter(o => o.status === status).length;
  };

  if (!isAuthenticated) {
    return (
      <div className="passcode-layout">
        <div className="passcode-card animate-scale">
          <div className="passcode-icon">
            <Lock size={32} />
          </div>
          <div>
            <h2 style={{ fontWeight: 800, marginBottom: '0.25rem' }}>دخول الإدارة</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>أدخل رمز المرور المكون من 5 أرقام لدخول النظام</p>
          </div>
          
          <div className="passcode-inputs">
            {passcode.map((digit, idx) => (
              <input 
                key={idx}
                ref={passcodeRefs[idx]}
                type="text"
                maxLength="1"
                className="passcode-digit"
                value={digit}
                onChange={(e) => handlePasscodeChange(idx, e.target.value)}
                onKeyDown={(e) => handlePasscodeKeyDown(idx, e)}
                dir="ltr"
              />
            ))}
          </div>

          {passcodeError && (
            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 700 }}>
              ⚠️ الرمز السري غير صحيح. حاول مجدداً.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout animate-fade">
      {/* Upper Analytics/KPI Grid */}
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="analytics-info">
            <span className="analytics-label">إجمالي الطلبات</span>
            <span className="analytics-value">{stats.total}</span>
          </div>
          <div className="analytics-icon-wrapper">
            <Layers size={24} />
          </div>
        </div>

        <div className={`analytics-card ${stats.pending > 0 ? 'urgent' : ''}`}>
          <div className="analytics-info">
            <span className="analytics-label">بانتظار الاستلام</span>
            <span className="analytics-value">{stats.pending}</span>
          </div>
          <div className="analytics-icon-wrapper">
            <Clock size={24} />
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-info">
            <span className="analytics-label">قيد التنفيذ والمصبغة</span>
            <span className="analytics-value">{stats.working}</span>
          </div>
          <div className="analytics-icon-wrapper">
            <Truck size={24} />
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-info">
            <span className="analytics-label">إجمالي قطع الغسيل</span>
            <span className="analytics-value">{stats.totalItems}</span>
          </div>
          <div className="analytics-icon-wrapper">
            <CheckCircle size={24} />
          </div>
        </div>
      </div>

      {/* Live Search and Tabbed status Filters */}
      <div className="dashboard-controls">
        <div className="search-input-wrapper">
          <Search className="input-icon" size={18} style={{ right: '1rem', left: 'auto' }} />
          <input 
            type="text" 
            className="form-input" 
            placeholder="بحث باسم العميل أو رقم الهاتف..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingRight: '2.5rem' }}
          />
        </div>

        <div className="filter-tabs">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'pending', label: 'المعلقة' },
            { id: 'picked_up', label: 'تم الاستلام' },
            { id: 'in_progress', label: 'قيد الغسيل' },
            { id: 'ready', label: 'جاهز' },
            { id: 'delivered', label: 'تم التوصيل' },
          ].map((tab) => (
            <button 
              key={tab.id}
              className={`filter-tab-btn ${statusFilter === tab.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
              <span className="tab-badge">{getStatusCount(tab.id)}</span>
            </button>
          ))}
        </div>

        {/* Audio control Toggle */}
        <div className="dashboard-header-right">
          <button 
            className="sound-toggle-btn"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "كتم صوت التنبيهات" : "تفعيل صوت التنبيهات"}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button className="btn-nav" onClick={fetchOrders} style={{ padding: '0.4rem 0.8rem' }}>
            <RefreshCw size={14} /> تحديث
          </button>
        </div>
      </div>

      {/* Split Workspace */}
      <div className="dashboard-workspace">
        {/* Left Side: Orders list */}
        <div className="orders-list-panel">
          <div className="orders-list-header">
            <span>الطلبات ({filteredOrders.length})</span>
            {loading && <div className="spinner" style={{ width: 16, height: 16, borderTopColor: 'var(--primary)' }}></div>}
          </div>
          
          <div className="orders-scroller">
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <Layers size={36} />
                <p>لا توجد طلبات تطابق معايير البحث</p>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const totalPcs = order.items ? Object.values(order.items).reduce((a, b) => a + b, 0) : 0;
                const isSelected = selectedOrder && selectedOrder.id === order.id;
                const elapsedMin = Math.round((new Date() - new Date(order.created_at)) / 60000);
                let timeText = '';
                if (elapsedMin < 60) timeText = `منذ ${elapsedMin} دقيقة`;
                else timeText = `منذ ${Math.round(elapsedMin/60)} ساعة`;

                return (
                  <div 
                    key={order.id} 
                    className={`order-row-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="order-row-top">
                      <span className="order-client-name">{order.customer_name}</span>
                      <span className={`order-badge-status ${order.status}`}>
                        {STATUS_LABELS[order.status].label}
                      </span>
                    </div>

                    <div className="order-row-meta">
                      <span style={{ fontFamily: 'var(--font-en)' }}>{order.phone}</span>
                      <span style={{ fontSize: '0.75rem' }}>{timeText}</span>
                    </div>

                    <div className="order-row-meta">
                      <div className="order-row-items-summary">
                        {order.items && Object.entries(order.items).map(([key, val]) => {
                          if (val > 0) {
                            return (
                              <span key={key} className="mini-item-tag">
                                {LAUNDRY_ITEM_LABELS[key]?.icon} {val}
                              </span>
                            );
                          }
                          return null;
                        })}
                      </div>
                      <span style={{ fontWeight: 800 }}>إجمالي: {totalPcs} قطع</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Active Order detail viewer */}
        <div>
          {selectedOrder ? (
            <div className="order-detail-panel animate-scale">
              <div className="detail-header">
                <div className="detail-client-info">
                  <h2>{selectedOrder.customer_name}</h2>
                  <p>تاريخ الطلب: {new Date(selectedOrder.created_at).toLocaleString('ar-EG')}</p>
                </div>
                
                {/* Dial / WhatsApp Actions */}
                <div className="detail-action-buttons">
                  <a 
                    href={`tel:${selectedOrder.phone}`}
                    className="btn-action btn-action-call"
                  >
                    <Phone size={16} /> اتصل بالعميل
                  </a>
                  <a 
                    href={getWhatsAppLink(selectedOrder, 'pickup')}
                    className="btn-action btn-action-whatsapp"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageSquare size={16} /> تنبيه واتساب (استلام)
                  </a>
                </div>
              </div>

              {/* Items Breakdown list */}
              <div>
                <h4 className="detail-section-title">قطع الغسيل المطلوبة</h4>
                <div className="detail-items-table">
                  {selectedOrder.items && Object.entries(selectedOrder.items).map(([key, val]) => (
                    <div key={key} className="detail-item-row" style={{ opacity: val > 0 ? 1 : 0.4 }}>
                      <div className="detail-item-name">
                        <span style={{ fontSize: '1.25rem' }}>{LAUNDRY_ITEM_LABELS[key]?.icon}</span>
                        <span>{LAUNDRY_ITEM_LABELS[key]?.name}</span>
                      </div>
                      <span className="detail-item-qty">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Location details */}
              <div className="detail-map-card">
                <h4 className="detail-section-title">الموقع الجغرافي للعميل</h4>
                {selectedOrder.address_details && (
                  <div className="detail-address-text">
                    <strong>تفاصيل العنوان:</strong> {selectedOrder.address_details}
                  </div>
                )}
                
                <div className="detail-map-wrapper">
                  <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }}></div>
                </div>

                <div className="detail-navigation-row">
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.latitude},${selectedOrder.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-nav-action btn-nav-google"
                  >
                    <MapPin size={16} /> فتح في خرائط جوجل للبدء بالتوجيه
                    <ExternalLink size={14} style={{ marginRight: 'auto' }} />
                  </a>
                </div>
              </div>

              {/* Status Update Dropdown Panel */}
              <div className="detail-status-update">
                <h4 className="detail-section-title" style={{ borderBottom: 'none', marginBottom: 0 }}>متابعة حالة الطلب</h4>
                
                <div className="status-dropdown-wrapper">
                  <select 
                    className="status-select"
                    value={selectedOrder.status}
                    onChange={(e) => handleUpdateStatus(selectedOrder.id, e.target.value)}
                  >
                    <option value="pending">معلق (بانتظار الاستلام)</option>
                    <option value="picked_up">تم استلام الملابس بالمغسلة</option>
                    <option value="in_progress">قيد الغسيل والكي</option>
                    <option value="ready">جاهز للتسليم</option>
                    <option value="delivered">تم التوصيل للعميل</option>
                  </select>

                  {STATUS_LABELS[selectedOrder.status].next && (
                    <button 
                      className="btn-status-save"
                      onClick={() => handleUpdateStatus(selectedOrder.id, STATUS_LABELS[selectedOrder.status].next)}
                    >
                      {STATUS_LABELS[selectedOrder.status].nextLabel}
                    </button>
                  )}
                </div>

                {selectedOrder.status === 'ready' && (
                  <a 
                    href={getWhatsAppLink(selectedOrder, 'ready')}
                    className="btn-wizard"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ 
                      backgroundColor: '#25d366', 
                      color: 'white', 
                      textDecoration: 'none',
                      fontSize: '0.85rem',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <MessageSquare size={16} /> إرسال إشعار واتساب للعميل بجهوزية الغسيل
                  </a>
                )}
              </div>

              {/* Danger Actions: Delete */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn-action" 
                  onClick={() => handleDeleteOrder(selectedOrder.id)}
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}
                >
                  <Trash2 size={16} /> حذف الطلب نهائياً
                </button>
              </div>

            </div>
          ) : (
            <div className="order-detail-panel detail-placeholder">
              <Layers size={48} />
              <h3>لا يوجد طلب محدد</h3>
              <p>اختر طلباً من القائمة الجانبية لعرض كامل تفاصيله</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
