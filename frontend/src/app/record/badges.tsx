import React from 'react';
import { Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';

const REVIEW_TONE: Record<string, Tone> = {
  approved: 'ok',
  reviewed: 'ok',
  dispensed: 'ok',
  draft: 'warn',
  unreviewed: 'warn',
  amended: 'info',
  cancelled: 'danger',
};

/** The review state exactly as recorded. Nothing is promoted: "unreviewed" stays unreviewed. */
export const ReviewPill: React.FC<{ status: string }> = ({ status }) => {
  const A = useA();
  const label = (A.common.review as Record<string, string>)[status];
  if (!label) return null;
  return <Pill tone={REVIEW_TONE[status] ?? 'neutral'}>{label}</Pill>;
};

export const ProvenancePill: React.FC<{ provenance: string }> = ({ provenance }) => {
  const A = useA();
  const label = (A.common.provenance as Record<string, string>)[provenance];
  if (!label) return null;
  const tone: Tone = provenance === 'patient_reported' || provenance === 'patient_uploaded' ? 'lilac' : 'neutral';
  return <Pill tone={tone}>{label}</Pill>;
};
