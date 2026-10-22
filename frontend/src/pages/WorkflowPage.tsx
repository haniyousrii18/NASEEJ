import React from 'react';
import { ArrowIcon } from '../components/LineIcon.js';
import { DrawLine, Pop, Reveal } from '../components/motion.js';
import { useLang } from '../context/LangContext.js';

interface Props {
  setCurrentView: (view: string) => void;
}

/** Step titles carry their own "1." / "١." numbering; the node shows the number instead. */
const stripNumber = (s: string) => s.replace(/^[\d٠-٩]+[.)\s]+/, '').trim();

/**
 * The journey page: the five steps of the product on one thread, in the same language as the home page
 * (a sticky heading beside a thread that draws itself, with numbered nodes). Every line comes from existing copy.
 */
export const WorkflowPage: React.FC<Props> = ({ setCurrentView }) => {
  const { t, lang, isRtl } = useLang();
  const W = t.workflow;

  const steps = [
    { title: W.step1_title, desc: W.step1_desc },
    { title: W.step2_title, desc: W.step2_desc },
    { title: W.step3_title, desc: W.step3_desc },
    { title: W.step4_title, desc: W.step4_desc },
    { title: W.step5_title, desc: W.step5_desc },
  ];
  const num = (i: number) => (i + 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB');

  return (
    <div className="landing wf">
      <section className="l-section wf-section" aria-labelledby="wf-title">
        <div className="l-container l-split">
          <Reveal className="l-head l-head--sticky">
            <h1 id="wf-title" className="wf-title">
              {W.title}
            </h1>
            <p className="l-lead">
              {isRtl
                ? 'خمس خطوات تُبقي القرار بيدك في كل مرحلة: ما تسجّله، وما تعتمده، وما تشاركه.'
                : 'Five steps that keep the decision in your hands at every stage: what you record, what you approve, and what you share.'}
            </p>
            <button type="button" className="btn-pill btn-pill-charcoal hero-cta wf-cta" onClick={() => setCurrentView('login')}>
              {t.hero.ctaLogin}
              <ArrowIcon />
            </button>
          </Reveal>

          <ol className="l-thread wf-thread">
            <DrawLine axis="y" className="l-thread-line" />
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} i={i} className="l-thread-item">
                <Pop className="l-node num" i={i}>
                  {num(i)}
                </Pop>
                <div className="l-thread-text">
                  <h2 className="l-card-title">{stripNumber(s.title)}</h2>
                  <p className="l-card-text">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
};
