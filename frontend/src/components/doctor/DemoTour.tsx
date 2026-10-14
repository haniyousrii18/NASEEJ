import React, { useState } from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt, safeStorage } from '../../lib/format.js';
import { Rise } from '../motion.js';
import { Dialog } from './Dialog.js';

const TOUR_KEY = 'naseej_doctor_tour_done';

/** First-run tour for the doctor role: three short steps, dismissible forever, Esc skips. */
export const DemoTour: React.FC = () => {
  const { t } = useLang();
  const T = t.doctor.tour;
  const [open, setOpen] = useState(() => safeStorage.get(TOUR_KEY) !== '1');
  const [step, setStep] = useState(0);
  const steps = [T.brief, T.approval, T.shortcuts];
  const last = step === steps.length - 1;

  const finish = () => {
    safeStorage.set(TOUR_KEY, '1');
    setOpen(false);
  };

  return (
    <Dialog open={open} onClose={finish} title={T.label} maxWidth={460} initialFocusId="doctor-tour-next">
      <Rise key={step}>
        <div style={{ fontSize: 12, color: 'var(--color-body-gray)', marginBottom: 6 }}>{fmt(T.stepOf, { i: step + 1, n: steps.length })}</div>
        <h3 className="text-card-heading" style={{ fontSize: 20, margin: '0 0 8px' }}>{steps[step].title}</h3>
        <p style={{ fontSize: 15, color: 'var(--color-body-gray)', marginBottom: 20 }}>{steps[step].body}</p>
      </Rise>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={finish}>
          {T.skip}
        </button>
        <button id="doctor-tour-next" type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? T.done : T.next}
        </button>
      </div>
    </Dialog>
  );
};
