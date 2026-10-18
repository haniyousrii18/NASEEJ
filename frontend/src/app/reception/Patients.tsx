import React, { useEffect, useState } from 'react';
import { useApiData } from '../api.js';
import { formatDate, nameOf } from '../format.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead } from '../ui.js';
import { useA } from '../useA.js';
import { PatientDrawer } from './PatientDrawer.js';
import type { PatientRow } from './patientTypes.js';
import { RegisterDrawer } from './RegisterDrawer.js';
import { fill } from '../format.js';

/** Administrative patient search and registration: identity and contact details only. */
export const Patients: React.FC<{ navigate: (r: string) => void; openId?: string }> = ({ navigate, openId }) => {
  const A = useA();
  const P = A.reception.patients;
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<string | null>(openId ?? null);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState<{ patientId: string; text: string } | null>(null);
  const { state, reload } = useApiData<PatientRow[]>(`/api/patients?search=${encodeURIComponent(term)}`);

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(id);
  }, [text]);
  useEffect(() => {
    if (openId) setSelected(openId);
  }, [openId]);

  const book = (patientId: string) => navigate(`reception/book?patient=${patientId}`);

  return (
    <>
      <PageHead
        title={P.title}
        subtitle={P.subtitle}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setRegistering(true)}>
            {P.register}
          </Button>
        }
      />
      <div className="na-stack">
        {registered && (
          <Notice tone="ok" live>
            <div className="na-stack">
              <span>{registered.text}</span>
              <div>
                <Button small variant="primary" onClick={() => book(registered.patientId)}>
                  {P.bookFor}
                </Button>
              </div>
            </div>
          </Notice>
        )}
        <Card>
          <Field label={P.search} htmlFor="rp-search">
            <input id="rp-search" type="search" className="na-input" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </Card>
        <Card>
          <Async
            state={state}
            onRetry={reload}
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                title={P.empty}
                action={
                  <Button small icon="plus" onClick={() => setRegistering(true)}>
                    {P.register}
                  </Button>
                }
              />
            }
          >
            {(rows) => (
              <div className="na-table-wrap">
                <table className="na-table">
                  <thead>
                    <tr>
                      <th>{A.reception.book.patient}</th>
                      <th>{P.mrn}</th>
                      <th>{P.nationalId}</th>
                      <th>{P.phone}</th>
                      <th>{P.dob}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button type="button" className="na-link" onClick={() => setSelected(p.id)}>
                            {nameOf(A.lang, p)}
                          </button>
                        </td>
                        <td className="na-ltr">{p.mrn}</td>
                        <td className="na-ltr">{p.national_id}</td>
                        <td className="na-ltr">{p.phone}</td>
                        <td>{formatDate(A.lang, p.date_of_birth)}</td>
                        <td>
                          <Button small onClick={() => book(p.id)}>
                            {P.bookFor}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>
      </div>

      {selected && (
        <PatientDrawer
          key={selected}
          patientId={selected}
          onClose={() => {
            setSelected(null);
            if (openId) navigate('reception/patients');
          }}
          onChanged={reload}
          onBook={book}
        />
      )}
      {registering && (
        <RegisterDrawer
          onClose={() => setRegistering(false)}
          onOpenExisting={(id) => {
            setRegistering(false);
            setSelected(id);
          }}
          onRegistered={(result, name) => {
            setRegistering(false);
            setRegistered({ patientId: result.patientId, text: fill(P.registeredNext, { name, mrn: result.mrn }) });
            reload();
          }}
        />
      )}
    </>
  );
};
