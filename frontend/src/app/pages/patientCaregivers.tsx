import React, { useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate } from '../format.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';
import { ScopeList } from './caregiver.js';

interface Delegation {
  id: string;
  caregiver_email: string;
  caregiver_name_ar: string | null;
  caregiver_name_en: string | null;
  relationship: string | null;
  can_view_records: boolean;
  can_manage_appointments: boolean;
  can_send_messages: boolean;
  state: 'invited' | 'active' | 'expired' | 'declined' | 'revoked' | 'ended';
  invited_at: string;
  accepted_at: string | null;
  expires_at: string;
}

const STATE_TONE: Record<Delegation['state'], Tone> = { invited: 'warn', active: 'ok', expired: 'neutral', declined: 'neutral', revoked: 'danger', ended: 'neutral' };
const DURATIONS = [30, 90, 180, 365];

const History: React.FC<{ id: string }> = ({ id }) => {
  const A = useA();
  const P = A.care.patientCaregivers;
  const hist = useApiData<Array<{ action: string; actor_role: string; created_at: string; area: string | null }>>(`/api/portal/caregivers/${id}/history`);
  return (
    <Async state={hist.state} onRetry={hist.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{P.historyEmpty}</p>}>
      {(rows) => (
        <ul className="na-list">
          {rows.map((r, i) => (
            <li key={`${r.created_at}-${i}`} className="na-list-item">
              <span>
                {(P.actions as Record<string, string>)[r.action] ?? r.action}
                {r.area ? ` · ${(P.areas as Record<string, string>)[r.area] ?? r.area}` : ''}
              </span>
              <span className="na-muted">{formatDate(A.lang, r.created_at, true)}</span>
            </li>
          ))}
        </ul>
      )}
    </Async>
  );
};

export const PatientCaregivers: React.FC = () => {
  const A = useA();
  const P = A.care.patientCaregivers;
  const list = useApiData<Delegation[]>('/api/portal/caregivers');
  const invite = useMutation();
  const revoke = useMutation();
  const [form, setForm] = useState({ email: '', relationship: '', view: true, appointments: false, messages: false, days: 90 });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) return setMsg({ tone: 'danger', text: P.emailRequired });
    if (!form.view && !form.appointments && !form.messages) return setMsg({ tone: 'danger', text: P.atLeastOne });
    const res = await invite.run('/api/portal/caregivers', 'POST', {
      email: form.email.trim(),
      relationship: form.relationship.trim() || undefined,
      can_view_records: form.view,
      can_manage_appointments: form.appointments,
      can_send_messages: form.messages,
      expires_in_days: form.days,
    });
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.status === 409 ? P.exists : res.error.message });
    setMsg({ tone: 'ok', text: P.sent });
    setForm({ ...form, email: '', relationship: '' });
    list.reload();
  };

  const doRevoke = async (id: string) => {
    if (!window.confirm(P.revokeConfirm)) return;
    const res = await revoke.run(`/api/portal/caregivers/${id}/revoke`, 'POST');
    setMsg(res.ok ? { tone: 'ok', text: P.revoked } : { tone: 'danger', text: res.error.message });
    list.reload();
  };

  const check = (key: 'view' | 'appointments' | 'messages', label: string, help: string) => (
    <label className="cg-check" key={key}>
      <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
      <span>
        <strong>{label}</strong>
        <span className="na-help">{help}</span>
      </span>
    </label>
  );

  return (
    <>
      <PageHead title={P.title} subtitle={P.subtitle} />
      <div className="na-stack">
        <Notice tone="info" icon="shield">
          {P.principle}
        </Notice>
        {msg && (
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        )}
        <div className="na-grid na-grid--2">
          <Card title={P.inviteTitle}>
            <form className="na-form na-form--stack" onSubmit={submit} noValidate>
              <Field label={P.email} htmlFor="cg-email" help={P.emailHelp}>
                <input id="cg-email" type="email" dir="ltr" className="na-input" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label={P.relationship} htmlFor="cg-rel" help={P.relationshipHelp}>
                <input id="cg-rel" className="na-input" maxLength={60} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
              </Field>
              <fieldset className="na-fieldset">
                <legend className="na-label">{P.permissions}</legend>
                {check('view', P.permView, P.permViewHelp)}
                {check('appointments', P.permAppointments, P.permAppointmentsHelp)}
                {check('messages', P.permMessages, P.permMessagesHelp)}
              </fieldset>
              <Field label={P.duration} htmlFor="cg-days">
                <select id="cg-days" className="na-select" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}>
                  {DURATIONS.map((n) => (
                    <option key={n} value={n}>
                      {fill(P.days, { n })}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="na-form-actions">
                <Button type="submit" variant="primary" icon="plus" disabled={invite.pending}>
                  {P.send}
                </Button>
              </div>
            </form>
          </Card>

          <Card title={P.list}>
            <Async state={list.state} onRetry={list.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={P.emptyTitle} body={P.emptyBody} />}>
              {(rows) => (
                <ul className="na-list">
                  {rows.map((d) => {
                    const open = d.state === 'invited' || d.state === 'active';
                    const name = [A.lang === 'ar' ? d.caregiver_name_ar : d.caregiver_name_en, d.caregiver_name_ar || d.caregiver_name_en ? '' : d.caregiver_email].filter(Boolean).join('');
                    return (
                      <li key={d.id} className="na-list-item cg-card">
                        <div className="na-row na-row--between">
                          <strong dir="auto">{name || d.caregiver_email}</strong>
                          <Pill tone={STATE_TONE[d.state]}>{A.care.states[d.state]}</Pill>
                        </div>
                        <span className="na-muted na-ltr">{d.caregiver_email}</span>
                        {d.relationship && <span className="na-muted">{d.relationship}</span>}
                        <ScopeList d={d} />
                        <span className="na-muted">
                          {[fill(P.invitedAt, { date: formatDate(A.lang, d.invited_at) }), d.accepted_at ? fill(P.acceptedAt, { date: formatDate(A.lang, d.accepted_at) }) : '', fill(P.expires, { date: formatDate(A.lang, d.expires_at) })]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <div className="na-row">
                          {open && (
                            <Button small variant="danger" disabled={revoke.pending} onClick={() => doRevoke(d.id)}>
                              {P.revoke}
                            </Button>
                          )}
                          <Button small variant="quiet" aria-expanded={openHistory === d.id} onClick={() => setOpenHistory(openHistory === d.id ? null : d.id)}>
                            {openHistory === d.id ? P.hideHistory : P.history}
                          </Button>
                        </div>
                        {openHistory === d.id && <History id={d.id} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Async>
          </Card>
        </div>
      </div>
    </>
  );
};
