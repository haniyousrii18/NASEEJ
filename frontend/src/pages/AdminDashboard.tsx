import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { CountUp } from '../components/motion.js';
import { LeafIcon } from '../components/LineIcon.js';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';

export const AdminDashboard: React.FC = () => {
  const { apiFetch } = useAuth();
  const { t, isRtl } = useLang();

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [demoRequests, setDemoRequests] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'centers' | 'requests' | 'audits'>('centers');

  // New center form state
  const [showAddCenter, setShowAddCenter] = useState(false);
  const [newCenter, setNewCenter] = useState({
    name_ar: '',
    name_en: '',
    code: '',
    type: 'clinic',
    contact_phone: '',
    contact_email: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgsRes, demosRes, logsRes] = await Promise.all([
        apiFetch('/api/organizations'),
        apiFetch('/api/public/demo-requests'),
        apiFetch('/api/audit-logs?limit=30'),
      ]);
      setOrganizations(orgsRes.data || []);
      setDemoRequests(demosRes.data || []);
      setAuditLogs(logsRes.data || []);
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(newCenter),
      });
      setShowAddCenter(false);
      setNewCenter({ name_ar: '', name_en: '', code: '', type: 'clinic', contact_phone: '', contact_email: '' });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error creating center');
    }
  };

  return (
    <div className="page-shell" style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 80px' }}>
      {/* Top Header & Clinical Wall Notice */}
      <PageHeader
        eyebrow={isRtl ? 'لوحة تحكم المنصة' : 'Platform operations'}
        title={isRtl ? 'إدارة المنظومة والمراكز الطبية المعتمدة' : 'Healthcare System & Organization Overview'}
        actions={
          <button type="button" onClick={loadData} className="btn-pill btn-pill-cloud" style={{ minHeight: 44 }}>
            <span aria-hidden="true">↻</span> {isRtl ? 'تحديث البيانات' : 'Refresh Data'}
          </button>
        }
      />

      {/* Structural Isolation Wall Banner */}
      <div style={{
        background: 'var(--color-cloud-card)',
        borderRadius: 20,
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 32,
      }}>
        <div style={{ fontSize: '1.6rem' }}>🛡️</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 520, color: 'var(--color-ink)' }}>
            {isRtl ? 'جدار الحماية الإداري للمحتوى السريري (FR-133 Compliance)' : 'Platform Clinical Isolation Wall Active (FR-133)'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 2 }}>
            {isRtl
              ? 'وفقاً لمتطلبات وثيقة المنتج، يُحظر هيكلياً على مديري المنصة الاطلاع على السجلات الطبية والزيارات السريرية للمرضى.'
              : 'Per PRD specifications, platform administrators are structurally barred from accessing patient clinical consultations or medical records.'}
          </div>
        </div>
      </div>

      {/* Metrics Row (Cloud Card Bins) */}
      <div className="motion-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 20, marginBottom: 36 }}>
        <div className="cloud-feature-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 480 }}>
            {isRtl ? 'المراكز الطبية المسجلة' : 'Registered Centers'}
          </div>
          <div style={{ fontSize: 36, fontWeight: 520, color: 'var(--color-ink)', marginTop: 8, letterSpacing: '-1px' }}>
            <CountUp value={organizations.length} />
          </div>
        </div>

        <div className="cloud-feature-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 480 }}>
            {isRtl ? 'طلبات العروض التجريبية' : 'Pending Demo Inquiries'}
          </div>
          <div style={{ fontSize: 36, fontWeight: 520, color: 'var(--color-metric-accent)', marginTop: 8, letterSpacing: '-1px' }}>
            {demoRequests.length}
          </div>
        </div>

        <div className="cloud-feature-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 480 }}>
            {isRtl ? 'سجلات الأمان والتدقيق' : 'Audit Log Entries'}
          </div>
          <div style={{ fontSize: 36, fontWeight: 520, color: 'var(--color-recovery-green)', marginTop: 8, letterSpacing: '-1px' }}>
            {auditLogs.length}+
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="dashboard-tabs" style={{ display: 'flex', gap: 10, paddingBottom: 16, marginBottom: 28 }}>
        <button
          onClick={() => setActiveTab('centers')}
          className={`btn-pill ${activeTab === 'centers' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          🏥 {isRtl ? 'المراكز الطبية' : 'Medical Centers'} (<CountUp value={organizations.length} />)
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`btn-pill ${activeTab === 'requests' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          📩 {isRtl ? 'طلبات العروض التجريبية' : 'Demo Requests'} ({demoRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('audits')}
          className={`btn-pill ${activeTab === 'audits' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          📜 {isRtl ? 'سجل التدقيق الأمني' : 'Security Audit Trail'}
        </button>
      </div>

      {/* Tab Content: Organizations */}
      {activeTab === 'centers' && (
        <div className="motion-tab-enter">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 className="text-card-heading" style={{ fontSize: 20 }}>
              {isRtl ? 'قائمة المنشآت الطبية المعتمدة' : 'Authorized Healthcare Facilities'}
            </h3>
            <button
              onClick={() => setShowAddCenter(!showAddCenter)}
              className="btn-pill btn-pill-charcoal"
              style={{ fontSize: 13, padding: '8px 18px' }}
            >
              {showAddCenter ? t.common.cancel : (isRtl ? '+ إضافة منشأة جديدة' : '+ Add Medical Center')}
            </button>
          </div>

          {showAddCenter && (
            <div className="cloud-feature-card motion-alert-enter" style={{ marginBottom: 28, padding: 32, background: 'var(--color-paper-white)', border: '1.5px solid var(--color-charcoal)', boxShadow: 'var(--shadow-raised)' }}>
              <h4 className="text-card-heading" style={{ fontSize: 18, marginBottom: 18 }}>
                {isRtl ? 'تهيئة منشأة طبية جديدة في المنظومة' : 'Provision New Healthcare Facility'}
              </h4>
              <form onSubmit={handleCreateCenter}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">{isRtl ? 'الاسم بالعربية' : 'Arabic Name'} *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: مستشفى الشفاء"
                      value={newCenter.name_ar}
                      onChange={(e) => setNewCenter({ ...newCenter, name_ar: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{isRtl ? 'الاسم بالإنجليزية' : 'English Name'} *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Al-Shifa Hospital"
                      value={newCenter.name_en}
                      onChange={(e) => setNewCenter({ ...newCenter, name_en: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{isRtl ? 'رمز المنشأة (Code)' : 'Center Code'} *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SHIFA_MED"
                      value={newCenter.code}
                      onChange={(e) => setNewCenter({ ...newCenter, code: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                  <button type="button" onClick={() => setShowAddCenter(false)} className="btn-pill btn-pill-ghost">
                    {t.common.cancel}
                  </button>
                  <button type="submit" className="btn-pill btn-pill-charcoal">
                    {isRtl ? 'إنشاء المنشأة' : 'Create Center'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{isRtl ? 'اسم المنشأة' : 'Facility Name'}</th>
                  <th>{isRtl ? 'الرمز' : 'Code'}</th>
                  <th>{isRtl ? 'النوع' : 'Type'}</th>
                  <th>{isRtl ? 'الهاتف' : 'Phone'}</th>
                  <th>{isRtl ? 'الحالة' : 'Status'}</th>
                  <th>{isRtl ? 'المعرف الرقمي (Tenant ID)' : 'Tenant ID'}</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <div style={{ fontWeight: 520 }}>{isRtl ? org.name_ar : org.name_en}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>
                        {isRtl ? org.name_en : org.name_ar}
                      </div>
                    </td>
                    <td>
                      <code style={{ background: 'var(--color-cloud-card)', padding: '2px 8px', borderRadius: 6, fontWeight: 520 }}>
                        {org.code}
                      </code>
                    </td>
                    <td>{org.type}</td>
                    <td>{org.contact_phone || '—'}</td>
                    <td>
                      <span className="status-badge badge-approved">{org.status}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-body-gray)' }}>
                        {org.id}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Demo Requests */}
      {activeTab === 'requests' && (
        <div className="motion-tab-enter">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{isRtl ? 'المنشأة' : 'Organization'}</th>
                  <th>{isRtl ? 'المسؤول' : 'Contact Person'}</th>
                  <th>{isRtl ? 'البريد والهاتف' : 'Contact Info'}</th>
                  <th>{isRtl ? 'النوع' : 'Type'}</th>
                  <th>{isRtl ? 'التاريخ' : 'Date'}</th>
                  <th>{isRtl ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {demoRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--color-body-gray)' }}>
                      {t.common.noData}
                    </td>
                  </tr>
                ) : (
                  demoRequests.map((req) => (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 520 }}>{req.organization_name}</td>
                      <td>{req.contact_name}</td>
                      <td>
                        <div>{req.email}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{req.phone}</div>
                      </td>
                      <td>{req.center_type}</td>
                      <td style={{ fontSize: 13 }}>{new Date(req.created_at).toLocaleDateString()}</td>
                      <td>
                        <span className="status-badge badge-info">{req.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Audit Logs */}
      {activeTab === 'audits' && (
        <div className="motion-tab-enter">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{isRtl ? 'الوقت' : 'Timestamp'}</th>
                  <th>{isRtl ? 'الفاعل' : 'Actor'}</th>
                  <th>{isRtl ? 'الإجراء الأمني' : 'Action'}</th>
                  <th>{isRtl ? 'المورد' : 'Resource'}</th>
                  <th>{isRtl ? 'عنوان IP' : 'IP Address'}</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 520 }}>{log.actor_email || 'System'}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{log.actor_role}</div>
                    </td>
                    <td>
                      <code style={{
                        color: log.action.includes('SECURITY') ? 'var(--color-status-danger-text)' : 'var(--color-metric-accent)',
                        background: 'var(--color-cloud-card)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontWeight: 520,
                      }}>
                        {log.action}
                      </code>
                    </td>
                    <td>{log.resource_type}</td>
                    <td style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{log.ip_address || '127.0.0.1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
