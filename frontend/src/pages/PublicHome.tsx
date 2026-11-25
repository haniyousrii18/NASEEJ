import React from 'react';
import { useLang } from '../context/LangContext.js';
import { HeroVisual } from '../components/HeroVisual.js';
import { LetterReveal } from '../components/LetterReveal.js';
import { ArrowIcon, CheckIcon, LeafIcon, ShieldIcon } from '../components/LineIcon.js';
import { m } from 'motion/react';
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

/* one glyph per sharing control: reviewed summary, link that expires, revoke with an access log, read-only view */
const trustGlyph = (k: number) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {k === 0 && (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 14.5l2 2 4-4" />
      </>
    )}
    {k === 1 && (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
      </>
    )}
    {k === 2 && (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 8v4l3 2" />
      </>
    )}
    {k === 3 && (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

/* The four controls cascade in like app tiles: each one springs up from below the grid's edge, a beat after the one
   before, and its icon pops in as it lands. Plays once, when the grid scrolls into view. */
const tileVariants = {
  hidden: { opacity: 0, y: 110, scale: 0.9 },
  show: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.11, type: 'spring', stiffness: 260, damping: 19, mass: 0.9 } }),
};
const iconVariants = {
  hidden: { opacity: 0, scale: 0.3, rotate: -14 },
  show: (i: number) => ({ opacity: 1, scale: 1, rotate: 0, transition: { delay: 0.28 + i * 0.11, type: 'spring', stiffness: 420, damping: 14 } }),
};

const TrustTiles: React.FC<{ points: string[] }> = ({ points }) => (
  <m.ul className="trust-grid" initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -80px 0px' }}>
    {points.map((p, i) => (
      <m.li key={p} className="trust-tile" variants={tileVariants} custom={i}>
        <m.span className="trust-icon" variants={iconVariants} custom={i}>
          {trustGlyph(i)}
        </m.span>
        <p className="trust-text">{p}</p>
      </m.li>
    ))}
  </m.ul>
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
              <span className="hero-title-lead">{L.heroTitleLead}</span>{' '}
              <LetterReveal text={L.heroTitleAccent} className="hero-title-accent" delay={0.35} />
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
        {/* Open on the page: the case on one side, the four controls as a hairline grid of tiles on the other. */}
        <section className="l-section l-section--last" aria-labelledby="trust-title">
          <div className="l-container trust">
            <Reveal className="trust-copy">
              <span className="sec-tag">
                <ShieldIcon />
                {L.trustEyebrow}
              </span>
              <h2 id="trust-title" className="l-h2">
                {L.trustTitle}
              </h2>
              <p className="l-lead">{L.trustBody}</p>
              <button type="button" className="btn-pill btn-pill-ghost trust-link" onClick={() => setCurrentView('workflow')}>
                {t.nav.workflow}
                <ArrowIcon />
              </button>
            </Reveal>
            <TrustTiles points={trustPoints} />
          </div>
        </section>
      </div>
    </div>
  );
};
