import React, { useState } from 'react';
import { useLang } from '../context/LangContext.js';

export const DemoRequestPage: React.FC = () => {
  const { t, isRtl } = useLang();
  const [formData, setFormData] = useState({
    organization_name: '',
    contact_name: '',
    email: '',
    phone: '',
    center_type: 'clinic',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/public/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to submit demo request.');
      }
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell" style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div className="recognition-laurel-pair">
          <div className="recognition-laurel-item">
            <span>🌿</span>
            <span>{isRtl ? 'طلب شراكة وعرض حي' : 'Live Institutional Demo'}</span>
            <span>🌿</span>
          </div>
        </div>
        <h1 className="text-display" style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)', margin: '14px 0' }}>
          {t.demo.title}
        </h1>
        <p className="text-subhead">
          {t.demo.desc}
        </p>
      </div>

      <div className="cloud-feature-card" style={{ padding: '40px 48px' }}>
        {success ? (
          <div className="motion-tab-enter" style={{ textAlign: 'center', padding: '30px 20px' }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'var(--color-paper-white)',
              color: 'var(--color-recovery-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.2rem',
              margin: '0 auto 20px',
              boxShadow: '0 4px 16px rgba(15, 62, 23, 0.2)',
            }}>
              ✓
            </div>
            <h2 className="text-card-heading" style={{ fontSize: 26, color: 'var(--color-ink)', marginBottom: 12 }}>
              {t.demo.successTitle}
            </h2>
            <p style={{ fontSize: 16, color: 'var(--color-body-gray)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto 28px' }}>
              {t.demo.successMsg}
            </p>
            <button
              onClick={() => {
                setSuccess(false);
                setFormData({
                  organization_name: '',
                  contact_name: '',
                  email: '',
                  phone: '',
                  center_type: 'clinic',
                  notes: '',
                });
              }}
              className="btn-pill btn-pill-charcoal"
              style={{ padding: '10px 24px' }}
            >
              {isRtl ? 'إرسال طلب إضافي' : 'Submit Another Request'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {errorMsg && (
              <div
                className="motion-alert-enter"
                style={{
                  background: 'var(--color-status-danger-bg)',
                  border: '1px solid var(--color-status-danger-border)',
                  borderRadius: 14,
                  padding: '12px 18px',
                  color: 'var(--color-status-danger-text)',
                  fontSize: 14,
                  marginBottom: 24,
                }}
              >
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 20 }}>
              <div className="form-group">
                <label className="form-label">{t.demo.orgName} *</label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? 'مثال: مجمع الشفاء الطبي' : 'e.g. Al-Shifa Medical Center'}
                  value={formData.organization_name}
                  onChange={(e) => setFormData({ ...formData, organization_name: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t.demo.contactName} *</label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? 'الاسم الثلاثي' : 'Full Name'}
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 20, marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">{t.demo.email} *</label>
                <input
                  type="email"
                  required
                  placeholder="name@hospital.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t.demo.phone}</label>
                <input
                  type="tel"
                  placeholder="+966 5X XXX XXXX"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">{t.demo.centerType}</label>
              <select
                value={formData.center_type}
                onChange={(e) => setFormData({ ...formData, center_type: e.target.value })}
                className="form-select"
              >
                <option value="clinic">{isRtl ? 'عيادة تخصصية أو مجمع طبي' : 'Specialized Clinic'}</option>
                <option value="hospital">{isRtl ? 'مستشفى متكامل' : 'General Hospital'}</option>
                <option value="medical_center">{isRtl ? 'مركز طبي جراحي' : 'Surgical Center'}</option>
                <option value="other">{isRtl ? 'منشأة رعاية أخرى' : 'Other Health Facility'}</option>
              </select>
            </div>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">{t.demo.notes}</label>
              <textarea
                placeholder={isRtl ? 'أخبرنا عن عدد الأطباء أو متطلبات الربط...' : 'Tell us about your team size or integration needs...'}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="form-textarea"
              />
            </div>

            <div style={{ marginTop: 32, textAlign: 'center' }}>
              <button
                type="submit"
                disabled={loading}
                className="btn-pill btn-pill-charcoal"
                style={{ width: '100%', maxWidth: 320, padding: '14px 28px', fontSize: 16 }}
              >
                {loading ? t.common.loading : t.demo.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
