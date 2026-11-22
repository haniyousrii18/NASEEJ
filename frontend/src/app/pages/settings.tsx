import React, { useCallback, useEffect, useRef, useState } from 'react';
import { validationMessage } from '../errors.js';
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
import { useMsg, type Msg } from '../useMsg.js';

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
  nameChangedAt: string | null;
  /** When the name may next be changed; null when it may be changed now. */
  nameLockedUntil: string | null;
  nameLockDays: number;
  centers: Center[];
  patient: { phone: string; email: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null } | null;
}

type Flash = { tone: 'ok' | 'danger'; text: Msg } | null;

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

/* ------------------------------------------------------------------ Account: name (once every N days) and sign-in email */
const ARABIC = /[ء-ي]/;
const LATIN = /[A-Za-z]/;
const NAME_CHARS = /^[\p{L}\p{M}\s'’.-]+$/u;
const nameOk = (v: string, script: 'ar' | 'en') => {
  const t = v.trim();
  if (t.length < 2 || !NAME_CHARS.test(t)) return false;
  return script === 'ar' ? ARABIC.test(t) && !LATIN.test(t) : LATIN.test(t) && !ARABIC.test(t);
};

type Side = 'ar' | 'en';

const AccountSection: React.FC<{ data: AccountData; onSaved: () => void }> = ({ data, onSaved }) => {
  const A = useA();
  const S = A.settings;
  const say = useMsg();
  const { updateUser } = useAuth();
  const save = useMutation();
  const preview = useMutation();
  const initial = { ar: data.fullNameAr, en: data.fullNameEn };
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  // The side written from the other one, and the sides the person typed in themself (never overwritten).
  const [auto, setAuto] = useState<Side | null>(null);
  const typed = useRef<Set<Side>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [errors, setErrors] = useState<Partial<Record<Side, Msg>>>({});
  const timer = useRef<number | undefined>(undefined);

  const dirty = editing && (form.ar.trim() !== data.fullNameAr || form.en.trim() !== data.fullNameEn);
  useUnsavedGuard(dirty, S.leave);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const locked = data.nameLockedUntil;
  const nextAllowed = new Date(Date.now() + data.nameLockDays * 24 * 60 * 60 * 1000);

  const reset = () => {
    window.clearTimeout(timer.current);
    setForm(initial);
    setAuto(null);
    typed.current = new Set();
    setErrors({});
    setEditing(false);
  };

  const onType = (side: Side, value: string) => {
    typed.current.add(side);
    if (auto === side) setAuto(null);
    setForm((f) => ({ ...f, [side]: value }));
    setErrors((e) => ({ ...e, [side]: undefined }));
    const other: Side = side === 'ar' ? 'en' : 'ar';
    if (typed.current.has(other)) return;
    // Write the other script from this one shortly after typing stops.
    window.clearTimeout(timer.current);
    if (!nameOk(value, side)) return;
    timer.current = window.setTimeout(async () => {
      const res = await preview.run<{ ar: string; en: string }>('/api/account/name-preview', 'POST', { name: value.trim() });
      if (!res.ok || typed.current.has(other)) return;
      setForm((f) => (f[side].trim() === value.trim() ? { ...f, [other]: res.data[other] } : f));
      setAuto(other);
    }, 350);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Side, Msg>> = {};
    if (!nameOk(form.ar, 'ar')) next.ar = (X) => X.settings.account.invalidNameAr;
    if (!nameOk(form.en, 'en')) next.en = (X) => X.settings.account.invalidNameEn;
    setErrors(next);
    setFlash(null);
    if (Object.keys(next).length === 0) setConfirming(true);
  };

  const commit = async () => {
    const res = await save.run<{ fullNameAr: string; fullNameEn: string }>('/api/account/profile', 'PATCH', {
      fullNameAr: form.ar.trim(),
      fullNameEn: form.en.trim(),
    });
    setConfirming(false);
    if (res.ok) {
      updateUser({ fullNameAr: res.data.fullNameAr, fullNameEn: res.data.fullNameEn });
      setFlash({ tone: 'ok', text: (X) => X.settings.account.nameSaved });
      reset();
      onSaved();
    } else {
      const field = res.error.details?.field as string | undefined;
      const msg: Msg = (X) => validationMessage(X, res.error);
      // A lock is about the whole name, not one field: it is shown once, below the form.
      if (res.error.code !== 'NAME_CHANGE_LOCKED' && (field === 'fullNameAr' || field === 'fullNameEn')) setErrors({ [field === 'fullNameAr' ? 'ar' : 'en']: msg });
      setFlash({ tone: 'danger', text: (X) => validationMessage(X, res.error) });
    }
  };

  const help = (side: Side) => (auto === side ? (preview.pending ? S.account.writing : side === 'en' ? S.account.autoFromAr : S.account.autoFromEn) : undefined);

  if (!editing) {
    return (
      <Block>
        <dl className="na-dl">
          <ReadRow label={S.account.nameAr}>{data.fullNameAr}</ReadRow>
          <ReadRow label={S.account.nameEn} ltr>{data.fullNameEn}</ReadRow>
          <ReadRow label={S.account.email} ltr>{data.email}</ReadRow>
        </dl>
        {flash && <Notice tone={flash.tone} live>{say(flash.text)}</Notice>}
        {locked ? (
          <Notice icon="clock">
            {fill(S.account.nameLocked, { changed: formatDate(A.lang, data.nameChangedAt), date: formatDate(A.lang, locked) })}
          </Notice>
        ) : (
          <div className="na-set-actions">
            <Button small icon="user" onClick={() => { setFlash(null); setEditing(true); }}>
              {S.account.editName}
            </Button>
            <span className="na-muted">{fill(S.account.nameRule, { days: data.nameLockDays })}</span>
          </div>
        )}
      </Block>
    );
  }

  return (
    <Block>
      <form onSubmit={submit} noValidate className="na-set-form">
        <div className="na-grid na-grid--2">
          <Field label={S.account.nameAr} htmlFor="set-name-ar" help={help('ar')} error={errors.ar ? say(errors.ar) : undefined}>
            <input id="set-name-ar" className="na-input" lang="ar" dir="rtl" maxLength={120} autoComplete="name" value={form.ar} onChange={(e) => onType('ar', e.target.value)} />
          </Field>
          <Field label={S.account.nameEn} htmlFor="set-name-en" help={help('en')} error={errors.en ? say(errors.en) : undefined}>
            <input id="set-name-en" className="na-input" lang="en" dir="ltr" maxLength={120} value={form.en} onChange={(e) => onType('en', e.target.value)} />
          </Field>
        </div>
        <Notice icon="clock">{fill(S.account.nameRule, { days: data.nameLockDays })}</Notice>
        {flash && <Notice tone={flash.tone} live>{say(flash.text)}</Notice>}
        <div className="na-set-actions">
          <Button type="submit" variant="primary" disabled={!dirty || save.pending}>
            {save.pending ? S.actions.saving : S.actions.save}
          </Button>
          <Button variant="quiet" onClick={reset}>
            {S.account.cancel}
          </Button>
        </div>
      </form>
      {confirming && (
        <Dialog title={S.account.confirmTitle} onClose={() => setConfirming(false)}>
          <p>{S.account.confirmIntro}</p>
          <dl className="na-dl na-set-confirm-names">
            <ReadRow label={S.account.nameAr}>{form.ar.trim()}</ReadRow>
            <ReadRow label={S.account.nameEn} ltr>{form.en.trim()}</ReadRow>
          </dl>
          <p>{fill(S.account.confirmLock, { date: formatDate(A.lang, nextAllowed) })}</p>
          <div className="na-form-actions">
            <Button variant="primary" onClick={commit} disabled={save.pending}>
              {save.pending ? S.actions.saving : S.account.confirmSave}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              {S.account.cancel}
            </Button>
          </div>
        </Dialog>
      )}
    </Block>
  );
};

/* ------------------------------------------------------------------ Patient contact and emergency details */
const PatientContactSection: React.FC<{ data: AccountData; onSaved: () => void }> = ({ data, onSaved }) => {
  const A = useA();
  const S = A.settings;
  const say = useMsg();
  const save = useMutation();
  const p = data.patient!;
  const initial = { phone: p.phone ?? '', email: p.email ?? '', ecName: p.emergency_contact_name ?? '', ecPhone: p.emergency_contact_phone ?? '' };
  const [form, setForm] = useState(initial);
  const [flash, setFlash] = useState<Flash>(null);
  const [errors, setErrors] = useState<Record<string, Msg>>({});
  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some((k) => form[k] !== initial[k]);
  useUnsavedGuard(dirty, S.leave);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, Msg> = {};
    if (!PHONE_RE.test(form.phone.trim())) next.phone = (X) => X.settings.account.invalidPhone;
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = (X) => X.settings.contact.invalidEmail;
    if (form.ecPhone.trim() && !PHONE_RE.test(form.ecPhone.trim())) next.ecPhone = (X) => X.settings.account.invalidPhone;
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
      setFlash({ tone: 'ok', text: (X) => X.settings.contact.saved });
      onSaved();
    } else {
      setFlash({ tone: 'danger', text: (X) => validationMessage(X, res.error) });
    }
  };

  return (
    <Block>
      <form onSubmit={submit} noValidate className="na-set-form">
        <div className="na-grid na-grid--2">
          <Field label={S.contact.phone} htmlFor="set-pc-phone">
            <input id="set-pc-phone" type="tel" className="na-input" dir="ltr" autoComplete="tel" maxLength={20} value={form.phone} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'set-pc-phone-err' : undefined} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {errors.phone && <p id="set-pc-phone-err" className="na-set-error">{say(errors.phone)}</p>}
          </Field>
          <Field label={S.contact.email} htmlFor="set-pc-email">
            <input id="set-pc-email" type="email" className="na-input" dir="ltr" autoComplete="email" maxLength={255} value={form.email} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'set-pc-email-err' : undefined} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <p id="set-pc-email-err" className="na-set-error">{say(errors.email)}</p>}
          </Field>
          <Field label={S.contact.emergencyName} htmlFor="set-pc-ecn">
            <input id="set-pc-ecn" className="na-input" maxLength={255} value={form.ecName} onChange={(e) => setForm({ ...form, ecName: e.target.value })} />
          </Field>
          <Field label={S.contact.emergencyPhone} htmlFor="set-pc-ecp">
            <input id="set-pc-ecp" type="tel" className="na-input" dir="ltr" maxLength={20} value={form.ecPhone} aria-invalid={!!errors.ecPhone} aria-describedby={errors.ecPhone ? 'set-pc-ecp-err' : undefined} onChange={(e) => setForm({ ...form, ecPhone: e.target.value })} />
            {errors.ecPhone && <p id="set-pc-ecp-err" className="na-set-error">{say(errors.ecPhone)}</p>}
          </Field>
        </div>
        {flash && <Notice tone={flash.tone} live>{say(flash.text)}</Notice>}
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
              <Button key={t} small variant={workspace.preference === t ? 'primary' : undefined} aria-pressed={workspace.preference === t} onClick={() => workspace.setPreference(t)}>
                {workspace.preference === t ? '✓ ' : ''}{S[t]}
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
  const say = useMsg();
  const { logout } = useAuth();
  const change = useMutation();
  const empty = { current: '', next: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [flash, setFlash] = useState<Flash>(null);
  const [errors, setErrors] = useState<Record<string, Msg>>({});
  const dirty = form.current !== '' || form.next !== '' || form.confirm !== '';
  useUnsavedGuard(dirty, S.leave);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, Msg> = {};
    if (!form.current) next.current = (X) => X.settings.security.wrongCurrent;
    if (form.next.length < 8 || !/[A-Za-z؀-ۿ]/.test(form.next) || !/[0-9]/.test(form.next)) next.next = (X) => X.settings.security.rule;
    else if (form.next !== form.confirm) next.confirm = (X) => X.settings.security.mismatch;
    setErrors(next);
    setFlash(null);
    if (Object.keys(next).length) return;
    const res = await change.run('/api/account/password', 'POST', { currentPassword: form.current, newPassword: form.next });
    if (res.ok) {
      setForm(empty);
      setFlash({ tone: 'ok', text: (X) => X.settings.security.changed });
    } else if (res.error.code === 'CURRENT_PASSWORD_INCORRECT') {
      setErrors({ current: (X) => X.settings.security.wrongCurrent });
    } else {
      setFlash({ tone: 'danger', text: (X) => validationMessage(X, res.error) });
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
      {errors[id] && <p id={`set-pw-${id}-err`} className="na-set-error">{say(errors[id])}</p>}
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
        {flash && <Notice tone={flash.tone} live>{say(flash.text)}</Notice>}
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
type TabId = 'profile' | 'contact' | 'privacy' | 'security' | 'prefs';

const TAB_ICON: Record<TabId, IconName> = { profile: 'user', contact: 'message', privacy: 'lock', security: 'shield', prefs: 'globe' };

/** Which tabs each role has, in display order. A tab exists only when it holds working controls. */
const TABS_BY_ROLE: Record<AppRole, TabId[]> = {
  patient: ['profile', 'contact', 'privacy', 'security', 'prefs'],
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
            privacy: <PrivacySection navigate={navigate} />,
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
