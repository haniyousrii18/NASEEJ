import React, { useState, useEffect } from 'react';
import { LeafIcon, AlertIcon } from '../components/LineIcon.js';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';

export const PatientPortal: React.FC = () => {
  const { apiFetch, user } = useAuth();
  const { t, isRtl } = useLang();

  const [summary, setSummary] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [symptoms, setSymptoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'visits' | 'prescriptions' | 'labs' | 'messages' | 'symptoms'>('summary');

  // New message state
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');

  // New symptom state
  const [showNewSymptom, setShowNewSymptom] = useState(false);
  const [symptomDesc, setSymptomDesc] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState(5);

  const loadPortalData = async () => {
    setLoading(true);
    try {
      const [sumRes, msgRes, symRes] = await Promise.all([
        apiFetch('/api/portal/summary'),
        apiFetch('/api/portal/messages'),
        apiFetch('/api/portal/symptoms'),
      ]);
      setSummary(sumRes.data);
      setMessages(msgRes.data || []);
      setSymptoms(symRes.data || []);
    } catch (err) {
      console.error('Error loading patient portal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary?.affiliatedCenters?.[0]?.id) return;

    try {
      await apiFetch('/api/portal/messages', {
        method: 'POST',
        body: JSON.stringify({
          organization_id: summary.affiliatedCenters[0].id,
          subject: msgSubject,
          body: msgBody,
          category: 'medical',
        }),
      });

      setShowNewMsg(false);
      setMsgSubject('');
      setMsgBody('');
      loadPortalData();
    } catch (err: any) {
      alert(err.message || 'Error submitting message');
    }
  };

  const handleLogSymptom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/portal/symptoms', {
        method: 'POST',
        body: JSON.stringify({
          organization_id: summary?.affiliatedCenters?.[0]?.id || null,
          symptom_description: symptomDesc,
          severity: symptomSeverity,
          onset_date: new Date().toISOString(),
        }),
      });

      setShowNewSymptom(false);
      setSymptomDesc('');
      setSymptomSeverity(5);
      loadPortalData();
    } catch (err: any) {
      alert(err.message || 'Error logging symptom');
    }
  };

  if (loading && !summary) {
    return (
      <div className="page-shell" style={{ maxWidth: 1200, margin: '80px auto', textAlign: 'center', color: 'var(--color-body-gray)' }}>
        {t.common.loading}
      </div>
    );
  }

  return (
    <div className="page-shell" style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px 80px' }}>
      {/* Patient Header Banner (Cloudlight Journal Surface) */}
      <div className="cloud-feature-card" style={{
        padding: '32px 36px',
        marginBottom: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 24,
      }}>
        <div>
          <div className="recognition-laurel-item" style={{ marginBottom: 6 }}>
            <LeafIcon />
            <span>{isRtl ? 'بوابة صحتي الموحدة · ملف المريض المعتمد' : 'Connected Patient Health Portal'}</span>
          </div>
          <h1 className="text-card-heading" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', margin: '8px 0 6px' }}>
            {t.portal.welcome} {isRtl ? summary?.profile?.full_name_ar : summary?.profile?.full_name_en}
          </h1>
          <div style={{ fontSize: 14, color: 'var(--color-body-gray)', display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
            <span>{isRtl ? 'الهوية الوطنية:' : 'National ID:'} <strong>{summary?.profile?.national_id}</strong></span>
            <span>•</span>
            <span>{isRtl ? 'فصيلة الدم:' : 'Blood Group:'} <strong style={{ color: 'var(--color-coral-signal)' }}>{summary?.profile?.blood_type}</strong></span>
            <span>•</span>
            <span>{summary?.affiliatedCenters?.length} {isRtl ? 'مراكز طبية مرتبطة' : 'Linked Medical Centers'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => {
              setShowNewMsg(true);
              setActiveTab('messages');
            }}
            className="btn-pill btn-pill-charcoal"
            style={{ fontSize: 14, padding: '10px 20px' }}
          >
            <span>💬</span> {t.portal.askQuestion}
          </button>
          <button
            onClick={() => {
              setShowNewSymptom(true);
              setActiveTab('symptoms');
            }}
            className="btn-pill btn-pill-cloud"
            style={{ fontSize: 14, padding: '10px 20px', background: 'var(--color-paper-white)' }}
          >
            <span>📝</span> {t.portal.logSymptom}
          </button>
        </div>
      </div>

      {/* Allergies Alert Banner */}
      {summary?.allergies?.length > 0 && (
        <div
          className="motion-alert-enter"
          style={{
            background: 'var(--color-status-danger-bg)',
            border: '1px solid var(--color-status-draft-border)',
            borderRadius: 20,
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 28,
          }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--color-status-draft-text)' }}><AlertIcon size={22} /></span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 560, color: 'var(--color-status-draft-text)' }}>
              {isRtl ? 'سجل الحساسيات المعتمد (Documented Patient Allergies)' : 'Documented Patient Allergies'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-ink)', marginTop: 4 }}>
              {summary.allergies.map((a: any) => (
                <span key={a.id} style={{ marginInlineEnd: 16 }}>
                  • {isRtl ? a.allergen_ar : a.allergen_en} ({a.severity})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs (Pill controls) */}
      <div className="portal-tabs" style={{ display: 'flex', gap: 10, paddingBottom: 16, marginBottom: 28, overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('summary')}
          className={`btn-pill ${activeTab === 'summary' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          📊 {t.portal.summary}
        </button>
        <button
          onClick={() => setActiveTab('visits')}
          className={`btn-pill ${activeTab === 'visits' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          🩺 {t.portal.myVisits} ({summary?.visits?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('prescriptions')}
          className={`btn-pill ${activeTab === 'prescriptions' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          💊 {t.portal.myRx} ({summary?.prescriptions?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('labs')}
          className={`btn-pill ${activeTab === 'labs' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          🔬 {t.portal.myLabs} ({summary?.labResults?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`btn-pill ${activeTab === 'messages' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          💬 {isRtl ? 'استفساراتي' : 'Inquiries'} ({messages.length})
        </button>
        <button
          onClick={() => setActiveTab('symptoms')}
          className={`btn-pill ${activeTab === 'symptoms' ? 'btn-pill-charcoal' : 'btn-pill-cloud'}`}
          style={{ fontSize: 14, padding: '8px 18px' }}
        >
          📝 {isRtl ? 'سجل الأعراض' : 'Symptom Diary'} ({symptoms.length})
        </button>
      </div>

      {/* Tab: Longitudinal Summary */}
      {activeTab === 'summary' && (
        <div className="motion-tab-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Linked Centers Cards */}
          <div className="cloud-feature-card" style={{ padding: 28 }}>
            <h3 className="text-card-heading" style={{ fontSize: 20, marginBottom: 18 }}>
              {isRtl ? 'المراكز الطبية المرتبطة وسجلات الـ MRN' : 'Affiliated Medical Centers & Local MRNs'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
              {summary?.affiliatedCenters?.map((c: any) => (
                <div
                  key={c.id}
                  style={{
                    padding: '20px',
                    borderRadius: 18,
                    background: 'var(--color-paper-white)',
                    boxShadow: 'var(--shadow-xs)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ fontWeight: 520, fontSize: 16, color: 'var(--color-ink)' }}>
                    {isRtl ? c.name_ar : c.name_en}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 6 }}>
                    {isRtl ? 'رقم السجل الطبي:' : 'MRN:'} <code style={{ color: 'var(--color-metric-blue)', fontWeight: 560 }}>{c.mrn}</code>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 4 }}>
                    {isRtl ? 'أول زيارة:' : 'First Visit:'} {c.first_visit_date || '2025-01-15'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Snapshot Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 24 }}>
            {/* Latest Approved Visit */}
            <div className="cloud-feature-card" style={{ padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span className="metric-chip" style={{ fontSize: 12 }}>
                  {isRtl ? 'آخر زيارة معتمدة' : 'Latest Approved Visit'}
                </span>
                <span className="status-badge badge-approved">{t.clinical.approved}</span>
              </div>
              {summary?.visits?.length > 0 ? (
                <div>
                  <div style={{ fontWeight: 520, fontSize: 18, color: 'var(--color-ink)' }}>
                    {summary.visits[0].diagnosis}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 4 }}>
                    {new Date(summary.visits[0].visit_date).toLocaleDateString()} · {isRtl ? summary.visits[0].center_name_ar : summary.visits[0].center_name_en}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--color-body-gray)', marginTop: 10, lineHeight: 1.5 }}>
                    {summary.visits[0].chief_complaint}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: 'var(--color-body-gray)' }}>{t.common.noData}</div>
              )}
            </div>

            {/* Latest Active Prescription */}
            <div className="cloud-feature-card" style={{ padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span className="metric-chip" style={{ fontSize: 12 }}>
                  {isRtl ? 'الوصفة الدوائية السارية' : 'Current Active Rx'}
                </span>
                <span className="status-badge badge-approved">{t.clinical.approved}</span>
              </div>
              {summary?.prescriptions?.length > 0 ? (
                <div>
                  <div style={{ fontWeight: 520, fontSize: 18, color: 'var(--color-ink)' }}>
                    {summary.prescriptions[0].items?.[0]?.medication_name || 'Medication'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-metric-blue)', fontWeight: 520, marginTop: 4 }}>
                    {summary.prescriptions[0].items?.[0]?.dosage} · {summary.prescriptions[0].items?.[0]?.frequency}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--color-body-gray)', marginTop: 10, lineHeight: 1.5 }}>
                    {summary.prescriptions[0].items?.[0]?.instructions}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: 'var(--color-body-gray)' }}>{t.common.noData}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Approved Visits */}
      {activeTab === 'visits' && (
        <div className="motion-tab-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="text-card-heading" style={{ fontSize: 22 }}>{t.portal.myVisits}</h3>
            <span className="status-badge badge-approved">{t.clinical.noDraftVisibility}</span>
          </div>

          {summary?.visits?.map((v: any) => (
            <div key={v.id} className="cloud-feature-card" style={{ padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 520, color: 'var(--color-ink)' }}>
                    {v.diagnosis}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 4 }}>
                    {new Date(v.visit_date).toLocaleDateString()} · {isRtl ? v.center_name_ar : v.center_name_en} · {isRtl ? v.clinician_name_ar : v.clinician_name_en}
                  </div>
                </div>
                <span className="status-badge badge-approved">{t.clinical.approved}</span>
              </div>

              <div style={{ marginTop: 12, fontSize: 15, color: 'var(--color-ink)' }}>
                <strong>{t.clinical.chiefComplaint}:</strong> {v.chief_complaint}
              </div>

              {v.treatment_plan && (
                <div style={{
                  marginTop: 12,
                  padding: '16px',
                  background: 'var(--color-paper-white)',
                  borderRadius: 14,
                  fontSize: 14,
                  color: 'var(--color-body-gray)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                }}>
                  <strong style={{ color: 'var(--color-ink)' }}>{t.clinical.treatmentPlan}:</strong>
                  <div>{v.treatment_plan}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Approved Prescriptions */}
      {activeTab === 'prescriptions' && (
        <div className="motion-tab-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h3 className="text-card-heading" style={{ fontSize: 22 }}>{t.portal.myRx}</h3>
          {summary?.prescriptions?.map((rx: any) => (
            <div key={rx.id} className="cloud-feature-card" style={{ padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 14, color: 'var(--color-body-gray)' }}>
                    {new Date(rx.created_at).toLocaleDateString()} · {isRtl ? rx.center_name_ar : rx.center_name_en}
                  </span>
                </div>
                <span className="status-badge badge-approved">{t.clinical.approved}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {rx.items?.map((item: any) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '16px 20px',
                      borderRadius: 16,
                      background: 'var(--color-paper-white)',
                      boxShadow: 'var(--shadow-xs)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <div style={{ fontWeight: 520, fontSize: 16, color: 'var(--color-ink)' }}>{item.medication_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-metric-blue)', fontWeight: 520, marginTop: 4 }}>
                      {item.dosage} · {item.frequency} · {item.duration}
                    </div>
                    {item.instructions && (
                      <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 6, lineHeight: 1.5 }}>
                        {item.instructions}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Approved Lab Results */}
      {activeTab === 'labs' && (
        <div className="motion-tab-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h3 className="text-card-heading" style={{ fontSize: 22 }}>{t.portal.myLabs}</h3>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{isRtl ? 'الفحص المخبري' : 'Test Parameter'}</th>
                  <th>{isRtl ? 'النتيجة' : 'Value'}</th>
                  <th>{isRtl ? 'الوحدة' : 'Unit'}</th>
                  <th>{isRtl ? 'المجال المرجعي' : 'Reference Range'}</th>
                  <th>{isRtl ? 'المنشأة' : 'Facility'}</th>
                  <th>{t.clinical.status}</th>
                </tr>
              </thead>
              <tbody>
                {summary?.labResults?.map((lr: any) => (
                  <tr key={lr.id}>
                    <td style={{ fontWeight: 520 }}>{lr.parameter_name}</td>
                    <td>
                      <span style={{
                        fontWeight: 560,
                        color: lr.is_abnormal ? 'var(--color-coral-signal)' : 'var(--color-recovery-green)',
                      }}>
                        {lr.value}{' '}
                        {lr.is_abnormal ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <AlertIcon size={14} />
                            {isRtl ? 'خارج المدى' : 'Out of range'}
                          </span>
                        ) : ''}
                      </span>
                    </td>
                    <td>{lr.unit}</td>
                    <td style={{ color: 'var(--color-body-gray)' }}>{lr.reference_range || 'Normal'}</td>
                    <td>{isRtl ? lr.center_name_ar : lr.center_name_en}</td>
                    <td>
                      <span className="status-badge badge-approved">{t.clinical.approved}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Inquiries */}
      {activeTab === 'messages' && (
        <div className="motion-tab-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="text-card-heading" style={{ fontSize: 22 }}>{isRtl ? 'الاستفسارات والطلبات' : 'Care Team Inquiries'}</h3>
            <button onClick={() => setShowNewMsg(true)} className="btn-pill btn-pill-charcoal" style={{ fontSize: 13, padding: '8px 18px' }}>
              + {t.portal.askQuestion}
            </button>
          </div>

          {showNewMsg && (
            <div className="cloud-feature-card motion-alert-enter" style={{ padding: 28 }}>
              <h4 className="text-card-heading" style={{ fontSize: 18, marginBottom: 16 }}>{t.portal.askQuestion}</h4>
              <form onSubmit={handleSendMessage}>
                <div className="form-group">
                  <label className="form-label">{t.portal.subject} *</label>
                  <input
                    type="text"
                    required
                    placeholder={isRtl ? 'استفسار عن طريقة أخذ الدواء...' : 'Medication question...'}
                    value={msgSubject}
                    onChange={(e) => setMsgSubject(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.portal.questionBody} *</label>
                  <textarea
                    required
                    placeholder={isRtl ? 'اكتب تفاصيل استفسارك للفريق الطبي...' : 'Enter your question details...'}
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    className="form-textarea"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                  <button type="button" onClick={() => setShowNewMsg(false)} className="btn-pill btn-pill-ghost">
                    {t.common.cancel}
                  </button>
                  <button type="submit" className="btn-pill btn-pill-charcoal">
                    {t.portal.sendQuestionBtn}
                  </button>
                </div>
              </form>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className="cloud-feature-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 520, fontSize: 16, color: 'var(--color-ink)' }}>{m.subject}</div>
                <span className={`status-badge ${m.status === 'resolved' ? 'badge-approved' : 'badge-draft'}`}>
                  {m.status}
                </span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-body-gray)', marginBottom: 14, lineHeight: 1.5 }}>
                {m.body}
              </div>
              {m.response && (
                <div style={{
                  padding: '14px 18px',
                  background: 'var(--color-paper-white)',
                  borderRadius: 14,
                  borderInlineStart: '4px solid var(--color-recovery-green)',
                  fontSize: 14,
                  boxShadow: 'var(--shadow-xs)',
                }}>
                  <strong style={{ color: 'var(--color-ink)' }}>
                    {isRtl ? 'رد الفريق الطبي:' : 'Care Team Response:'}
                  </strong>
                  <div style={{ marginTop: 4, color: 'var(--color-body-gray)', lineHeight: 1.5 }}>{m.response}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Symptoms Diary */}
      {activeTab === 'symptoms' && (
        <div className="motion-tab-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="text-card-heading" style={{ fontSize: 22 }}>{isRtl ? 'سجل الأعراض والمتابعة اليومية' : 'Daily Symptom Diary'}</h3>
            <button onClick={() => setShowNewSymptom(true)} className="btn-pill btn-pill-charcoal" style={{ fontSize: 13, padding: '8px 18px' }}>
              + {t.portal.logSymptom}
            </button>
          </div>

          {showNewSymptom && (
            <div className="cloud-feature-card motion-alert-enter" style={{ padding: 28 }}>
              <h4 className="text-card-heading" style={{ fontSize: 18, marginBottom: 16 }}>{t.portal.logSymptom}</h4>
              <form onSubmit={handleLogSymptom}>
                <div className="form-group">
                  <label className="form-label">{t.portal.symptomDesc} *</label>
                  <textarea
                    required
                    placeholder={isRtl ? 'وصف العارض الصحي...' : 'Describe symptom...'}
                    value={symptomDesc}
                    onChange={(e) => setSymptomDesc(e.target.value)}
                    className="form-textarea"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.portal.severity}: {symptomSeverity} / 10</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={symptomSeverity}
                    onChange={(e) => setSymptomSeverity(parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: 'var(--color-charcoal)' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                  <button type="button" onClick={() => setShowNewSymptom(false)} className="btn-pill btn-pill-ghost">
                    {t.common.cancel}
                  </button>
                  <button type="submit" className="btn-pill btn-pill-charcoal">
                    {t.portal.logSymptomBtn}
                  </button>
                </div>
              </form>
            </div>
          )}

          {symptoms.map((s) => (
            <div key={s.id} className="cloud-feature-card" style={{ padding: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 520, fontSize: 15, color: 'var(--color-ink)' }}>{s.symptom_description}</div>
                <div style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 4 }}>
                  {new Date(s.onset_date).toLocaleString()}
                </div>
              </div>
              <span className={`status-badge ${s.severity >= 7 ? 'badge-danger' : s.severity >= 4 ? 'badge-draft' : 'badge-approved'}`}>
                {isRtl ? `الشدة: ${s.severity}/10` : `Severity: ${s.severity}/10`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
