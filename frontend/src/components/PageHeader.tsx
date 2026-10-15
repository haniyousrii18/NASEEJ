import React from 'react';
import { LeafIcon } from './LineIcon.js';

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/** Page header for dashboards and workspaces: eyebrow, one h1, optional subtitle and actions. */
export const PageHeader: React.FC<Props> = ({ eyebrow, title, subtitle, actions }) => (
  <div className="page-head">
    <div className="page-head-text">
      {eyebrow && (
        <div className="page-eyebrow">
          <LeafIcon />
          <span>{eyebrow}</span>
        </div>
      )}
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-sub">{subtitle}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
);
