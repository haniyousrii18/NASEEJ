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
