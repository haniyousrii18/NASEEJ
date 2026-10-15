import React from 'react';
import { useLang } from '../context/LangContext.js';
import { HeroScene } from './HeroScene.js';

/**
 * Visual side of the full-width hero: the connected-record illustration (styled per theme in
 * landing.css) and a one-line note that everything shown is synthetic.
 */
export const HeroVisual: React.FC = () => {
  const { t } = useLang();

  return (
    <div className="hero-visual">
      <HeroScene />
      <p className="hero-visual-note">{t.landing.heroSyntheticNote}</p>
    </div>
  );
};
