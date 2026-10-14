import React from 'react';
import { useLang } from '../context/LangContext.js';
import { useTheme, ThemePreference } from '../context/ThemeContext.js';

const labels = {
  ar: {
    group: 'مظهر الموقع',
    light: 'الوضع الفاتح',
    dark: 'الوضع الداكن',
    system: 'استخدام إعداد النظام',
  },
  en: {
    group: 'Theme',
    light: 'Light mode',
    dark: 'Dark mode',
    system: 'Use system setting',
  },
} as const;

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const icons: Record<ThemePreference, React.ReactNode> = {
  light: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  dark: (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  system: (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
};

const options: ThemePreference[] = ['light', 'system', 'dark'];

export const ThemeToggle: React.FC = () => {
  const { lang } = useLang();
  const { preference, setPreference } = useTheme();
  const c = labels[lang];

  return (
    <div
      role="group"
      aria-label={c.group}
      className="theme-toggle"
      style={{
        display: 'inline-flex',
        padding: 2,
        gap: 2,
        borderRadius: 128,
        background: 'var(--color-cloud-card)',
      }}
    >
      {options.map((opt) => {
        const active = preference === opt;
        return (
          <button
            key={opt}
            type="button"
            className="theme-toggle-button"
            aria-pressed={active}
            aria-label={c[opt]}
            title={c[opt]}
            onClick={() => setPreference(opt)}
            style={{
              width: 30,
              height: 30,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              color: active ? 'var(--color-cloud-card)' : 'var(--color-body-gray)',
              background: active ? 'var(--color-charcoal)' : 'transparent',
              transition: 'background 0.2s ease, color 0.2s ease',
            }}
          >
            {icons[opt]}
          </button>
        );
      })}
    </div>
  );
};
