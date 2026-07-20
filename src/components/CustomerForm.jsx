import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { 
  User, 
  Phone, 
  MapPin, 
  Sparkles, 
  Plus, 
  Minus, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Navigation,
  Locate,
  ShoppingBag
} from 'lucide-react';
import L from 'leaflet';

// Fix Leaflet marker icon issue in production builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const LAUNDRY_CATEGORIES = [
  { id: 'carpets', label: 'سجاد / موكيت', icon: '🧹' },
  { id: 'blankets', label: 'بطاطين', icon: '🛏️' },
  { id: 'quilts', label: 'لحاف', icon: '🛋️' },
  { id: 'hafiza', label: 'حافظة سجاد', icon: '🧺' },
  { id: 'chemical_wash', label: 'غسيل كيميكال بموقع العميل', icon: '✨' },
];

export default function CustomerForm() {
  const [step, setStep] = useState(0); // 0: Welcome, 1: Contact info, 2: Items counts, 3: Map selection, 4: Success
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState({
    carpets: 0,
    blankets: 0,
    quilts: 0,
    hafiza: 0,
    chemical_wash: 0,
  });
  const [chemicalDate, setChemicalDate] = useState('');
  const [chemicalTime, setChemicalTime] = useState('');
  const [addressDetails, setAddressDetails] = useState('');
  const [coordinates, setCoordinates] = useState({ lat: 30.0444, lng: 31.2357 }); // Default Cairo
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle, fetching, success, error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedOrderId, setSubmittedOrderId] = useState('');

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerInstanceRef = useRef(null);

  // Initialize and update Map
  useEffect(() => {
    if (step === 3 && mapContainerRef.current) {
      // Small timeout to allow container render in DOM before Leaflet binds
      const timer = setTimeout(() => {
        if (!mapInstanceRef.current) {
          // Create map
          const map = L.map(mapContainerRef.current, {
            center: [coordinates.lat, coordinates.lng],
            zoom: 15,
            zoomControl: true,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
          }).addTo(map);

          // Add draggable marker
          const marker = L.marker([coordinates.lat, coordinates.lng], {
            draggable: true,
          }).addTo(map);

          marker.on('dragend', () => {
            const position = marker.getLatLng();
            setCoordinates({ lat: position.lat, lng: position.lng });
          });

          mapInstanceRef.current = map;
          markerInstanceRef.current = marker;
        } else {
          // If map already exists, update center and marker
          mapInstanceRef.current.setView([coordinates.lat, coordinates.lng], 15);
          markerInstanceRef.current.setLatLng([coordinates.lat, coordinates.lng]);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [step]);

  // Handle auto GPS detection
  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setErrorMsg('المتصفح لا يدعم تحديد الموقع الجغرافي');
      return;
    }

    setGpsStatus('fetching');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newCoords = { lat: latitude, lng: longitude };
        setCoordinates(newCoords);
        setGpsStatus('success');
        setErrorMsg('');

        // If map exists, update marker position
        if (mapInstanceRef.current && markerInstanceRef.current) {
          mapInstanceRef.current.setView([latitude, longitude], 16);
          markerInstanceRef.current.setLatLng([latitude, longitude]);
        }
      },
      (error) => {
        console.error(error);
        setGpsStatus('error');
        setErrorMsg('فشل تحديد الموقع تلقائياً. يمكنك تحريك الخريطة لتحديد مكانك بدقة.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleIncrement = (catId) => {
    setItems(prev => ({
      ...prev,
      [catId]: prev[catId] + 1
    }));
  };

  const handleDecrement = (catId) => {
    setItems(prev => ({
      ...prev,
      [catId]: Math.max(0, prev[catId] - 1)
    }));
  };

  const getTotalItems = () => {
    return Object.values(items).reduce((a, b) => a + b, 0);
  };

  // Next Step validation
  const handleNextStep = () => {
    setErrorMsg('');
    if (step === 1) {
      if (!customerName.trim()) {
        setErrorMsg('برجاء إدخال الاسم بالكامل');
        return;
      }
      if (!phone.trim()) {
        setErrorMsg('برجاء إدخال رقم الهاتف');
        return;
      }
      // Simple phone format check (numbers only, minimum length)
      const phoneRegex = /^[0-9+\s-]{8,15}$/;
      if (!phoneRegex.test(phone)) {
        setErrorMsg('رقم الهاتف غير صالح');
        return;
      }
    }
    if (step === 2) {
      if (getTotalItems() === 0) {
        setErrorMsg('برجاء إضافة قطعة واحدة على الأقل للمتابعة');
        return;
      }
    }
    setStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setErrorMsg('');
    setStep(prev => prev - 1);
  };

  // Submit Order to Supabase
  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      let finalAddress = addressDetails.trim();
      if (items.chemical_wash > 0 && (chemicalDate || chemicalTime)) {
        finalAddress += `\n✨ [ميعاد غسيل الكيميكال: ${chemicalDate || 'غير محدد'} ${chemicalTime || ''}]`;
      }

      const orderData = {
        customer_name: customerName.trim(),
        phone: phone.trim(),
        items: items,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        address_details: finalAddress,
        status: 'pending'
      };

      const { data, error } = await supabase
        .from('orders')
        .insert([orderData])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        setSubmittedOrderId(data[0].id);
        setStep(4); // Success screen
      } else {
        throw new Error('حدث خطأ أثناء حفظ الطلب');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'فشل الاتصال بالخادم. يرجى المحاولة لاحقاً.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="wizard-layout">
      <div className="wizard-card">
        {/* Progress Step Indicator (Show on screens 1, 2, 3) */}
        {step > 0 && step < 4 && (
          <div className="wizard-progress">
            <div className="progress-line-bg"></div>
            <div 
              className="progress-line-fill" 
              style={{ width: `${((step - 1) / 2) * 100}%` }}
            ></div>
            <div className={`progress-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
              {step > 1 ? <Check size={16} /> : '1'}
            </div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
              {step > 2 ? <Check size={16} /> : '2'}
            </div>
            <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
              3
            </div>
          </div>
        )}

        {/* STEP 0: Welcome Hero Screen */}
        {step === 0 && (
          <div className="welcome-hero animate-fade">
            <div className="welcome-illustration" style={{ background: '#ffffff', padding: '1.2rem', width: '140px', height: '140px', borderRadius: '50%', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
              <img src="/logo.png" alt="Clean Code Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
            </div>
            <div className="wizard-header">
              <h1>Clean Code | كلين كود</h1>
              <p>أسرع خدمة لطلب جمع الغسيل وتحديد موقعك بدقة</p>
            </div>
            
            <div className="welcome-features">
              <div className="welcome-feature-item">
                <Check size={18} />
                <span>إدخال أعداد قطع الغسيل بسهولة</span>
              </div>
              <div className="welcome-feature-item">
                <Check size={18} />
                <span>تحديد موقعك الجغرافي مباشرة لإرسال المندوب</span>
              </div>
              <div className="welcome-feature-item">
                <Check size={18} />
                <span>متابعة الطلب مباشرة عبر الواتساب</span>
              </div>
            </div>

            <button className="btn-wizard btn-wizard-primary" onClick={() => setStep(1)}>
              ابدأ طلبك الآن
              <ChevronLeft size={20} style={{ marginRight: 'auto' }} />
            </button>
          </div>
        )}

        {/* STEP 1: Customer Details */}
        {step === 1 && (
          <div className="animate-fade">
            <div className="wizard-header" style={{ marginBottom: '1.5rem' }}>
              <h1>البيانات الشخصية</h1>
              <p>أدخل اسمك ورقم هاتفك للتواصل</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label>الاسم بالكامل</label>
                <div className="input-wrapper">
                  <User className="input-icon" size={20} />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="مثال: محمد أحمد علي"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>رقم الهاتف (الواتساب)</label>
                <div className="input-wrapper">
                  <Phone className="input-icon" size={20} />
                  <input 
                    type="tel" 
                    className="form-input" 
                    placeholder="مثال: 01012345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              {errorMsg && <div style={{ color: 'var(--danger)', fontSize: '0.9rem', fontWeight: 700, textAlign: 'right' }}>⚠️ {errorMsg}</div>}

              <div className="wizard-actions">
                <button className="btn-wizard btn-wizard-secondary" onClick={handlePrevStep}>
                  السابق
                </button>
                <button className="btn-wizard btn-wizard-primary" onClick={handleNextStep}>
                  المتابعة
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Laundry Items selection */}
        {step === 2 && (
          <div className="animate-fade">
            <div className="wizard-header" style={{ marginBottom: '1.5rem' }}>
              <h1>محتويات الطلب</h1>
              <p>حدد أعداد القطع التي ترغب في غسلها</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="items-grid">
                {LAUNDRY_CATEGORIES.map((cat) => (
                  <div 
                    key={cat.id} 
                    className={`item-counter-card ${items[cat.id] > 0 ? 'has-items' : ''}`}
                  >
                    <div className="item-card-header">
                      <span style={{ fontSize: '1.5rem' }}>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </div>
                    <div className="counter-controls">
                      <button 
                        type="button" 
                        className="btn-counter" 
                        onClick={() => handleDecrement(cat.id)}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="counter-value">{items[cat.id]}</span>
                      <button 
                        type="button" 
                        className="btn-counter" 
                        onClick={() => handleIncrement(cat.id)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {items.chemical_wash > 0 && (
                <div style={{
                  background: 'var(--primary-light)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  textAlign: 'right'
                }}>
                  <div style={{ fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                    ✨ حدد ميعاد غسيل الكيميكال في مكانك:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.85rem' }}>التاريخ المطلوب</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={chemicalDate} 
                        onChange={(e) => setChemicalDate(e.target.value)} 
                        style={{ paddingRight: '1rem' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.85rem' }}>الوقت / الموعد</label>
                      <input 
                        type="time" 
                        className="form-input" 
                        value={chemicalTime} 
                        onChange={(e) => setChemicalTime(e.target.value)} 
                        style={{ paddingRight: '1rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ 
                background: 'var(--primary-light)', 
                padding: '0.85rem 1rem', 
                borderRadius: 'var(--radius-sm)',
                display: 'flex', 
                justifyContent: 'space-between',
                fontWeight: 800,
                fontSize: '1rem',
                color: 'var(--primary)'
              }}>
                <span>إجمالي القطع المحددة:</span>
                <span className="counter-value">{getTotalItems()} قطع</span>
              </div>

              {errorMsg && <div style={{ color: 'var(--danger)', fontSize: '0.9rem', fontWeight: 700, textAlign: 'right' }}>⚠️ {errorMsg}</div>}

              <div className="wizard-actions">
                <button className="btn-wizard btn-wizard-secondary" onClick={handlePrevStep}>
                  السابق
                </button>
                <button className="btn-wizard btn-wizard-primary" onClick={handleNextStep}>
                  المتابعة
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Map selection */}
        {step === 3 && (
          <div className="animate-fade">
            <div className="wizard-header" style={{ marginBottom: '1.25rem' }}>
              <h1>تحديد موقع التوصيل</h1>
              <p>حدد موقعك بدقة على الخريطة لتسليم الغسيل للمندوب</p>
            </div>

            <div className="map-selection-container">
              {/* GPS detect button */}
              <button 
                type="button" 
                className="map-gps-btn"
                onClick={handleDetectGPS}
                disabled={gpsStatus === 'fetching'}
              >
                {gpsStatus === 'fetching' ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
                    جاري تحديد موقعك...
                  </>
                ) : (
                  <>
                    <Locate size={18} />
                    تحديد موقعي الحالي تلقائياً
                  </>
                )}
              </button>

              {gpsStatus === 'success' && (
                <div className="map-gps-indicator success animate-fade">
                  <Check size={14} />
                  <span>تم تحديد الموقع بدقة! يمكنك سحب الدبوس للتعديل.</span>
                </div>
              )}

              {/* Map container */}
              <div className="map-wrapper">
                <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }}></div>
              </div>

              {/* Address details */}
              <div className="form-group">
                <label>تفاصيل العنوان (رقم العمارة، الطابق، الشقة، علامة مميزة)</label>
                <div className="input-wrapper">
                  <MapPin className="input-icon" size={20} />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="مثال: عمارة 5ب، الدور الثالث، شقة 12 بجوار صيدلية علي"
                    value={addressDetails}
                    onChange={(e) => setAddressDetails(e.target.value)}
                  />
                </div>
              </div>

              {errorMsg && <div style={{ color: 'var(--danger)', fontSize: '0.9rem', fontWeight: 700, textAlign: 'right' }}>⚠️ {errorMsg}</div>}

              <div className="wizard-actions">
                <button className="btn-wizard btn-wizard-secondary" onClick={handlePrevStep} disabled={isSubmitting}>
                  السابق
                </button>
                <button 
                  className="btn-wizard btn-wizard-primary" 
                  onClick={handleSubmitOrder}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <div className="spinner"></div>
                  ) : (
                    <>
                      تأكيد وإرسال الطلب
                      <Check size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Success Confirmation Screen */}
        {step === 4 && (
          <div className="success-panel animate-scale">
            <div className="success-badge">
              <Check size={48} />
            </div>
            
            <div className="wizard-header">
              <h1>تم استلام طلبك بنجاح!</h1>
              <p>سيتواصل معك مندوبنا لاستلام الملابس قريباً</p>
            </div>

            <div className="success-summary">
              <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.3rem', marginBottom: '0.5rem', fontWeight: 800 }}>تفاصيل الطلب:</h3>
              <div className="summary-row">
                <span className="summary-label">اسم العميل:</span>
                <span className="summary-val">{customerName}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">رقم الهاتف:</span>
                <span className="summary-val">{phone}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">إجمالي القطع:</span>
                <span className="summary-val">{getTotalItems()} قطع</span>
              </div>
              {addressDetails && (
                <div className="summary-row">
                  <span className="summary-label">تفاصيل العنوان:</span>
                  <span className="summary-val">{addressDetails}</span>
                </div>
              )}
            </div>

            <a 
              className="btn-wizard btn-wizard-primary"
              href={`https://wa.me/20123456789?text=${encodeURIComponent(
                `مرحباً، لقد أرسلت طلباً جديداً لغسيل الملابس باسم: ${customerName}، وإجمالي قطع الغسيل: ${getTotalItems()} قطع.\nرابط موقعي الجغرافي: https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', backgroundColor: '#25d366' }}
            >
              تأكيد الطلب على الواتساب
              <Check size={18} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
