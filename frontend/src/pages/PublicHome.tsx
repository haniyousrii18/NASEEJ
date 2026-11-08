import React from 'react';
import { useLang } from '../context/LangContext.js';
import { HeroVisual } from '../components/HeroVisual.js';
import { ArrowIcon, CheckIcon, LeafIcon } from '../components/LineIcon.js';
import { DrawLine, Pop, Reveal } from '../components/motion.js';

interface Props {
  setCurrentView: (view: string) => void;
}

const humanGlyph = (k: number) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {k === 0 && (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M8 3v4M16 3v4" />
      </>
    )}
    {k === 1 && (
      <>
        <rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)" />
        <path d="M9.5 8.5l6 6" />
      </>
    )}
    {k === 2 && <path d="M3 12h4l2-6 4 12 2-6h6" />}
    {k === 3 && <path d="M4 5h16v11H9l-5 4z" />}
  </svg>
);

/**
 * Landing page. Narrative: hero (ownership), the human context of a visit, how it works in four steps, control and
 * privacy, closing call to action. Every statement describes something the product does today; nothing here is a
 * metric, award, testimonial or capability that the product does not have.
 */
export const PublicHome: React.FC<Props> = ({ setCurrentView }) => {
  const { t, lang } = useLang();
  const L = t.landing;
  const steps = [
    { title: L.s1_title, desc: L.s1_desc },
    { title: L.s2_title, desc: L.s2_desc },
    { title: L.s3_title, desc: L.s3_desc },
    { title: L.s4_title, desc: L.s4_desc },
  ];
  const human = [
    { title: L.h1_title, desc: L.h1_desc },
    { title: L.h2_title, desc: L.h2_desc },
    { title: L.h3_title, desc: L.h3_desc },
    { title: L.h4_title, desc: L.h4_desc },
  ];
  const trustPoints = [L.c1, L.c2, L.c3, L.c4];
  const num = (i: number) => (i + 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB');
  const toHow = () => {
    const el = document.getElementById('steps-title');
    if (!el) return setCurrentView('workflow');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

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
              <button type="button" className="btn-pill btn-pill-ghost hero-cta" onClick={toHow}>
                {t.hero.ctaHow}
              </button>
            </div>
          </div>
        </div>
        <div className="l-container hero-foot">
          <ul className="hero-points">
            {[t.hero.statsCenters, t.hero.statsIsolation, t.hero.statsSafety, t.hero.statsBilingual].map((p) => (
              <li key={p}>
                <CheckIcon />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="landing-body">
        {/* ---------------------------------------------------------- the human context: what is hard to hold in mind at a visit */}
        <section className="l-section" aria-labelledby="human-title">
          <div className="l-container l-split">
            <Reveal className="l-head l-head--sticky">
              <h2 id="human-title" className="l-h2">
                {L.humanTitle}
              </h2>
              <p className="l-lead">{L.humanLead}</p>
              <p className="l-note">{L.humanNote}</p>
            </Reveal>
            <ul className="l-thread">
              <DrawLine axis="y" className="l-thread-line" />
              {human.map((v, i) => (
                <Reveal as="li" key={v.title} i={i} className="l-thread-item">
                  <Pop className="l-node" i={i}>
                    {humanGlyph(i)}
                  </Pop>
                  <div className="l-thread-text">
                    <h3 className="l-card-title">{v.title}</h3>
                    <p className="l-card-text">{v.desc}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- how it works: four steps on one thread */}
        <section className="l-section l-section--tint" aria-labelledby="steps-title">
          <div className="l-container">
            <Reveal className="l-head">
              <h2 id="steps-title" className="l-h2" tabIndex={-1}>
                {L.stepsTitle}
              </h2>
              <p className="l-lead">{L.stepsLead}</p>
            </Reveal>
            <ol className="l-steps l-steps--4">
              <DrawLine axis="y" className="l-thread-line" />
              <DrawLine axis="x" className="l-steps-line" />
              {steps.map((st, i) => (
                <Reveal as="li" key={st.title} i={i} className="l-step">
                  <Pop className="l-node num" i={i}>
                    {num(i)}
                  </Pop>
                  <div className="l-thread-text">
                    <h3 className="l-card-title">{st.title}</h3>
                    <p className="l-card-text">{st.desc}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
            <Reveal className="l-steps-more">
              <button type="button" className="btn-pill btn-pill-ghost" onClick={() => setCurrentView('workflow')}>
                {L.stepsFull}
                <ArrowIcon />
              </button>
            </Reveal>
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
