import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';
import { aiSummary } from '../lib/ai.js';
import { fmt, safeStorage } from '../lib/format.js';
import { activeMedicines, unseenChanges } from '../lib/selectors.js';
import type { Appointment, LabOrder, Patient, PatientData, Prescription, Visit } from '../lib/types.js';
import { LoadSwap, Presence, Rise } from '../components/motion.js';
import { ApprovalDialog } from '../components/doctor/ApprovalDialog.js';
import { formatDate, Icon, Skeleton } from '../components/doctor/bits.js';
import { ChangesPanel } from '../components/doctor/ChangesPanel.js';
import { DemoTour } from '../components/doctor/DemoTour.js';
import { LabsPanel } from '../components/doctor/LabsPanel.js';
import { MedsPanel } from '../components/doctor/MedsPanel.js';
import { PatientBrief } from '../components/doctor/PatientBrief.js';
import { PatientSearch } from '../components/doctor/PatientSearch.js';
import { ShortcutsDialog } from '../components/doctor/ShortcutsDialog.js';
import { useDoctorShortcuts } from '../components/doctor/useDoctorShortcuts.js';
import { VisitComposer, type VisitDraftFields } from '../components/doctor/VisitComposer.js';

type Section = 'summary' | 'visits' | 'labs' | 'medicines';
const SECTIONS: Section[] = ['summary', 'visits', 'labs', 'medicines'];

export const DoctorWorkspace: React.FC = () => {
  const { apiFetch, currentOrgId, user } = useAuth();
  const { t, isRtl } = useLang();
  const D = t.doctor;
  const locale = isRtl ? 'ar-EG' : 'en-GB';

  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<PatientData | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [section, setSection] = useState<Section>('summary');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  // Forms
  const [showNewVisit, setShowNewVisit] = useState(false);
  const [showNewRx, setShowNewRx] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState<string>('');
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [showNewLab, setShowNewLab] = useState(false);
  const [labTestNameAr, setLabTestNameAr] = useState('');
  const [labTestNameEn, setLabTestNameEn] = useState('');

  // Overlays, focus mode, "what changed"
  const [approvalVisitId, setApprovalVisitId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const focusKey = `naseej_doctor_focus_${user?.id ?? 'anon'}`;
  const [focusMode, setFocusMode] = useState(() => safeStorage.get(focusKey) === '1');
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [seenNote, setSeenNote] = useState('');

  const panelRef = useRef<HTMLElement>(null);
  const changesRef = useRef<HTMLElement>(null);
  const queueRef = useRef<HTMLHeadingElement>(null);
  const requestSeq = useRef(0);

  const lastLookKey = (patientId: string) => `naseej_lastlook_${user?.id ?? 'anon'}_${patientId}`;

  const selectPatient = useCallback(
    async (patientId: string, silent = false) => {
      const seq = ++requestSeq.current;
      setSelectedId(patientId);
      if (!silent) {
        setLoadingPatient(true);
        setSection('summary');
        setShowNewVisit(false);
        setShowNewRx(false);
        setShowNewLab(false);
        setNotice('');
        setSeen(new Set());
        setSeenNote('');
        setLastSeen(safeStorage.get(lastLookKey(patientId)));
      }
      try {
        // Prescriptions and labs are existing read endpoints; a failure there must not block the file.
        const [ptRes, vRes, rxRes, labRes] = await Promise.all([
          apiFetch(`/api/patients/${patientId}`),
          apiFetch(`/api/visits?patientId=${patientId}`),
          apiFetch(`/api/prescriptions?patientId=${patientId}`).catch(() => ({ data: [] })),
          apiFetch(`/api/labs/orders?patientId=${patientId}`).catch(() => ({ data: [] })),
        ]);
        if (seq !== requestSeq.current) return; // a newer selection won
        setData({
          patient: ptRes.data as Patient,
          visits: (vRes.data || []) as Visit[],
          prescriptions: (rxRes.data || []) as Prescription[],
          labOrders: (labRes.data || []) as LabOrder[],
        });
      } catch (err) {
        console.error('Error fetching patient details:', err);
        if (seq === requestSeq.current) setActionError(D.actionFailed);
      } finally {
        if (seq === requestSeq.current) setLoadingPatient(false);
      }
    },
    [apiFetch, user?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const loadData = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const [ptsRes, apptsRes] = await Promise.all([apiFetch('/api/patients'), apiFetch('/api/appointments?status=checked_in')]);
      setPatients((ptsRes.data || []) as Patient[]);
      setAppointments((apptsRes.data || []) as Appointment[]);
      if (ptsRes.data?.length > 0 && !selectedId) void selectPatient(ptsRes.data[0].id);
    } catch (err) {
      console.error('Error loading doctor workspace:', err);
      setActionError(D.actionFailed);
    }
  }, [currentOrgId, apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadData();
  }, [currentOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus mode: the preference is a boolean per user. The attribute hides the site header/footer.
  useEffect(() => {
    if (focusMode) document.documentElement.setAttribute('data-doctor-focus', '1');
    else document.documentElement.removeAttribute('data-doctor-focus');
    return () => document.documentElement.removeAttribute('data-doctor-focus');
  }, [focusMode]);

  const toggleFocus = useCallback(() => {
    setFocusMode((f) => {
      safeStorage.set(focusKey, f ? '0' : '1');
      return !f;
    });
  }, [focusKey]);

  // ---------- derived ----------
  const summary = useMemo(() => (data ? aiSummary(data) : null), [data]);
  const changes = useMemo(() => (data ? unseenChanges(data, lastSeen) : []), [data, lastSeen]);
  const unseenIds = useMemo(() => new Set(changes.filter((c) => !seen.has(c.id)).map((c) => c.id)), [changes, seen]);
  const waitingIds = useMemo(() => new Set(appointments.map((a) => a.patient_id)), [appointments]);
  const draftVisitList = useMemo(() => (data?.visits ?? []).filter((v) => v.status === 'draft'), [data]);
  const approvalVisit = data?.visits.find((v) => v.id === approvalVisitId) ?? null;
  const currentMeds = useMemo(() => (data ? activeMedicines(data.prescriptions).map((i) => i.medication_name) : []), [data]);

  // ---------- actions ----------
  const goSection = useCallback((s: Section, moveFocus = true) => {
    setSection(s);
    if (moveFocus) requestAnimationFrame(() => panelRef.current?.focus());
  }, []);

  const stepSection = useCallback(
    (delta: 1 | -1) => {
      const i = SECTIONS.indexOf(section);
      goSection(SECTIONS[(i + delta + SECTIONS.length) % SECTIONS.length]);
    },
    [section, goSection],
  );

  const markSeen = (id: string) => {
    setSeen((s) => new Set(s).add(id));
    setSeenNote(D.changes.itemSeen);
  };
  const markAllSeen = () => {
    if (!selectedId) return;
    safeStorage.set(lastLookKey(selectedId), new Date().toISOString()); // a timestamp only, never clinical data
    setLastSeen(new Date().toISOString());
    setSeen(new Set(changes.map((c) => c.id)));
    setSeenNote(D.changes.allSeen);
  };

  useDoctorShortcuts({
    enabled: true,
    onSearch: () => setSearchOpen(true),
    onHelp: () => setHelpOpen(true),
    onPrev: () => stepSection(-1),
    onNext: () => stepSection(1),
    onDashboard: () => {
      setFocusMode(false);
      safeStorage.set(focusKey, '0');
      requestAnimationFrame(() => queueRef.current?.focus());
    },
    onFocusMode: toggleFocus,
  });

  const handleCreateVisitDraft = async (f: VisitDraftFields) => {
    if (!data) return;
    // Same request as before this redesign.
    await apiFetch('/api/visits', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: data.patient.id,
        chief_complaint: f.chief_complaint,
        vital_signs: {
          blood_pressure: f.blood_pressure,
          pulse: parseInt(f.pulse, 10),
          temperature: parseFloat(f.temperature),
          spo2: parseInt(f.spo2, 10),
        },
        examination_notes: f.examination_notes,
        diagnosis: f.diagnosis,
        treatment_plan: f.treatment_plan,
      }),
    });
    setShowNewVisit(false);
    setNotice(D.composer.saved);
    await selectPatient(data.patient.id, true);
  };

  const handleApproveVisit = async (visitId: string) => {
    await apiFetch(`/api/visits/${visitId}/approve`, { method: 'POST' });
    if (selectedId) await selectPatient(selectedId, true);
  };

  const handleCreatePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisitId || !data) return;
    try {
      await apiFetch('/api/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          visit_id: selectedVisitId,
          patient_id: data.patient.id,
          items: [{ medication_name: medicationName, dosage, frequency, duration }],
        }),
      });
      setShowNewRx(false);
      setMedicationName('');
      setDosage('');
      setFrequency('');
      setDuration('');
      void selectPatient(data.patient.id, true);
    } catch (err: any) {
      setActionError(err?.message || D.actionFailed);
    }
  };

  const handleCreateLabOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    try {
      await apiFetch('/api/labs/orders', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: data.patient.id,
          visit_id: selectedVisitId || null,
          test_name_ar: labTestNameAr,
          test_name_en: labTestNameEn,
        }),
      });
      setShowNewLab(false);
      setLabTestNameAr('');
      setLabTestNameEn('');
      void selectPatient(data.patient.id, true);
    } catch (err: any) {
      setActionError(err?.message || D.actionFailed);
    }
  };

  const openRx = (visitId?: string) => {
    setSelectedVisitId(visitId || draftVisitList[0]?.id || '');
    setShowNewRx(true);
    goSection('medicines', false);
  };

  const nextWaiting = appointments.find((a) => a.patient_id !== selectedId);

  const patientButton = (p: { id: string; name: string; sub: string; meta: string }, selected: boolean) => (
    <button
      key={p.id}
      type="button"
      className="doctor-row"
      aria-current={selected ? 'true' : undefined}
      onClick={() => void selectPatient(p.id)}
      style={{
        padding: '12px 16px', borderRadius: 14,
        background: selected ? 'var(--color-paper-white)' : 'var(--color-glass-soft)',
        border: `1.5px solid ${selected ? 'var(--color-charcoal)' : 'var(--color-border-subtle)'}`,
        boxShadow: selected ? 'var(--shadow-hover)' : 'var(--shadow-xs)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }} dir="auto">{p.name}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--color-body-gray)', marginTop: 2 }}>{p.sub}</span>
      </span>
      <bdi className="num" style={{ fontSize: 12, color: 'var(--color-metric-blue)', fontWeight: 700 }}>{p.meta}</bdi>
    </button>
  );

  // ---------- render ----------
  const identitySkeleton = (
    <div className="cloud-feature-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 220 }} aria-busy="true">
      <Skeleton height={28} width="45%" />
      <Skeleton height={14} width="30%" />
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="65%" />
    </div>
  );

  const waitingList = (
    <div className="cloud-feature-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
        <h3 ref={queueRef} tabIndex={-1} className="text-card-heading" style={{ fontSize: 18, margin: 0, outline: 'none' }}>{D.queue.title}</h3>
        <span className="status-badge badge-approved">{fmt(D.queue.count, { n: appointments.length })}</span>
      </div>
      {appointments.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-body-gray)', padding: '4px 0' }}>
          <p style={{ marginBottom: 10 }}>{D.queue.empty}</p>
          <button type="button" className="btn-pill btn-pill-cloud" style={{ fontSize: 13, minHeight: 44 }} onClick={() => setSearchOpen(true)}>
            {Icon.search}
            <span>{D.queue.emptyAction}</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {appointments.map((a) =>
            patientButton(
              { id: a.patient_id, name: isRtl ? a.patient_name_ar : a.patient_name_en, sub: `${a.start_time} · ${a.reason || ''}`, meta: a.status },
              selectedId === a.patient_id,
            ),
          )}
        </div>
      )}
    </div>
  );

  const directory = (
    <div className="cloud-feature-card" style={{ padding: 24 }}>
      <h3 className="text-card-heading" style={{ fontSize: 18, marginBottom: 16 }}>{D.queue.directory}</h3>
      {patients.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--color-body-gray)' }}>{D.queue.directoryEmpty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
          {patients.map((p) =>
            patientButton(
              {
                id: p.id,
                name: isRtl ? p.full_name_ar : p.full_name_en,
                sub: `${p.national_id ?? ''} · ${p.gender === 'male' ? (isRtl ? 'ذكر' : 'Male') : isRtl ? 'أنثى' : 'Female'} · ${p.blood_type || '—'}`,
                meta: p.mrn,
              },
              selectedId === p.id,
            ),
          )}
        </div>
      )}
    </div>
  );

  const patient = data?.patient;

  return (
    <div className="page-shell" style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 80px' }}>
      {/* Workspace header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px 14px', flexWrap: 'wrap' }}>
          <h1 className="text-card-heading" style={{ fontSize: 'clamp(1.25rem, 1.8vw, 1.6rem)', margin: 0 }}>
            <span aria-hidden="true">🌿 </span>
            {D.title}
          </h1>
          <span className="status-badge badge-lilac" title={D.syntheticHint} style={{ fontSize: 12 }}>
            {Icon.spark}
            <span>{D.syntheticBadge}</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setSearchOpen(true)} className="btn-pill btn-pill-ghost" style={{ fontSize: 13, minHeight: 44 }} title={`${D.search.label} (/)`}>
            {Icon.search}
            <span>{D.search.label}</span>
          </button>
          <button type="button" onClick={toggleFocus} aria-pressed={focusMode} className="btn-pill btn-pill-ghost" style={{ fontSize: 13, minHeight: 44 }} title={`${D.focus.hint} (F)`}>
            {Icon.focus}
            <span>{focusMode ? D.focus.exit : D.focus.enter}</span>
          </button>
          <button type="button" onClick={() => setHelpOpen(true)} className="btn-pill btn-pill-ghost" style={{ minWidth: 44, minHeight: 44, padding: 0 }} title={`${D.shortcuts.title} (?)`} aria-label={D.shortcuts.title}>
            {Icon.keyboard}
          </button>
          <button type="button" onClick={() => void loadData()} className="btn-pill btn-pill-cloud" style={{ minWidth: 44, minHeight: 44, padding: 0 }} title={D.refresh} aria-label={D.refresh}>
            <span aria-hidden="true">↻</span>
          </button>
        </div>
      </div>

      <div role="status" aria-live="polite" style={{ minHeight: notice ? undefined : 0 }}>
        {notice && (
          <Rise>
            <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 12, background: 'var(--color-status-approved-bg)', border: '1px solid var(--color-status-approved-border)', color: 'var(--color-status-approved-text)', fontSize: 14 }}>
              {notice}
            </div>
          </Rise>
        )}
      </div>
      {actionError && (
        <div role="alert" style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', fontSize: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionError}</span>
          <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 36, padding: '2px 12px', fontSize: 12 }} onClick={() => setActionError('')}>
            {t.common.cancel}
          </button>
        </div>
      )}

      <div className="doctor-layout" data-focus={focusMode ? '1' : undefined}>
        {/* Context rail: hidden in focus mode */}
        <Presence show={!focusMode} kind="panel" dir={isRtl ? -1 : 1} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {waitingList}
          {directory}
        </Presence>

        {/* Active patient */}
        {selectedId ? (
          <div key={selectedId} style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <LoadSwap
              ready={!!data && !loadingPatient && data.patient.id === selectedId}
              swapKey={selectedId}
              skeleton={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} role="status" aria-label={D.loadingPatient}>
                  {identitySkeleton}
                  {identitySkeleton}
                </div>
              }
            >
              {patient && data && summary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Patient header + allergy banner (FR-072) */}
                  <div className="cloud-feature-card" style={{ padding: '16px 22px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <h2 className="text-card-heading" style={{ fontSize: 22, margin: 0 }} dir="auto">
                          {isRtl ? patient.full_name_ar : patient.full_name_en}
                        </h2>
                        {patient.phone && (
                          <div style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 6 }}>
                            <bdi className="num">{patient.phone}</bdi>
                          </div>
                        )}
                      </div>
                      <div className="responsive-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => { setShowNewVisit(true); goSection('visits', false); }} className="btn-pill btn-pill-charcoal" style={{ fontSize: 13, minHeight: 44 }}>
                          + {t.clinical.newVisitBtn}
                        </button>
                        <button type="button" onClick={() => { setShowNewLab(true); goSection('labs', false); }} className="btn-pill btn-pill-cloud" style={{ fontSize: 13, minHeight: 44, background: 'var(--color-paper-white)' }}>
                          + {D.visits.newLab}
                        </button>
                      </div>
                    </div>

                    {(patient.allergies?.length ?? 0) > 0 && (
                      <div
                        className="motion-alert-enter"
                        role="alert"
                        style={{ marginTop: 12, padding: '8px 14px', borderRadius: 14, background: 'var(--color-status-draft-bg)', border: '1px solid var(--color-status-draft-border)', display: 'flex', alignItems: 'center', gap: '4px 12px', flexWrap: 'wrap' }}
                      >
                        <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-status-draft-text)' }}>{t.clinical.allergiesWarning}</span>
                        <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>
                          {patient.allergies!.map((a) => (
                            <span key={a.id} style={{ marginInlineEnd: 14 }} dir="auto">
                              • {isRtl ? a.allergen_ar : a.allergen_en} ({a.severity})
                            </span>
                          ))}
                        </span>
                      </div>
                    )}

                    {/* Sections: [ and ] step through them */}
                    <nav aria-label={D.sections.nav} className="doctor-section-nav" style={{ marginTop: 10 }}>
                      {SECTIONS.map((s) => (
                        <button key={s} type="button" aria-current={section === s ? 'true' : undefined} onClick={() => goSection(s, false)}>
                          {D.sections[s]}
                        </button>
                      ))}
                    </nav>
                  </div>

                  {section === 'summary' && (
                    <Rise key="summary" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      <div ref={panelRef as React.RefObject<HTMLDivElement>} tabIndex={-1} style={{ outline: 'none', display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <PatientBrief
                          data={data}
                          summary={summary}
                          unseenCount={unseenIds.size}
                          onReviewMeds={() => goSection('medicines')}
                          onOpenChanges={() => changesRef.current?.focus()}
                        />
                        <ChangesPanel ref={changesRef} data={data} changes={changes} seen={seen} announcement={seenNote} onSeen={markSeen} onMarkAll={markAllSeen} />
                      </div>
                    </Rise>
                  )}

                  {section === 'labs' && (
                    <Rise key="labs" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {showNewLab && (
                        <div className="cloud-feature-card motion-alert-enter" style={{ padding: 28, background: 'var(--color-paper-white)', border: '1px solid var(--color-charcoal)' }}>
                          <h3 className="text-card-heading" style={{ fontSize: 18, marginBottom: 16 }}>{isRtl ? 'طلب فحص مخبري جديد' : 'Order Laboratory Test'}</h3>
                          <form onSubmit={handleCreateLabOrder}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
                              <div className="form-group">
                                <label className="form-label" htmlFor="lab-ar">{isRtl ? 'اسم الفحص بالعربية' : 'Test Name (Arabic)'} *</label>
                                <input id="lab-ar" type="text" required placeholder="فحص وظائف الكبد الشامل" value={labTestNameAr} onChange={(e) => setLabTestNameAr(e.target.value)} className="form-input" />
                              </div>
                              <div className="form-group">
                                <label className="form-label" htmlFor="lab-en">{isRtl ? 'اسم الفحص بالإنجليزية' : 'Test Name (English)'} *</label>
                                <input id="lab-en" type="text" required placeholder="Comprehensive Liver Function Test" value={labTestNameEn} onChange={(e) => setLabTestNameEn(e.target.value)} className="form-input" />
                              </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
                              <button type="button" onClick={() => setShowNewLab(false)} className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }}>{t.common.cancel}</button>
                              <button type="submit" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }}>{isRtl ? 'تأكيد طلب الفحص' : 'Confirm Order'}</button>
                            </div>
                          </form>
                        </div>
                      )}
                      <LabsPanel ref={panelRef} orders={data.labOrders} unseen={unseenIds} onOrder={() => setShowNewLab(true)} />
                    </Rise>
                  )}

                  {section === 'medicines' && (
                    <Rise key="meds" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {showNewRx && (
                        <div className="cloud-feature-card motion-alert-enter" style={{ padding: 28, background: 'var(--color-paper-white)', border: '1px solid var(--color-charcoal)' }}>
                          <h3 className="text-card-heading" style={{ fontSize: 18, marginBottom: 16 }}>{isRtl ? 'إصدار وصفة دوائية مرتبطة بالزيارة' : 'Issue Prescription for Consultation'}</h3>
                          <form onSubmit={handleCreatePrescription}>
                            {draftVisitList.length > 1 && (
                              <div className="form-group">
                                <label className="form-label" htmlFor="rx-visit">{D.sections.visits}</label>
                                <select id="rx-visit" className="form-select" value={selectedVisitId} onChange={(e) => setSelectedVisitId(e.target.value)}>
                                  {draftVisitList.map((v) => (
                                    <option key={v.id} value={v.id}>{formatDate(v.visit_date, locale)} · {v.diagnosis}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                              <div className="form-group">
                                <label className="form-label" htmlFor="rx-name">{isRtl ? 'اسم الدواء' : 'Medication Name'} *</label>
                                <input id="rx-name" type="text" required placeholder="Amlodipine Besylate" value={medicationName} onChange={(e) => setMedicationName(e.target.value)} className="form-input latin" />
                              </div>
                              <div className="form-group">
                                <label className="form-label" htmlFor="rx-dose">{isRtl ? 'الجرعة' : 'Dosage'} *</label>
                                <input id="rx-dose" type="text" required placeholder="5 mg" value={dosage} onChange={(e) => setDosage(e.target.value)} className="form-input" />
                              </div>
                              <div className="form-group">
                                <label className="form-label" htmlFor="rx-freq">{isRtl ? 'التكرار' : 'Frequency'} *</label>
                                <input id="rx-freq" type="text" required placeholder={isRtl ? 'مرة واحدة صباحاً' : 'Once daily'} value={frequency} onChange={(e) => setFrequency(e.target.value)} className="form-input" />
                              </div>
                              <div className="form-group">
                                <label className="form-label" htmlFor="rx-dur">{isRtl ? 'المدة' : 'Duration'} *</label>
                                <input id="rx-dur" type="text" required placeholder={isRtl ? '30 يوماً' : '30 days'} value={duration} onChange={(e) => setDuration(e.target.value)} className="form-input" />
                              </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
                              <button type="button" onClick={() => setShowNewRx(false)} className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }}>{t.common.cancel}</button>
                              <button type="submit" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }}>{isRtl ? 'إصدار الوصفة' : 'Issue Prescription'}</button>
                            </div>
                          </form>
                        </div>
                      )}
                      <MedsPanel ref={panelRef} prescriptions={data.prescriptions} interactions={summary.interactions} canAdd={draftVisitList.length > 0} onAdd={() => openRx()} />
                    </Rise>
                  )}

                  {section === 'visits' && (
                    <Rise key="visits" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {showNewVisit && (
                        <VisitComposer
                          allergies={patient.allergies ?? []}
                          currentMedicines={currentMeds}
                          onSubmit={handleCreateVisitDraft}
                          onCancel={() => setShowNewVisit(false)}
                        />
                      )}

                      <section ref={panelRef} tabIndex={-1} aria-labelledby="doctor-visits-title" style={{ display: 'flex', flexDirection: 'column', gap: 16, outline: 'none' }}>
                        <h3 id="doctor-visits-title" className="text-card-heading" style={{ fontSize: 20 }}>{D.visits.title}</h3>
                        {data.visits.length === 0 ? (
                          <div className="cloud-feature-card" style={{ textAlign: 'center', padding: 36, color: 'var(--color-body-gray)' }}>
                            <p style={{ marginBottom: 14 }}>{D.visits.empty}</p>
                            <button type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} onClick={() => setShowNewVisit(true)}>
                              + {D.visits.emptyAction}
                            </button>
                          </div>
                        ) : (
                          data.visits.map((v) => (
                            <div key={v.id} className="cloud-feature-card" style={{ padding: 26 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-ink)' }}>{formatDate(v.visit_date, locale)}</span>
                                  <span className={`status-badge ${v.status === 'approved' ? 'badge-approved' : 'badge-draft'}`}>
                                    {v.status === 'approved' ? Icon.check : Icon.circle}
                                    <span>{v.status === 'approved' ? t.clinical.approved : t.clinical.draft}</span>
                                  </span>
                                </div>
                                {v.status === 'draft' && (
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => openRx(v.id)} className="btn-pill btn-pill-cloud" style={{ fontSize: 12, minHeight: 44, background: 'var(--color-paper-white)' }}>
                                      + {D.visits.addRx}
                                    </button>
                                    <button type="button" onClick={() => setApprovalVisitId(v.id)} className="btn-pill btn-pill-charcoal" style={{ fontSize: 12, minHeight: 44 }}>
                                      ✓ {t.clinical.approveVisitBtn}
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{t.clinical.chiefComplaint}:</div>
                                <div style={{ fontSize: 15, color: 'var(--color-ink)' }} dir="auto">{v.chief_complaint}</div>
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{t.clinical.diagnosis}:</div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-metric-blue)' }} dir="auto">{v.diagnosis}</div>
                              </div>
                              {v.treatment_plan && (
                                <div style={{ marginTop: 10, padding: '12px 16px', background: 'var(--color-paper-white)', borderRadius: 12, fontSize: 14, color: 'var(--color-body-gray)', lineHeight: 1.5 }}>
                                  <strong style={{ color: 'var(--color-ink)' }}>{t.clinical.treatmentPlan}:</strong>
                                  <div style={{ marginTop: 2, whiteSpace: 'pre-line' }} dir="auto">{v.treatment_plan}</div>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </section>
                    </Rise>
                  )}
                </div>
              )}
            </LoadSwap>
          </div>
        ) : (
          <div className="cloud-feature-card" style={{ padding: 56, textAlign: 'center', color: 'var(--color-body-gray)' }}>
            {D.selectPatient}
          </div>
        )}
      </div>

      <ApprovalDialog
        open={!!approvalVisitId}
        visit={approvalVisit}
        linkedRx={data?.prescriptions.filter((p) => p.visit_id === approvalVisitId) ?? []}
        linkedLabs={data?.labOrders.filter((l) => l.visit_id === approvalVisitId) ?? []}
        allergies={patient?.allergies ?? []}
        otherMedicines={currentMeds}
        onApprove={handleApproveVisit}
        onClose={() => setApprovalVisitId(null)}
        onNextPatient={nextWaiting ? () => { setApprovalVisitId(null); void selectPatient(nextWaiting.patient_id); } : undefined}
      />
      <PatientSearch
        open={searchOpen}
        patients={patients}
        waitingIds={waitingIds}
        onSelect={(id) => void selectPatient(id)}
        onClose={() => setSearchOpen(false)}
      />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <DemoTour />
    </div>
  );
};
