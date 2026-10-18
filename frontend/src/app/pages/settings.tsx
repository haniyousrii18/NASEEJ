import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLang } from '../../context/LangContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate, nameOf, pick } from '../format.js';
import type { AppRole } from '../nav.js';
import { Async, Button, Card, Dialog, EmptyState, Field, Notice, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { ScopeList } from './caregiver.js';

/**
 * Settings for the signed-in account. One page per role (`<role>/settings`), composed from the sections that role
 * is allowed to use. Every control here either saves to the server (the API acts on the signed-in account only) or
 * is labelled "this device". Nothing is shown that does not work, and nothing here edits clinical content.
 */

interface Center {
  id: string;
  name_ar: string;
  name_en: string;
  code: string;
  contact_phone: string | null;
  contact_email: string | null;
  address_ar: string | null;
  address_en: string | null;
  role: 'center_manager' | 'doctor' | 'reception' | 'caregiver' | 'care_coordinator';
  specialty_ar: string | null;
  specialty_en: string | null;
  license_number: string | null;
}

interface AccountData {
  id: string;
  email: string;
  fullNameAr: string;
  fullNameEn: string;
  phone: string | null;
  isPatient: boolean;
  nameEditable: boolean;
  centers: Center[];
  patient: { phone: string; email: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null } | null;
}

type Flash = { tone: 'ok' | 'danger'; text: string } | null;

const PHONE_RE = /^\+?[0-9][0-9\s-]{5,18}[0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Warns before leaving the page (reload, close, or another in-app page) while edits are unsaved. */
function useUnsavedGuard(dirty: boolean, message: string) {
  const last = useRef(window.location.hash);
  useEffect(() => {
    if (!dirty) {
      last.current = window.location.hash;
      return;
    }
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onHash = () => {
      if (window.location.hash === last.current) return;
      if (!window.confirm(message)) window.location.hash = last.current;
    };
    window.addEventListener('beforeunload', onBefore);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('beforeunload', onBefore);
      window.removeEventListener('hashchange', onHash);
    };
  }, [dirty, message]);
}

const Scope: React.FC<{ kind: 'account' | 'center' | 'device'; editable?: boolean }> = ({ kind, editable }) => {
  const B = useA().settings.badges;
  return (
    <div className="na-set-badges">
      <Pill tone="info">{kind === 'account' ? B.thisAccount : kind === 'center' ? B.thisCenter : B.thisDevice}</Pill>
      {editable !== undefined && <Pill tone={editable ? 'ok' : 'neutral'}>{editable ? `✓ ${B.editable}` : B.readOnly}</Pill>}
    </div>
  );
};

const ReadRow: React.FC<{ label: string; children: React.ReactNode; ltr?: boolean }> = ({ label, children, ltr }) => (
  <>
    <dt>{label}</dt>
    <dd className={ltr ? 'na-ltr' : undefined} dir={ltr ? 'ltr' : undefined}>
      {children}
    </dd>
  </>
);

/* ------------------------------------------------------------------ Account (every role) */
const AccountSection: React.FC<{ data: AccountData; onSaved: () => void }> = ({ data, onSaved }) => {
  const A = useA();
  const S = A.settings;
  const { updateUser } = useAuth();
  const save = useMutation();
  const [form, setForm] = useState({ nameAr: data.fullNameAr, nameEn: data.fullNameEn, phone: data.phone ?? '' });
  const [flash, setFlash] = useState<Flash>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = data.nameEditable && (form.nameAr !== data.fullNameAr || form.nameEn !== data.fullNameEn || form.phone !== (data.phone ?? ''));
  useUnsavedGuard(dirty, S.leave);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.nameAr.trim().length < 2) next.nameAr = S.account.invalidName;
    if (form.nameEn.trim().length < 2) next.nameEn = S.account.invalidName;
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) next.phone = S.account.invalidPhone;
    setErrors(next);
    if (Object.keys(next).length) return;
    const res = await save.run<{ fullNameAr: string; fullNameEn: string }>('/api/account/profile', 'PATCH', {
      fullNameAr: form.nameAr.trim(),
      fullNameEn: form.nameEn.trim(),
      phone: form.phone.trim() || null,
    });
    if (res.ok) {
      updateUser({ fullNameAr: res.data.fullNameAr, fullNameEn: res.data.fullNameEn });
      setFlash({ tone: 'ok', text: S.account.saved });
      onSaved();
    } else {
      const field = res.error.details?.field as string | undefined;
      if (field) setErrors({ [field]: res.error.message });
      setFlash({ tone: 'danger', text: res.error.message });
    }
  };

  return (
    <Card title={S.account.title} hint={S.account.hint}>
      <Scope kind="account" editable={data.nameEditable} />
      {data.nameEditable ? (
        <form onSubmit={submit} noValidate className="na-set-form">
          <div className="na-grid na-grid--2">
            <Field label={S.account.nameAr} htmlFor="set-name-ar">
              <input id="set-name-ar" className="na-input" lang="ar" dir="rtl" maxLength={120} value={form.nameAr} aria-invalid={!!errors.nameAr} aria-describedby={errors.nameAr ? 'set-name-ar-err' : undefined} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
              {errors.nameAr && <p id="set-name-ar-err" className="na-set-error">{errors.nameAr}</p>}
            </Field>
            <Field label={S.account.nameEn} htmlFor="set-name-en">
              <input id="set-name-en" className="na-input" lang="en" dir="ltr" maxLength={120} value={form.nameEn} aria-invalid={!!errors.nameEn} aria-describedby={errors.nameEn ? 'set-name-en-err' : undefined} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              {errors.nameEn && <p id="set-name-en-err" className="na-set-error">{errors.nameEn}</p>}
            </Field>
            <Field label={S.account.phone} htmlFor="set-phone" help={S.account.phoneHelp}>
              <input id="set-phone" type="tel" className="na-input" dir="ltr" autoComplete="tel" maxLength={20} value={form.phone} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'set-phone-err' : undefined} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {errors.phone && <p id="set-phone-err" className="na-set-error">{errors.phone}</p>}
            </Field>
            <Field label={S.account.email} htmlFor="set-email" help={S.account.emailHelp}>
              <input id="set-email" className="na-input" dir="ltr" value={data.email} readOnly aria-readonly="true" />
            </Field>
          </div>
          {flash && <Notice tone={flash.tone} live>{flash.text}</Notice>}
          <div className="na-set-actions">
            <Button type="submit" variant="primary" disabled={!dirty || save.pending}>
              {save.pending ? S.actions.saving : S.actions.save}
            </Button>
            {dirty && (
              <Button variant="quiet" onClick={() => { setForm({ nameAr: data.fullNameAr, nameEn: data.fullNameEn, phone: data.phone ?? '' }); setErrors({}); }}>
                {S.actions.discard}
              </Button>
            )}
            {dirty && <span className="na-muted" role="status">{S.account.unsaved}</span>}
          </div>
        </form>
      ) : (
        <>
          <dl className="na-dl">
            <ReadRow label={S.account.nameAr}>{data.fullNameAr}</ReadRow>
            <ReadRow label={S.account.nameEn} ltr>{data.fullNameEn}</ReadRow>
            <ReadRow label={S.account.email} ltr>{data.email}</ReadRow>
          </dl>
          <p className="na-muted">{S.account.nameManagedPatient}</p>
        </>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ Patient contact and emergency details */
const PatientContactSection: React.FC<{ data: AccountData; onSaved: () => void }> = ({ data, onSaved }) => {
  const A = useA();
  const S = A.settings;
  const save = useMutation();
  const p = data.patient!;
  const initial = { phone: p.phone ?? '', email: p.email ?? '', ecName: p.emergency_contact_name ?? '', ecPhone: p.emergency_contact_phone ?? '' };
  const [form, setForm] = useState(initial);
  const [flash, setFlash] = useState<Flash>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some((k) => form[k] !== initial[k]);
  useUnsavedGuard(dirty, S.leave);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!PHONE_RE.test(form.phone.trim())) next.phone = S.account.invalidPhone;
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = S.contact.invalidEmail;
    if (form.ecPhone.trim() && !PHONE_RE.test(form.ecPhone.trim())) next.ecPhone = S.account.invalidPhone;
    setErrors(next);
    if (Object.keys(next).length) return;
    // Only the fields the person changed are sent.
    const body: Record<string, string | null> = {};
    if (form.phone !== initial.phone) body.phone = form.phone.trim();
    if (form.email !== initial.email) body.email = form.email.trim() || null;
    if (form.ecName !== initial.ecName) body.emergencyContactName = form.ecName.trim() || null;
    if (form.ecPhone !== initial.ecPhone) body.emergencyContactPhone = form.ecPhone.trim() || null;
    const res = await save.run('/api/account/patient-contact', 'PATCH', body);
    if (res.ok) {
      setFlash({ tone: 'ok', text: S.contact.saved });
      onSaved();
    } else {
      setFlash({ tone: 'danger', text: res.error.message });
    }
  };

  return (
    <Card title={S.contact.title} hint={S.contact.hint}>
      <Scope kind="account" editable />
      <form onSubmit={submit} noValidate className="na-set-form">
        <div className="na-grid na-grid--2">
          <Field label={S.contact.phone} htmlFor="set-pc-phone">
            <input id="set-pc-phone" type="tel" className="na-input" dir="ltr" autoComplete="tel" maxLength={20} value={form.phone} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'set-pc-phone-err' : undefined} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {errors.phone && <p id="set-pc-phone-err" className="na-set-error">{errors.phone}</p>}
          </Field>
          <Field label={S.contact.email} htmlFor="set-pc-email" help={S.contact.emailHelp}>
            <input id="set-pc-email" type="email" className="na-input" dir="ltr" autoComplete="email" maxLength={255} value={form.email} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'set-pc-email-err' : undefined} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <p id="set-pc-email-err" className="na-set-error">{errors.email}</p>}
          </Field>
          <Field label={S.contact.emergencyName} htmlFor="set-pc-ecn">
            <input id="set-pc-ecn" className="na-input" maxLength={255} value={form.ecName} onChange={(e) => setForm({ ...form, ecName: e.target.value })} />
          </Field>
          <Field label={S.contact.emergencyPhone} htmlFor="set-pc-ecp">
            <input id="set-pc-ecp" type="tel" className="na-input" dir="ltr" maxLength={20} value={form.ecPhone} aria-invalid={!!errors.ecPhone} aria-describedby={errors.ecPhone ? 'set-pc-ecp-err' : undefined} onChange={(e) => setForm({ ...form, ecPhone: e.target.value })} />
            {errors.ecPhone && <p id="set-pc-ecp-err" className="na-set-error">{errors.ecPhone}</p>}
          </Field>
        </div>
        {flash && <Notice tone={flash.tone} live>{flash.text}</Notice>}
        <div className="na-set-actions">
          <Button type="submit" variant="primary" disabled={!dirty || save.pending}>
            {save.pending ? S.actions.saving : S.actions.save}
          </Button>
          {dirty && <Button variant="quiet" onClick={() => { setForm(initial); setErrors({}); }}>{S.actions.discard}</Button>}
          {dirty && <span className="na-muted" role="status">{S.account.unsaved}</span>}
        </div>
      </form>
    </Card>
  );
};

/* ------------------------------------------------------------------ Patient: sharing summary */
const PatientSharingSection: React.FC<{ navigate: (route: string) => void }> = ({ navigate }) => {
  const S = useA().settings;
  const caregivers = useApiData<Array<{ state: string }>>('/api/portal/caregivers');
  const consents = useApiData<Array<{ state: string }>>('/api/portal/consents');
  const count = (s: typeof caregivers.state) => (s.status === 'ready' ? String(s.data.filter((r) => r.state === 'active').length) : '…');
  return (
    <Card title={S.sharing.title} hint={S.sharing.hint}>
      <Scope kind="account" />
      <ul className="na-list">
        <li className="na-list-item">
          <div className="na-row na-row--between">
            <div>
              <strong>{S.sharing.caregivers}</strong>
              <p className="na-muted">{S.sharing.caregiversBody}</p>
            </div>
            <span className="na-bignum" aria-label={`${S.sharing.caregiversBody}: ${count(caregivers.state)}`}>{count(caregivers.state)}</span>
          </div>
          <div className="na-row">
            <Button small onClick={() => navigate('patient/caregivers')}>{S.sharing.manageCaregivers}</Button>
          </div>
        </li>
        <li className="na-list-item">
          <div className="na-row na-row--between">
            <div>
              <strong>{S.sharing.consents}</strong>
              <p className="na-muted">{S.sharing.consentsBody}</p>
            </div>
            <span className="na-bignum" aria-label={`${S.sharing.consentsBody}: ${count(consents.state)}`}>{count(consents.state)}</span>
          </div>
          <div className="na-row">
            <Button small onClick={() => navigate('patient/consents')}>{S.sharing.manageConsents}</Button>
          </div>
        </li>
      </ul>
    </Card>
  );
};

/* ------------------------------------------------------------------ Caregiver: own delegations */
interface Delegation {
  id: string;
  relationship: string | null;
  can_view_records: boolean;
  can_manage_appointments: boolean;
  can_send_messages: boolean;
  state: string;
  expires_at: string;
  patient_name_ar: string;
  patient_name_en: string;
}

const CaregiverDelegationsSection: React.FC<{ navigate: (route: string) => void }> = ({ navigate }) => {
  const A = useA();
  const S = A.settings.delegations;
  const list = useApiData<Delegation[]>('/api/caregiver/delegations');
  const leave = useMutation();
  const [confirming, setConfirming] = useState<Delegation | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  const doLeave = async () => {
    if (!confirming) return;
    const res = await leave.run(`/api/caregiver/delegations/${confirming.id}/leave`, 'POST');
    setConfirming(null);
    if (res.ok) {
      setFlash({ tone: 'ok', text: S.left });
      void list.reload();
    } else {
      setFlash({ tone: 'danger', text: res.error.message });
    }
  };

  return (
    <Card title={S.title} hint={S.hint}>
      <Scope kind="account" editable={false} />
      {flash && <Notice tone={flash.tone} live>{flash.text}</Notice>}
      <Async state={list.state} onRetry={list.reload} isEmpty={(d) => d.filter((x) => x.state === 'active').length === 0} empty={<EmptyState title={S.none} body={S.noneBody} />}>
        {(rows) => (
          <ul className="na-list">
            {rows
              .filter((d) => d.state === 'active')
              .map((d) => (
                <li key={d.id} className="na-list-item">
                  <div className="na-row na-row--between">
                    <strong>{nameOf(A.lang, { name_ar: d.patient_name_ar, name_en: d.patient_name_en })}</strong>
                    <Pill tone="ok">✓ {A.care.states.active}</Pill>
                  </div>
                  <ScopeList d={d} />
                  <p className="na-muted">{fill(S.ends, { date: formatDate(A.lang, d.expires_at) })}</p>
                  <div className="na-row">
                    <Button small variant="quiet" onClick={() => setConfirming(d)}>{A.settings.actions.end}</Button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Async>
      <div className="na-row">
        <Button small onClick={() => navigate('caregiver/home')}>{S.manage}</Button>
      </div>
      {confirming && (
        <Dialog title={S.leaveTitle} onClose={() => setConfirming(null)}>
          <p>{S.leaveBody}</p>
          <div className="na-set-actions">
            <Button variant="danger" disabled={leave.pending} onClick={() => void doLeave()}>{A.settings.actions.end}</Button>
            <Button variant="quiet" onClick={() => setConfirming(null)}>{A.common.actions.cancel}</Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ Staff: read-only affiliation */
const AffiliationSection: React.FC<{ centers: Center[]; showProfessional: boolean }> = ({ centers, showProfessional }) => {
  const A = useA();
  const S = A.settings.affiliations;
  if (centers.length === 0) return null;
  return (
    <Card title={S.title} hint={S.hint}>
      <Scope kind="account" editable={false} />
      <ul className="na-list">
        {centers.map((c) => (
          <li key={c.id} className="na-list-item">
            <dl className="na-dl">
              <ReadRow label={S.center}>{pick(A.lang, c as unknown as Record<string, unknown>, 'name')}</ReadRow>
              <ReadRow label={S.role}>{S.roles[c.role] ?? c.role}</ReadRow>
              {showProfessional && <ReadRow label={S.specialty}>{pick(A.lang, c as unknown as Record<string, unknown>, 'specialty') || S.none}</ReadRow>}
              {showProfessional && <ReadRow label={S.license} ltr>{c.license_number || S.none}</ReadRow>}
            </dl>
          </li>
        ))}
      </ul>
      {showProfessional && <Pill tone="neutral">{A.settings.badges.managed}</Pill>}
    </Card>
  );
};

/* ------------------------------------------------------------------ Manager: whole-center details */
const CenterSection: React.FC<{ centers: Center[]; navigate: (route: string) => void }> = ({ centers, navigate }) => {
  const A = useA();
  const S = A.settings.center;
  const { currentOrgId } = useAuth();
  const managed = centers.filter((c) => c.role === 'center_manager');
  const center = managed.find((c) => c.id === currentOrgId) ?? managed[0];
  if (!center) return null;
  const row = center as unknown as Record<string, unknown>;
  return (
    <Card title={S.title} hint={S.hint}>
      <Scope kind="center" editable={false} />
      <Pill tone="neutral">{A.settings.badges.managedAdmin}</Pill>
      <dl className="na-dl">
        <ReadRow label={S.name}>{pick(A.lang, row, 'name')}</ReadRow>
        <ReadRow label={S.code} ltr>{center.code}</ReadRow>
        <ReadRow label={S.phone} ltr>{center.contact_phone || A.settings.states.empty}</ReadRow>
        <ReadRow label={S.email} ltr>{center.contact_email || A.settings.states.empty}</ReadRow>
        <ReadRow label={S.address}>{pick(A.lang, row, 'address') || A.settings.states.empty}</ReadRow>
      </dl>
      <h3 className="na-card-title">{S.links}</h3>
      <div className="na-row">
        <Button small onClick={() => navigate('manager/staff')}>{S.staff}</Button>
        <Button small onClick={() => navigate('manager/services')}>{S.services}</Button>
        <Button small onClick={() => navigate('manager/schedule')}>{S.schedule}</Button>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------ Platform administrator */
const PlatformSection: React.FC<{ navigate: (route: string) => void }> = ({ navigate }) => {
  const S = useA().settings.platform;
  return (
    <Card title={S.title} hint={S.hint}>
      <Scope kind="account" />
      <div className="na-row">
        <Button small onClick={() => navigate('admin/centers')}>{S.centers}</Button>
        <Button small onClick={() => navigate('admin/accounts')}>{S.accounts}</Button>
        <Button small onClick={() => navigate('admin/audit')}>{S.audit}</Button>
      </div>
      <Notice tone="info" icon="shield">{S.wall}</Notice>
    </Card>
  );
};

/* ------------------------------------------------------------------ Preferences (this device) */
const PreferencesSection: React.FC = () => {
  const A = useA();
  const S = A.settings.prefs;
  const { lang, setLang } = useLang();
  const { workspace } = useTheme();
  return (
    <Card title={S.title} hint={S.hint}>
      <Scope kind="device" editable />
      <div className="na-set-pref">
        <div role="group" aria-labelledby="set-lang-label">
          <p id="set-lang-label" className="na-label">{S.language}</p>
          <div className="na-row">
            {(['ar', 'en'] as const).map((l) => (
              <Button key={l} small variant={lang === l ? 'primary' : undefined} aria-pressed={lang === l} lang={l} onClick={() => setLang(l)}>
                {lang === l ? '✓ ' : ''}{S[l]}
              </Button>
            ))}
          </div>
          <p className="na-help">{S.languageHelp}</p>
        </div>
        <div role="group" aria-labelledby="set-theme-label">
          <p id="set-theme-label" className="na-label">{S.theme}</p>
          <div className="na-row">
            {(['light', 'dark'] as const).map((t) => (
              <Button key={t} small variant={workspace.theme === t ? 'primary' : undefined} aria-pressed={workspace.theme === t} onClick={() => workspace.setTheme(t)}>
                {workspace.theme === t ? '✓ ' : ''}{S[t]}
              </Button>
            ))}
          </div>
          <p className="na-help">{S.themeHelp}</p>
        </div>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------ Security */
const SecuritySection: React.FC = () => {
  const A = useA();
  const S = A.settings;
  const { logout } = useAuth();
  const change = useMutation();
  const empty = { current: '', next: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [flash, setFlash] = useState<Flash>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = form.current !== '' || form.next !== '' || form.confirm !== '';
  useUnsavedGuard(dirty, S.leave);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.current) next.current = S.security.wrongCurrent;
    if (form.next.length < 8 || !/[A-Za-z؀-ۿ]/.test(form.next) || !/[0-9]/.test(form.next)) next.next = S.security.rule;
    else if (form.next !== form.confirm) next.confirm = S.security.mismatch;
    setErrors(next);
    setFlash(null);
    if (Object.keys(next).length) return;
    const res = await change.run('/api/account/password', 'POST', { currentPassword: form.current, newPassword: form.next });
    if (res.ok) {
      setForm(empty);
      setFlash({ tone: 'ok', text: S.security.changed });
    } else if (res.error.code === 'CURRENT_PASSWORD_INCORRECT') {
      setErrors({ current: S.security.wrongCurrent });
    } else {
      setFlash({ tone: 'danger', text: res.error.message });
    }
  };

  const field = (id: 'current' | 'next' | 'confirm', label: string, help?: string) => (
    <Field label={label} htmlFor={`set-pw-${id}`} help={help}>
      <input
        id={`set-pw-${id}`}
        type="password"
        className="na-input"
        dir="ltr"
        autoComplete={id === 'current' ? 'current-password' : 'new-password'}
        value={form[id]}
        aria-invalid={!!errors[id]}
        aria-describedby={errors[id] ? `set-pw-${id}-err` : undefined}
        onChange={(e) => setForm({ ...form, [id]: e.target.value })}
      />
      {errors[id] && <p id={`set-pw-${id}-err`} className="na-set-error">{errors[id]}</p>}
    </Field>
  );

  return (
    <Card title={S.security.title} hint={S.security.hint}>
      <Scope kind="account" editable />
      <form onSubmit={submit} noValidate className="na-set-form" autoComplete="off">
        <div className="na-grid na-grid--3">
          {field('current', S.security.current)}
          {field('next', S.security.next, S.security.rule)}
          {field('confirm', S.security.confirm)}
        </div>
        {flash && <Notice tone={flash.tone} live>{flash.text}</Notice>}
        <div className="na-set-actions">
          <Button type="submit" variant="primary" disabled={!dirty || change.pending}>
            {change.pending ? S.actions.saving : S.actions.change}
          </Button>
        </div>
      </form>
      <h3 className="na-card-title">{S.security.sessionsTitle}</h3>
      <p className="na-muted">{S.security.sessionsBody}</p>
      <div className="na-row">
        <Button small icon="logout" onClick={logout}>{S.actions.signOut}</Button>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------ The page */
export const Settings: React.FC<{ role: AppRole; navigate: (route: string) => void }> = ({ role, navigate }) => {
  const A = useA();
  const S = A.settings;
  const account = useApiData<AccountData>('/api/account');
  const reload = useCallback(() => void account.reload(), [account]);

  return (
    <>
      <PageHead title={S.title} subtitle={S.roleIntro[role]} />
      <Async state={account.state} onRetry={account.reload}>
        {(data) => (
          <div className="na-set">
            <AccountSection data={data} onSaved={reload} />
            {role === 'patient' && data.patient && <PatientContactSection data={data} onSaved={reload} />}
            {role === 'patient' && <PatientSharingSection navigate={navigate} />}
            {role === 'caregiver' && <CaregiverDelegationsSection navigate={navigate} />}
            {(role === 'doctor' || role === 'reception' || role === 'care_coordinator' || role === 'center_manager') && (
              <AffiliationSection centers={data.centers} showProfessional={role === 'doctor'} />
            )}
            {role === 'center_manager' && <CenterSection centers={data.centers} navigate={navigate} />}
            {role === 'platform_admin' && <PlatformSection navigate={navigate} />}
            <PreferencesSection />
            <SecuritySection />
          </div>
        )}
      </Async>
    </>
  );
};
