import React, { useState, useEffect } from 'react';
import { LeafIcon } from '../components/LineIcon.js';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';

export const ManagerDashboard: React.FC = () => {
  const { apiFetch, currentOrgId, user } = useAuth();
  const { t, isRtl } = useLang();

  const [staff, setStaff] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New staff modal
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({
    email: '',
    password: 'Password123!',
    full_name_ar: '',
    full_name_en: '',
    phone: '',
    role: 'doctor',
    specialty_ar: '',
    specialty_en: '',
    license_number: '',
  });

  const loadData = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      const [membersRes, apptsRes, logsRes] = await Promise.all([
        apiFetch(`/api/organizations/${currentOrgId}/members`),
        apiFetch('/api/appointments'),
        apiFetch('/api/audit-logs?limit=25'),
      ]);
      setStaff(membersRes.data || []);
      setAppointments(apptsRes.data || []);
      setAuditLogs(logsRes.data || []);
    } catch (err) {
      console.error('Error loading manager dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentOrgId]);

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/organizations/${currentOrgId}/members`, {
        method: 'POST',
        body: JSON.stringify(newStaff),
      });
      setShowAddStaff(false);
      setNewStaff({
        email: '',
        password: 'Password123!',
        full_name_ar: '',
        full_name_en: '',
        phone: '',
        role: 'doctor',
        specialty_ar: '',
        specialty_en: '',
        license_number: '',
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error assigning staff');
    }
  };

  const checkedInCount = appointments.filter((a) => a.status === 'checked_in').length;
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;

  return (
    <div className="page-shell" style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <div>
          <div className="recognition-laurel-item" style={{ marginBottom: 4 }}>
            <LeafIcon />
            <span>{isRtl ? 'لوحة إدارة المنشأة الطبية · Center Operations' : 'Facility Governance & Staff Operations'}</span>
          </div>
          <h1 className="text-card-heading" style={{ fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)', margin: '4px 0' }}>
            {isRtl ? 'إدارة الكادر الطبي والعمليات التشغيلية' : 'Staff Management & Clinical Operations'}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 4 }}>
            {isRtl ? 'النطاق المؤسسي: مركز النور الطبي التخصصي' : 'Tenant Scope: Al-Noor Specialized Medical Center'}
          </div>
        </div>
        <button onClick={loadData} className="btn-pill btn-pill-cloud" style={{ fontSize: 13, padding: '8px 18px' }}>
          ↻ {isRtl ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Operational Stats Row (Cloud Feature Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 20, marginBottom: 36 }}>
        <div className="cloud-feature-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 480 }}>
            {isRtl ? 'إجمالي الكادر الطبي والإداري' : 'Active Staff Count'}
          </div>
          <div style={{ fontSize: 36, fontWeight: 520, color: 'var(--color-ink)', marginTop: 8, letterSpacing: '-1px' }}>
            {staff.length}
          </div>
        </div>

        <div className="cloud-feature-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 480 }}>
            {isRtl ? 'المرضى في صالة الانتظار (Checked-In)' : 'Waiting Room (Checked-In)'}
          </div>
          <div style={{ fontSize: 36, fontWeight: 520, color: 'var(--color-recovery-green)', marginTop: 8, letterSpacing: '-1px' }}>
            {checkedInCount}
          </div>
        </div>

        <div className="cloud-feature-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 480 }}>
            {isRtl ? 'المواعيد المؤكدة اليوم' : 'Confirmed Appointments'}
          </div>
          <div style={{ fontSize: 36, fontWeight: 520, color: 'var(--color-metric-blue)', marginTop: 8, letterSpacing: '-1px' }}>
            {confirmedCount}
          </div>
        </div>
      </div>

      {/* Staff Directory Section */}
      <div className="cloud-feature-card" style={{ marginBottom: 36, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h3 className="text-card-heading" style={{ fontSize: 20 }}>
              {isRtl ? 'دليل الكادر الطبي والإداري بالمركز' : 'Center Staff Directory'}
            </h3>
            <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 2 }}>
              {isRtl ? 'إسناد وتعديل الصلاحيات المعتمدة داخل نطاق المنشأة' : 'Staff roles and credentials within this facility tenant'}
            </div>
          </div>
          <button
            onClick={() => setShowAddStaff(!showAddStaff)}
            className="btn-pill btn-pill-charcoal"
            style={{ fontSize: 13, padding: '8px 18px' }}
          >
            {showAddStaff ? t.common.cancel : (isRtl ? '+ إضافة ممارس / موظف' : '+ Add Staff Member')}
          </button>
        </div>

        {showAddStaff && (
          <div
            className="motion-alert-enter"
            style={{
              background: 'var(--color-paper-white)',
              border: '1.5px solid var(--color-charcoal)',
              borderRadius: 20,
              padding: 28,
              marginBottom: 28,
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <h4 className="text-card-heading" style={{ fontSize: 18, marginBottom: 18 }}>
              {isRtl ? 'إضافة موظف جديد وتعيين الدور' : 'Add New Staff Member'}
            </h4>
            <form onSubmit={handleAddStaffSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">{isRtl ? 'البريد الإلكتروني' : 'Email'} *</label>
                  <input
                    type="email"
                    required
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                    placeholder="doctor@naseej.health"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{isRtl ? 'الاسم بالعربية' : 'Arabic Name'} *</label>
                  <input
                    type="text"
                    required
                    value={newStaff.full_name_ar}
                    onChange={(e) => setNewStaff({ ...newStaff, full_name_ar: e.target.value })}
                    placeholder="د. أحمد السالم"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{isRtl ? 'الاسم بالإنجليزية' : 'English Name'} *</label>
                  <input
                    type="text"
                    required
                    value={newStaff.full_name_en}
                    onChange={(e) => setNewStaff({ ...newStaff, full_name_en: e.target.value })}
                    placeholder="Dr. Ahmed Al-Salem"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{isRtl ? 'الدور الوظيفي' : 'Role'} *</label>
                  <select
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                    className="form-select"
                  >
                    <option value="doctor">{t.roles.doctor}</option>
                    <option value="reception">{t.roles.reception}</option>
                    <option value="center_manager">{t.roles.center_manager}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{isRtl ? 'التخصص السريري' : 'Specialty'}</label>
                  <input
                    type="text"
                    value={newStaff.specialty_ar}
                    onChange={(e) => setNewStaff({ ...newStaff, specialty_ar: e.target.value })}
                    placeholder="مثال: طب الأطفال"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{isRtl ? 'رقم الترخيص الطبي' : 'License Number'}</label>
                  <input
                    type="text"
                    value={newStaff.license_number}
                    onChange={(e) => setNewStaff({ ...newStaff, license_number: e.target.value })}
                    placeholder="MD-99881"
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                <button type="button" onClick={() => setShowAddStaff(false)} className="btn-pill btn-pill-ghost">
                  {t.common.cancel}
                </button>
                <button type="submit" className="btn-pill btn-pill-charcoal">
                  {isRtl ? 'حفظ وإسناد الصلاحية' : 'Save & Assign'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{isRtl ? 'الاسم' : 'Name'}</th>
                <th>{isRtl ? 'الدور' : 'Role'}</th>
                <th>{isRtl ? 'التخصص' : 'Specialty'}</th>
                <th>{isRtl ? 'الترخيص' : 'License'}</th>
                <th>{isRtl ? 'البريد' : 'Email'}</th>
                <th>{isRtl ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.membership_id}>
                  <td style={{ fontWeight: 520 }}>
                    {isRtl ? m.full_name_ar : m.full_name_en}
                  </td>
                  <td>
                    <span className={`status-badge ${m.role === 'doctor' ? 'badge-approved' : 'badge-info'}`}>
                      {t.roles[m.role as keyof typeof t.roles] || m.role}
                    </span>
                  </td>
                  <td>{isRtl ? (m.specialty_ar || '—') : (m.specialty_en || '—')}</td>
                  <td>{m.license_number || '—'}</td>
                  <td>{m.email}</td>
                  <td>
                    <span className="status-badge badge-approved">{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
