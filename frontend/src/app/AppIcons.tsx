import React from 'react';

export type IconName =
  | 'home' | 'summary' | 'timeline' | 'documents' | 'pill' | 'calendar' | 'message' | 'shield' | 'search' | 'checks'
  | 'folder' | 'link' | 'clock' | 'plus' | 'door' | 'building' | 'chart' | 'users' | 'scroll' | 'inbox' | 'menu'
  | 'close' | 'chevron' | 'logout' | 'globe' | 'collapse' | 'sun' | 'moon' | 'system' | 'user' | 'alert' | 'check'
  | 'visit' | 'flask' | 'download' | 'external' | 'refresh' | 'lock' | 'pulse' | 'upload';

const paths: Record<IconName, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  summary: <><path d="M8 3h8l3 3v15H5V3h3z" /><path d="M9 12h6M9 16h6M9 8h3" /></>,
  timeline: <><path d="M12 3v18" /><circle cx="12" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="M14 7h6M4 17h6" /></>,
  documents: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  pill: <><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)" /><path d="M9.5 8.5l6 6" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /></>,
  message: <path d="M4 5h16v11H9l-5 4z" />,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  checks: <><path d="M4 7l2 2 3-3M4 14l2 2 3-3M12 8h8M12 15h8" /></>,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  link: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  door: <><path d="M6 21V4h9v17M4 21h16" /><circle cx="12.5" cy="12.5" r="0.8" /></>,
  building: <><path d="M5 21V5l7-2 7 2v16M3 21h18" /><path d="M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4" /></>,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9" />,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 010 5M17.5 15c2 .5 3.5 2 3.5 5" /></>,
  scroll: <><path d="M7 4h11v13a3 3 0 01-3 3H6a3 3 0 003-3V4" /><path d="M6 4a2 2 0 00-2 2v1h3M11 9h5M11 13h5" /></>,
  inbox: <><path d="M4 13l2-8h12l2 8" /><path d="M4 13v6h16v-6h-5l-1 2h-4l-1-2z" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  logout: <><path d="M10 4H5v16h5" /><path d="M16 8l4 4-4 4M20 12H9" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></>,
  collapse: <><path d="M5 4v16" /><path d="M13 8l-4 4 4 4M9 12h10" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" /></>,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  visit: <><path d="M5 4h10l4 4v12H5z" /><path d="M9 13h6M12 10v6" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" /><path d="M8 15h8" /></>,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  refresh: <><path d="M20 11a8 8 0 00-14.5-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0014.5 3.5M20 20v-4h-4" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  upload: <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />,
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

/** Line icons for the authenticated app. Decorative: they always sit beside a visible or aria-labelled text. */
export const AppIcon: React.FC<Props> = ({ name, size = 20, className }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {paths[name]}
  </svg>
);
