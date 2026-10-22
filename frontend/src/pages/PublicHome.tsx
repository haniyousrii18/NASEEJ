import React from 'react';
import { useLang } from '../context/LangContext.js';
import { HeroVisual } from '../components/HeroVisual.js';
import { ArrowIcon, CheckIcon, LeafIcon } from '../components/LineIcon.js';
import { DrawLine, Pop, Reveal } from '../components/motion.js';

interface Props {
  setCurrentView: (view: string) => void;
}

/** Workflow titles carry their own "1." / "١." numbering; the step badge shows the number instead. */
const stripNumber = (s: string) => s.replace(/^[\d٠-٩]+[.)\s]+/, '').trim();

/**
 * Landing page. Narrative: hero, why Naseej, how it works, who it serves, privacy and trust,
 * final call to action. Every statement comes from existing product copy; nothing here is a
 * metric, award, testimonial or capability that the product does not have.
 */
export const PublicHome: React.FC<Props> = ({ setCurrentView }) => {
  const { t, lang } = useLang();
  const L = t.landing;
  const steps = [t.workflow.step1_title, t.workflow.step2_title, t.workflow.step3_title, t.workflow.step4_title, t.workflow.step5_title].map(stripNumber);
  const stepDescs = [t.workflow.step1_desc, t.workflow.step2_desc, t.workflow.step3_desc, t.workflow.step4_desc, t.workflow.step5_desc];
  const values = [
    { title: L.v1_title, desc: L.v1_desc },
    { title: L.v2_title, desc: L.v2_desc },
    { title: L.v3_title, desc: L.v3_desc },
  ];
  const trustPoints = [L.t1, L.t2, L.t3, L.t4];
  const num = (i: number) => (i + 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB');

  return (
    <div className="landing">
      {/* ------------------------------------------------------------ hero: full width, image behind, text on one side */}
      <section className="hero" aria-labelledby="hero-title">
        <HeroVisual />
        <div className="l-container hero-inner">
          <div className="hero-copy motion-stagger">
            <span className="hero-pill">
              <LeafIcon />
              {t.brand.tagline}
            </span>
            <h1 id="hero-title" className="hero-title">
              {t.hero.title}
            </h1>
            <p className="hero-lead">{t.hero.description}</p>
            <div className="hero-actions">
              <button type="button" className="btn-pill btn-pill-charcoal hero-cta" onClick={() => setCurrentView('login')}>
                {t.hero.ctaLogin}
                <ArrowIcon />
              </button>
              <button type="button" className="btn-pill btn-pill-ghost hero-cta" onClick={() => setCurrentView('workflow')}>
                {t.nav.workflow}
              </button>
            </div>
          </div>
        </div>
        <div className="l-container hero-foot">
          <ul className="hero-points">
            {[t.hero.statsSafety, t.hero.statsIsolation, t.hero.statsBilingual, t.hero.statsCenters].map((p) => (
              <li key={p}>
                <CheckIcon />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="landing-body">
        {/* ---------------------------------------------------------- why Naseej: three values on one thread */}
        <section className="l-section" aria-labelledby="value-title">
          <div className="l-container l-split">
            <Reveal className="l-head l-head--sticky">
              <h2 id="value-title" className="l-h2">
                {L.valueTitle}
              </h2>
              <p className="l-lead">{L.valueLead}</p>
            </Reveal>
            <ol className="l-thread">
              <DrawLine axis="y" className="l-thread-line" />
              {values.map((v, i) => (
                <Reveal as="li" key={v.title} i={i} className="l-thread-item">
                  <Pop className="l-node num" i={i}>
                    {num(i)}
                  </Pop>
                  <div className="l-thread-text">
                    <h3 className="l-card-title">{v.title}</h3>
                    <p className="l-card-text">{v.desc}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------- how it works: five steps on one thread */}
        <section className="l-section l-section--tint" aria-labelledby="steps-title">
          <div className="l-container">
            <Reveal className="l-head">
              <h2 id="steps-title" className="l-h2">
                {t.workflow.title}
              </h2>
            </Reveal>
            <ol className="l-steps">
              <DrawLine axis="y" className="l-thread-line" />
              <DrawLine axis="x" className="l-steps-line" />
              {steps.map((title, i) => (
                <Reveal as="li" key={title} i={i} className="l-step">
                  <Pop className="l-node num" i={i}>
                    {num(i)}
                  </Pop>
                  <div className="l-thread-text">
                    <h3 className="l-card-title">{title}</h3>
                    <p className="l-card-text">{stepDescs[i]}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------- privacy and trust */}
        <section className="l-section" aria-labelledby="trust-title">
          <div className="l-container">
            <Reveal className="l-trust">
              <div className="l-trust-copy">
                <h2 id="trust-title" className="l-h2 l-h2--inverse">
                  {L.trustTitle}
                </h2>
                <p className="l-lead l-lead--inverse">{L.trustBody}</p>
                <button type="button" className="btn-pill btn-pill-cloud l-trust-link" onClick={() => setCurrentView('workflow')}>
                  {t.nav.workflow}
                  <ArrowIcon />
                </button>
              </div>
              <ul className="l-trust-list">
                {trustPoints.map((p, i) => (
                  <Reveal as="li" key={p} i={i}>
                    <Pop className="l-check" i={i}>
                      <CheckIcon />
                    </Pop>
                    <span>{p}</span>
                  </Reveal>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- final call to action */}
        <section className="l-section l-section--last" aria-labelledby="cta-title">
          <div className="l-container">
            <Reveal className="l-cta">
              <h2 id="cta-title" className="l-h2">
                {L.ctaTitle}
              </h2>
              <p className="l-lead">{L.ctaBody}</p>
              <button type="button" className="btn-pill btn-pill-charcoal hero-cta" onClick={() => setCurrentView('login')}>
                {t.hero.ctaLogin}
                <ArrowIcon />
              </button>
            </Reveal>
          </div>
        </section>
      </div>
    </div>
  );
};
