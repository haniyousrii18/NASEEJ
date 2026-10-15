import React from 'react';
import { useLang } from '../context/LangContext.js';
import { AlertIcon, CheckIcon, LockIcon } from './LineIcon.js';

// Photographs placed in src/assets/hero/ are picked up at build time: hero-ar.* for the Arabic page,
// hero-en.* for the English page, otherwise the first image found. Without one, the hero shows the
// designed fallback below. No remote image is ever requested.
const heroImages = import.meta.glob('../assets/hero/*.{webp,jpg,jpeg,png,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
export const pickHero = (lang: string): string | undefined => {
  const entries = Object.entries(heroImages);
  return entries.find(([path]) => path.includes(`hero-${lang}.`))?.[1] ?? entries[0]?.[1];
};

/** Line weave that echoes the logo's connected nodes. Decorative. */
const Weave: React.FC = () => (
  <svg className="hero-weave" viewBox="0 0 400 440" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M70 90L180 60L300 120L330 230L240 300L120 270L90 170Z" />
      <path d="M180 60L240 300M70 90L240 300M300 120L120 270M90 170L330 230M180 60L120 270" opacity="0.5" />
      <path d="M120 270L150 370L260 390L240 300" />
    </g>
    <g fill="currentColor">
      {[[70, 90], [180, 60], [300, 120], [330, 230], [240, 300], [120, 270], [90, 170], [150, 370], [260, 390]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 7 : 5} />
      ))}
    </g>
  </svg>
);

/**
 * Background layer of the full-width hero: a photograph when one is supplied, otherwise a designed
 * composition with two product cards (synthetic data, labelled). The text side fades into the hero
 * surface through the overlay defined in landing.css.
 */
export const HeroVisual: React.FC = () => {
  const { t, isRtl, lang } = useLang();
  const L = t.landing;
  const heroSrc = pickHero(lang);

  return (
    <div className={`hero-visual${heroSrc ? ' has-image' : ''}`}>
      {heroSrc ? (
        <img src={heroSrc} alt={L.imageAlt} loading="eager" decoding="async" />
      ) : (
        <>
          <Weave />
          <div className="hero-card hero-card--patient" role="group" aria-label={L.cardPatient}>
            <div className="hero-card-label">{L.cardPatient}</div>
            <div className="hero-card-title" dir="auto">{isRtl ? 'محمد المنصور' : 'Mohammed Al-Mansoor'}</div>
            <div className="hero-card-meta"><span className="num">MRN-NOOR-1001</span></div>
            <span className="status-badge badge-draft hero-chip">
              <AlertIcon size={14} />
              <span>{L.cardAllergy}</span>
            </span>
          </div>
          <div className="hero-card hero-card--status" role="group" aria-label={L.cardLab}>
            <div className="hero-card-label">{L.cardLab}</div>
            <div className="hero-card-row">
              <span className="status-badge badge-approved hero-chip"><CheckIcon /><span>{L.cardApproved}</span></span>
            </div>
            <div className="hero-card-row">
              <span className="status-badge badge-info hero-chip"><LockIcon /><span>{L.cardDraft}</span></span>
            </div>
          </div>
          <div className="hero-visual-note">{L.heroSyntheticNote}</div>
        </>
      )}
    </div>
  );
};
