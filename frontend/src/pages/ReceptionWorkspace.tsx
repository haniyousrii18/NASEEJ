import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';

export const ReceptionWorkspace: React.FC = () => {
  const { apiFetch, currentOrgId } = useAuth();
  const { t, isRtl } = useLang();

  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // New Patient Modal
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [patientForm, setPatientForm] = useState({
    national_id: '',
    full_name_ar: '',
    full_name_en: '',
    date_of_birth: '1990-01-01',
    gender: 'male',
    blood_type: 'O+',
    phone: '',
    email: '',
  });

  // Book Appointment Modal
  const [showBooking, setShowBooking] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    patient_id: '',
    clinician_id: '',
    appointment_date: new Date().toISOString().split('T')[0],
    start_time: '10:00',
    end_time: '10:30',
    reason: '',
  });
  const [bookingError, setBookingError] = useState('');

  const loadData = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      const [apptsRes, ptsRes, staffRes] = await Promise.all([
        apiFetch('/api/appointments'),
        apiFetch(`/api/patients?search=${encodeURIComponent(searchTerm)}`),
        apiFetch(`/api/organizations/${currentOrgId}/members`),
      ]);
      setAppointments(apptsRes.data || []);
      setPatients(ptsRes.data || []);
      // Filter for doctors
      setStaff(staffRes.data?.filter((m: any) => m.role === 'doctor') || []);
    } catch (err) {
      console.error('Error loading reception workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentOrgId, searchTerm]);

  const handleCheckIn = async (appointmentId: string) => {
    try {
      await apiFetch(`/api/appointments/${appointmentId}/check-in`, { method: 'PATCH' });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error recording check-in');
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/patients', {
        method: 'POST',
        body: JSON.stringify(patientForm),
      });
      setShowNewPatient(false);
      setPatientForm({
        national_id: '',
        full_name_ar: '',
        full_name_en: '',
        date_of_birth: '1990-01-01',
        gender: 'male',
        blood_type: 'O+',
        phone: '',
        email: '',
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error registering patient');
    }
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');

    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify(bookingForm),
      });
      setShowBooking(false);
      setBookingForm({
        patient_id: '',
        clinician_id: '',
        appointment_date: new Date().toISOString().split('T')[0],
        start_time: '10:00',
        end_time: '10:30',
        reason: '',
      });
      loadData();
    } catch (err: any) {
      setBookingError(err.message || 'Booking conflict');
    }
  };

  return (
    <div className="page-shell" style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 80px' }}>
      {/* Reception Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <div className="recognition-laurel-item" style={{ marginBottom: 4 }}>
            <span>🌿</span>
            <span>{isRtl ? 'الاستقبال وخدمات المرضى · Reception Services' : 'Reception & Patient Flow Desk'}</span>
          </div>
          <h1 className="text-card-heading" style={{ fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)', margin: '4px 0' }}>
            {isRtl ? 'تسجيل المرضى، وجدولة المواعيد، وتأكيد الحضور' : 'Patient Registration, Scheduling & Arrival Check-In'}
          </h1>
        </div>
        <div className="responsive-actions" style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setShowNewPatient(true)}
            className="btn-pill btn-pill-charcoal"
            style={{ fontSize: 14, padding: '10px 20px' }}
          >
            + {t.clinical.newPatientBtn}
          </button>
          <button
            onClick={() => setShowBooking(true)}
            className="btn-pill btn-pill-cloud"
            style={{ fontSize: 14, padding: '10px 20px', background: 'var(--color-cloud-card)' }}
          >
            + {t.clinical.newAppointmentBtn}
          </button>
        </div>
      </div>

      {/* Booking Modal */}
      {showBooking && (
        <div className="cloud-feature-card motion-alert-enter" style={{ marginBottom: 32, padding: 32, background: 'var(--color-paper-white)', border: '1.5px solid var(--color-charcoal)', boxShadow: 'var(--shadow-raised)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 className="text-card-heading" style={{ fontSize: 20, margin: 0 }}>
                {isRtl ? 'حجز موعد جديد (مع فحص منع التضارب السحابي)' : 'Book Appointment (Server Conflict Detection)'}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 4 }}>
                {isRtl ? 'خوارزمية الخادم تمنع الحجز المزدوج لأي طبيب في نفس الوقت' : 'Server algorithms strictly prevent double-booking clinicians'}
              </div>
            </div>
            <button onClick={() => setShowBooking(false)} className="btn-pill btn-pill-ghost">
              {t.common.cancel}
            </button>
          </div>

          {bookingError && (
            <div
              className="motion-alert-enter"
              style={{
                background: 'var(--color-status-danger-bg)',
                border: '1px solid var(--color-status-danger-border)',
                borderRadius: 14,
                padding: '12px 18px',
                color: 'var(--color-status-danger-text)',
                fontSize: 14,
                marginBottom: 20,
              }}
            >
              ⚠️ {bookingError}
            </div>
          )}

          <form onSubmit={handleBookAppointment}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">{isRtl ? 'المريض' : 'Patient'} *</label>
                <select
                  required
                  value={bookingForm.patient_id}
                  onChange={(e) => setBookingForm({ ...bookingForm, patient_id: e.target.value })}
                  className="form-select"
                >
                  <option value="">{isRtl ? 'اختر المريض...' : 'Select patient...'}</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isRtl ? p.full_name_ar : p.full_name_en} ({p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.clinical.clinician} *</label>
                <select
                  required
                  value={bookingForm.clinician_id}
                  onChange={(e) => setBookingForm({ ...bookingForm, clinician_id: e.target.value })}
                  className="form-select"
                >
                  <option value="">{isRtl ? 'اختر الطبيب المعالج...' : 'Select clinician...'}</option>
                  {staff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {isRtl ? s.full_name_ar : s.full_name_en} ({s.specialty_ar || s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.clinical.date} *</label>
                <input
                  type="date"
                  required
                  value={bookingForm.appointment_date}
                  onChange={(e) => setBookingForm({ ...bookingForm, appointment_date: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{isRtl ? 'وقت البدء' : 'Start Time'} *</label>
                <input
                  type="time"
                  required
                  value={bookingForm.start_time}
                  onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{isRtl ? 'وقت الانتهاء' : 'End Time'} *</label>
                <input
                  type="time"
                  required
                  value={bookingForm.end_time}
                  onChange={(e) => setBookingForm({ ...bookingForm, end_time: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{isRtl ? 'سبب الزيارة' : 'Reason'}</label>
                <input
                  type="text"
                  placeholder={isRtl ? 'فحص دوري واستشارة' : 'General check-up'}
                  value={bookingForm.reason}
                  onChange={(e) => setBookingForm({ ...bookingForm, reason: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button type="button" onClick={() => setShowBooking(false)} className="btn-pill btn-pill-ghost">
                {t.common.cancel}
              </button>
              <button type="submit" className="btn-pill btn-pill-charcoal">
                {isRtl ? 'تأكيد الحجز' : 'Confirm Booking'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Patient Registration Modal */}
      {showNewPatient && (
        <div className="cloud-feature-card motion-alert-enter" style={{ marginBottom: 32, padding: 32, background: 'var(--color-paper-white)', border: '1.5px solid var(--color-charcoal)', boxShadow: 'var(--shadow-raised)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 className="text-card-heading" style={{ fontSize: 20, margin: 0 }}>
                {isRtl ? 'تسجيل مريض جديد وربطه بالمنشأة' : 'Register New Patient & Assign Center MRN'}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 4 }}>
                {isRtl ? 'توليد كود MRN محلي للمركز وفق ضوابط الخصوصية' : 'Assigns a scoped MRN for this health facility'}
              </div>
            </div>
            <button onClick={() => setShowNewPatient(false)} className="btn-pill btn-pill-ghost">
              {t.common.cancel}
            </button>
          </div>

          <form onSubmit={handleCreatePatient}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">{t.clinical.nationalId} *</label>
                <input
                  type="text"
                  required
                  placeholder="10XXXXXXXX"
                  value={patientForm.national_id}
                  onChange={(e) => setPatientForm({ ...patientForm, national_id: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{isRtl ? 'الاسم الكامل بالعربية' : 'Full Name (Arabic)'} *</label>
                <input
                  type="text"
                  required
                  placeholder="سعود بن ناصر العتيبي"
                  value={patientForm.full_name_ar}
                  onChange={(e) => setPatientForm({ ...patientForm, full_name_ar: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{isRtl ? 'الاسم الكامل بالإنجليزية' : 'Full Name (English)'} *</label>
                <input
                  type="text"
                  required
                  placeholder="Saud Nasser Al-Otaibi"
                  value={patientForm.full_name_en}
                  onChange={(e) => setPatientForm({ ...patientForm, full_name_en: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{isRtl ? 'تاريخ الميلاد' : 'Date of Birth'} *</label>
                <input
                  type="date"
                  required
                  value={patientForm.date_of_birth}
                  onChange={(e) => setPatientForm({ ...patientForm, date_of_birth: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{isRtl ? 'الجنس' : 'Gender'} *</label>
                <select
                  value={patientForm.gender}
                  onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value as any })}
                  className="form-select"
                >
                  <option value="male">{isRtl ? 'ذكر' : 'Male'}</option>
                  <option value="female">{isRtl ? 'أنثى' : 'Female'}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{isRtl ? 'رقم الجوال' : 'Phone'} *</label>
                <input
                  type="tel"
                  required
                  placeholder="+966 50 000 0000"
                  value={patientForm.phone}
                  onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button type="button" onClick={() => setShowNewPatient(false)} className="btn-pill btn-pill-ghost">
                {t.common.cancel}
              </button>
              <button type="submit" className="btn-pill btn-pill-charcoal">
                {isRtl ? 'تسجيل المريض وتوليد الـ MRN' : 'Register & Assign MRN'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Appointments & Check-in Table */}
      <div className="cloud-feature-card" style={{ padding: 28, marginBottom: 32 }}>
        <h3 className="text-card-heading" style={{ fontSize: 20, marginBottom: 20 }}>
          {isRtl ? 'جدول المواعيد وتسجيل الوصول (Arrival Check-In)' : 'Appointments & Arrival Check-In'}
        </h3>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{isRtl ? 'المريض' : 'Patient'}</th>
                <th>{t.clinical.clinician}</th>
                <th>{t.clinical.date}</th>
                <th>{isRtl ? 'الوقت' : 'Time'}</th>
                <th>{t.clinical.status}</th>
                <th>{isRtl ? 'إجراء الاستقبال' : 'Arrival Action'}</th>
              </tr>
            </thead>
            <tbody>
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--color-body-gray)' }}>
                    {t.common.noData}
                  </td>
                </tr>
              ) : (
                appointments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {isRtl ? a.patient_name_ar : a.patient_name_en}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{a.patient_phone}</div>
                    </td>
                    <td>{isRtl ? a.clinician_name_ar : a.clinician_name_en}</td>
                    <td>{new Date(a.appointment_date).toLocaleDateString()}</td>
                    <td>{a.start_time} - {a.end_time}</td>
                    <td>
                      <span className={`status-badge ${
                        a.status === 'checked_in' ? 'badge-approved' :
                        a.status === 'confirmed' ? 'badge-info' : 'badge-draft'
                      }`}>
                        {a.status === 'checked_in' ? t.clinical.checkedIn :
                         a.status === 'confirmed' ? t.clinical.confirmed : a.status}
                      </span>
                    </td>
                    <td>
                      {a.status === 'confirmed' ? (
                        <button
                          onClick={() => handleCheckIn(a.id)}
                          className="btn-pill btn-pill-charcoal"
                          style={{ fontSize: 12, padding: '6px 14px' }}
                        >
                          ✓ {isRtl ? 'تسجيل وصول المريض' : 'Check-In Patient'}
                        </button>
                      ) : a.status === 'checked_in' ? (
                        <span style={{ fontSize: 13, color: 'var(--color-recovery-green)', fontWeight: 600 }}>
                          ✓ {isRtl ? 'في صالة الانتظار' : 'In Waiting Room'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
