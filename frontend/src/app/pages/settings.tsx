import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLang } from '../../context/LangContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate, nameOf, pick } from '../format.js';
import type { AppRole } from '../nav.js';
import { AppIcon, type IconName } from '../AppIcons.js';
import { Async, Button, Dialog, EmptyState, Field, Notice, PageHead, Pill } from '../ui.js';
import { PrivacySection } from '../health/PrivacyPanel.js';
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

/** One group of related controls inside a tab panel. `heading` is used only when a panel holds more than one group. */
const Block: React.FC<{ heading?: string; children: React.ReactNode }> = ({ heading, children }) => (
  <div className="na-set-block">
    {heading && <h3 className="na-set-h">{heading}</h3>}
    {children}
  </div>
);

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
    <Block>
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
            <Field label={S.account.phone} htmlFor="set-phone">
              <input id="set-phone" type="tel" className="na-input" dir="ltr" autoComplete="tel" maxLength={20} value={form.phone} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'set-phone-err' : undefined} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {errors.phone && <p id="set-phone-err" className="na-set-error">{errors.phone}</p>}
            </Field>
            <Field label={S.account.email} htmlFor="set-email">
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
          </div>
        </form>
      ) : (
        <>
          <dl className="na-dl">
            <ReadRow label={S.account.nameAr}>{data.fullNameAr}</ReadRow>
            <ReadRow label={S.account.nameEn} ltr>{data.fullNameEn}</ReadRow>
            <ReadRow label={S.account.email} ltr>{data.email}</ReadRow>
          </dl>
        </>
      )}
    </Block>
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
    <Block>
      <form onSubmit={submit} noValidate className="na-set-form">
        <div className="na-grid na-grid--2">
          <Field label={S.contact.phone} htmlFor="set-pc-phone">
            <input id="set-pc-phone" type="tel" className="na-input" dir="ltr" autoComplete="tel" maxLength={20} value={form.phone} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'set-pc-phone-err' : undefined} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {errors.phone && <p id="set-pc-phone-err" className="na-set-error">{errors.phone}</p>}
          </Field>
          <Field label={S.contact.email} htmlFor="set-pc-email">
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
        </div>
      </form>
    </Block>
  );
};

/* ------------------------------------------------------------------ Patient: sharing summary */
const PatientSharingSection: React.FC<{ navigate: (route: string) => void }> = ({ navigate }) => {
  const S = useA().settings;
  const caregivers = useApiData<Array<{ state: string }>>('/api/portal/caregivers');
  const consents = useApiData<Array<{ state: string }>>('/api/portal/consents');
  const count = (s: typeof caregivers.state) => (s.status === 'ready' ? String(s.data.filter((r) => r.state === 'active').length) : '…');
  return (
    <Block>
      <ul className="na-list">
        <li className="na-list-item">
          <div className="na-row na-row--between">
            <div>
              <strong>{S.sharing.caregivers}</strong>
            </div>
            <span className="na-bignum" aria-label={`${S.sharing.caregivers}: ${count(caregivers.state)}`}>{count(caregivers.state)}</span>
          </div>
          <div className="na-row">
            <Button small onClick={() => navigate('patient/caregivers')}>{S.sharing.manageCaregivers}</Button>
          </div>
        </li>
        <li className="na-list-item">
          <div className="na-row na-row--between">
            <div>
              <strong>{S.sharing.consents}</strong>
            </div>
            <span className="na-bignum" aria-label={`${S.sharing.consents}: ${count(consents.state)}`}>{count(consents.state)}</span>
          </div>
          <div className="na-row">
            <Button small onClick={() => navigate('patient/consents')}>{S.sharing.manageConsents}</Button>
          </div>
        </li>
      </ul>
    </Block>
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
    <Block>
      {flash && <Notice tone={flash.tone} live>{flash.text}</Notice>}
      <Async state={list.state} onRetry={list.reload} isEmpty={(d) => d.filter((x) => x.state === 'active').length === 0} empty={<EmptyState title={S.none} />}>
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
    </Block>
  );
};

/* ------------------------------------------------------------------ Staff: read-only affiliation */
const AffiliationSection: React.FC<{ centers: Center[]; showProfessional: boolean; headed?: boolean }> = ({ centers, showProfessional, headed }) => {
  const A = useA();
  const S = A.settings.affiliations;
  if (centers.length === 0) return null;
  return (
    <Block heading={headed ? S.title : undefined}>
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
    </Block>
  );
};

/* ------------------------------------------------------------------ Manager: whole-center details */
const CenterSection: React.FC<{ centers: Center[]; navigate: (route: string) => void; headed?: boolean }> = ({ centers, navigate, headed }) => {
  const A = useA();
  const S = A.settings.center;
  const { currentOrgId } = useAuth();
  const managed = centers.filter((c) => c.role === 'center_manager');
  const center = managed.find((c) => c.id === currentOrgId) ?? managed[0];
  if (!center) return null;
  const row = center as unknown as Record<string, unknown>;
  return (
    <Block heading={headed ? S.title : undefined}>
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
    </Block>
  );
};

/* ------------------------------------------------------------------ Platform administrator */
const PlatformSection: React.FC<{ navigate: (route: string) => void }> = ({ navigate }) => {
  const S = useA().settings.platform;
  return (
    <Block>
      <div className="na-row">
        <Button small onClick={() => navigate('admin/centers')}>{S.centers}</Button>
        <Button small onClick={() => navigate('admin/accounts')}>{S.accounts}</Button>
        <Button small onClick={() => navigate('admin/audit')}>{S.audit}</Button>
      </div>
    </Block>
  );
};

/* ------------------------------------------------------------------ Preferences (this device) */
const PreferencesSection: React.FC = () => {
  const A = useA();
  const S = A.settings.prefs;
  const { lang, setLang } = useLang();
  const { workspace } = useTheme();
  return (
    <Block>
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
        </div>
      </div>
    </Block>
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

  const field = (id: 'current' | 'next' | 'confirm', label: string) => (
    <Field label={label} htmlFor={`set-pw-${id}`}>
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
    <Block>
      <form onSubmit={submit} noValidate className="na-set-form" autoComplete="off">
        <div className="na-grid na-grid--3">
          {field('current', S.security.current)}
          {field('next', S.security.next)}
          {field('confirm', S.security.confirm)}
        </div>
        {flash && <Notice tone={flash.tone} live>{flash.text}</Notice>}
        <div className="na-set-actions">
          <Button type="submit" variant="primary" disabled={!dirty || change.pending}>
            {change.pending ? S.actions.saving : S.actions.change}
          </Button>
        </div>
      </form>
      <div className="na-row">
        <Button small icon="logout" onClick={logout}>{S.actions.signOut}</Button>
      </div>
    </Block>
  );
};

/* ------------------------------------------------------------------ The page */
type TabId = 'profile' | 'contact' | 'sharing' | 'privacy' | 'access' | 'org' | 'platform' | 'security' | 'prefs';

const TAB_ICON: Record<TabId, IconName> = { profile: 'user', contact: 'message', sharing: 'users', privacy: 'lock', access: 'users', org: 'building', platform: 'building', security: 'shield', prefs: 'globe' };

/** Which tabs each role has, in display order. A tab exists only when it holds working controls. */
const TABS_BY_ROLE: Record<AppRole, TabId[]> = {
  patient: ['profile', 'contact', 'sharing', 'privacy', 'security', 'prefs'],
  caregiver: ['profile', 'access', 'security', 'prefs'],
  doctor: ['profile', 'org', 'security', 'prefs'],
  reception: ['profile', 'org', 'security', 'prefs'],
  care_coordinator: ['profile', 'org', 'security', 'prefs'],
  center_manager: ['profile', 'org', 'security', 'prefs'],
  platform_admin: ['profile', 'platform', 'security', 'prefs'],
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('')
    .toUpperCase();

const ProfileHeader: React.FC<{ data: AccountData; role: AppRole }> = ({ data, role }) => {
  const A = useA();
  const name = nameOf(A.lang, { full_name_ar: data.fullNameAr, full_name_en: data.fullNameEn });
  return (
    <div className="na-set-id">
      <span className="na-set-avatar" aria-hidden="true">
        {initials(name) || '·'}
      </span>
      <div className="na-set-id-text">
        <strong>{name}</strong>
        <span className="na-muted">
          <bdi dir="ltr">{data.email}</bdi> · {A.settings.roleNames[role]}
        </span>
      </div>
    </div>
  );
};

export const Settings: React.FC<{ role: AppRole; navigate: (route: string) => void }> = ({ role, navigate }) => {
  const A = useA();
  const S = A.settings;
  const account = useApiData<AccountData>('/api/account');
  const reload = useCallback(() => void account.reload(), [account]);
  const tabs = TABS_BY_ROLE[role];
  const fromUrl = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab') as TabId | null;
  const [tab, setTab] = useState<TabId>(fromUrl && tabs.includes(fromUrl) ? fromUrl : tabs[0]);

  const select = (id: TabId) => {
    setTab(id);
    // Keep the tab in the address so a refresh or a shared link lands on it. No navigation happens, so no unsaved-edit prompt.
    const route = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    window.history.replaceState(null, '', `#/${route}?tab=${id}`);
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const forward = A.isRtl ? 'ArrowLeft' : 'ArrowRight';
    const back = A.isRtl ? 'ArrowRight' : 'ArrowLeft';
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === forward) next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowUp' || e.key === back) next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next]);
    document.getElementById(`set-tab-${tabs[next]}`)?.focus();
  };

  return (
    <>
      <PageHead title={S.title} />
      <Async state={account.state} onRetry={account.reload}>
        {(data) => {
          // Every panel stays mounted (hidden when inactive) so unsaved edits survive a tab switch.
          const panels: Record<TabId, React.ReactNode> = {
            profile: (
              <>
                <ProfileHeader data={data} role={role} />
                <AccountSection data={data} onSaved={reload} />
              </>
            ),
            contact: data.patient ? <PatientContactSection data={data} onSaved={reload} /> : null,
            sharing: <PatientSharingSection navigate={navigate} />,
            privacy: <PrivacySection navigate={navigate} />,
            access: <CaregiverDelegationsSection navigate={navigate} />,
            org: (
              <>
                <AffiliationSection centers={data.centers} showProfessional={role === 'doctor'} headed={role === 'center_manager'} />
                {role === 'center_manager' && <CenterSection centers={data.centers} navigate={navigate} headed />}
              </>
            ),
            platform: <PlatformSection navigate={navigate} />,
            security: <SecuritySection />,
            prefs: <PreferencesSection />,
          };
          return (
            <div className="na-set-shell">
              <div className="na-set-nav" role="tablist" aria-orientation="vertical" aria-label={S.title}>
                {tabs.map((id, i) => (
                  <button
                    key={id}
                    id={`set-tab-${id}`}
                    type="button"
                    role="tab"
                    className="na-set-tab"
                    aria-selected={tab === id}
                    aria-controls={`set-panel-${id}`}
                    tabIndex={tab === id ? 0 : -1}
                    onClick={() => select(id)}
                    onKeyDown={(e) => onKey(e, i)}
                  >
                    <AppIcon name={TAB_ICON[id]} size={20} className="na-icon" />
                    <span className="na-set-tab-text">
                      <span className="na-set-tab-title">{S.tabs[id].title}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="na-set-content">
                {tabs.map((id) => (
                  <section key={id} id={`set-panel-${id}`} role="tabpanel" aria-labelledby={`set-tab-${id}`} hidden={tab !== id} className="na-set-panel">
                    <header className="na-set-panel-h">
                      <h2 className="na-set-panel-title">{S.tabs[id].title}</h2>
                    </header>
                    {panels[id]}
                  </section>
                ))}
              </div>
            </div>
          );
        }}
      </Async>
    </>
  );
};
