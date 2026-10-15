import React from 'react';
import { useLang } from '../context/LangContext.js';
import { HeroVisual } from '../components/HeroVisual.js';
import { LandingBackdrop } from '../components/LandingBackdrop.js';
import { ArrowIcon, CheckIcon, LeafIcon, LockIcon } from '../components/LineIcon.js';
import { Reveal } from '../components/motion.js';

interface Props {
  setCurrentView: (view: string) => void;
}

const ROLE_KEYS = ['platform_admin', 'center_manager', 'doctor', 'reception', 'patient'] as const;

/** Workflow titles carry their own "1." / "١." numbering; the step badge shows the number instead. */
const stripNumber = (s: string) => s.replace(/^[\d٠-٩]+[.)\s]+/, '').trim();

const SectionHead: React.FC<{ eyebrow: string; title: string; lead?: string }> = ({ eyebrow, title, lead }) => (
  <div className="l-head">
    <span className="l-eyebrow">
      <LeafIcon />
      {eyebrow}
    </span>
    <h2 className="l-h2">{title}</h2>
    {lead && <p className="l-lead">{lead}</p>}
  </div>
);

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
    { title: t.features.f1_title, desc: t.features.f1_desc },
    { title: t.features.f2_title, desc: t.features.f2_desc },
    { title: t.features.f5_title, desc: t.features.f5_desc },
  ];
  const trustPoints = [t.features.f1_title, t.features.f2_title, t.features.f4_title, t.features.f5_title];

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
              <button type="button" className="btn-pill btn-pill-charcoal hero-cta" onClick={() => setCurrentView('demo')}>
                {t.hero.ctaDemo}
                <ArrowIcon />
              </button>
              <button type="button" className="btn-pill btn-pill-ghost hero-cta" onClick={() => setCurrentView('login')}>
                {t.hero.ctaLogin}
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
        <LandingBackdrop />

      {/* ------------------------------------------------------------ why Naseej */}
      <Reveal as="section" className="l-section" aria-labelledby="value-title">
        <div className="l-container">
          <SectionHead eyebrow={L.valueEyebrow} title={L.valueTitle} lead={L.valueLead} />
          <div className="l-grid l-grid--3">
            {values.map((v, i) => (
              <Reveal key={v.title} i={i} className="cloud-feature-card l-card">
                <span className="l-card-index num" aria-hidden="true">{(i + 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</span>
                <h3 className="l-card-title">{v.title}</h3>
                <p className="l-card-text">{v.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ------------------------------------------------------------ how it works */}
      <Reveal as="section" className="l-section l-section--tint" aria-labelledby="steps-title">
        <div className="l-container">
          <SectionHead eyebrow={t.workflow.eyebrow} title={t.workflow.title} />
          <ol className="l-steps">
            {steps.map((title, i) => (
              <Reveal as="li" key={title} i={i} className="l-step">
                <span className="l-step-badge num" aria-hidden="true">{(i + 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</span>
                <h3 className="l-card-title">{title}</h3>
                <p className="l-card-text">{stepDescs[i]}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </Reveal>

      {/* ------------------------------------------------------------ roles */}
      <Reveal as="section" className="l-section" aria-labelledby="roles-title">
        <div className="l-container">
          <SectionHead eyebrow={L.rolesEyebrow} title={L.rolesTitle} />
          <div className="l-grid l-grid--roles">
            {ROLE_KEYS.map((key, i) => (
              <Reveal key={key} i={i} className="cloud-feature-card l-card l-role">
                <h3 className="l-card-title">{t.roles[key]}</h3>
                <p className="l-card-text">{L[`role_${key}` as const]}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ------------------------------------------------------------ privacy and trust */}
      <Reveal as="section" className="l-section" aria-labelledby="trust-title">
        <div className="l-container">
          <div className="l-trust">
            <div className="l-trust-copy">
              <span className="l-eyebrow l-eyebrow--inverse">
                <LockIcon />
                {L.trustEyebrow}
              </span>
              <h2 className="l-h2 l-h2--inverse">{L.trustTitle}</h2>
              <p className="l-lead l-lead--inverse">{L.trustBody}</p>
              <button type="button" className="btn-pill btn-pill-cloud l-trust-link" onClick={() => setCurrentView('features')}>
                {L.exploreFeatures}
                <ArrowIcon />
              </button>
            </div>
            <ul className="l-trust-list">
              {trustPoints.map((p) => (
                <li key={p}>
                  <CheckIcon />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>

      {/* ------------------------------------------------------------ final call to action */}
      <Reveal as="section" className="l-section l-section--last" aria-labelledby="cta-title">
        <div className="l-container">
          <div className="l-cta cloud-feature-card">
            <div>
              <h2 className="l-h2">{L.ctaTitle}</h2>
              <p className="l-lead">{L.ctaBody}</p>
            </div>
            <div className="hero-actions">
              <button type="button" className="btn-pill btn-pill-charcoal hero-cta" onClick={() => setCurrentView('demo')}>
                {t.hero.ctaDemo}
                <ArrowIcon />
              </button>
              <button type="button" className="btn-pill btn-pill-ghost hero-cta" onClick={() => setCurrentView('login')}>
                {t.hero.ctaLogin}
              </button>
            </div>
          </div>
        </div>
      </Reveal>
      </div>
    </div>
  );
};
