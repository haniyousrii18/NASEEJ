import React from 'react';

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  style: { flex: 'none' as const },
};

/** Minimal line mark used where decorative emoji used to sit. Decorative only. */
export const LeafIcon: React.FC = () => (
  <svg {...base}>
    <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" />
    <path d="M5 19c3-5 6-8 10-10" />
  </svg>
);

/** Warning mark for safety-relevant states. Always sits next to a word, never alone. */
export const AlertIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" />
    <path d="M12 8v5M12 16.5v.01" />
  </svg>
);

export const LockIcon: React.FC = () => (
  <svg {...base}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const MailIcon: React.FC = () => (
  <svg {...base} width={18} height={18}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M4 7l8 6 8-6" />
  </svg>
);

export const EyeIcon: React.FC<{ off?: boolean }> = ({ off }) => (
  <svg {...base} width={18} height={18}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);

export const DownloadIcon: React.FC = () => (
  <svg {...base}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </svg>
);

export const UserIcon: React.FC = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1-4 4.5-6 8-6s7 2 8 6" />
  </svg>
);

export const GlobeIcon: React.FC = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
  </svg>
);

export const CheckIcon: React.FC = () => (
  <svg {...base} width={14} height={14}>
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export const ArrowIcon: React.FC = () => (
  <svg {...base} className="flip-rtl">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const ShieldIcon: React.FC = () => (
  <svg {...base}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </svg>
);
