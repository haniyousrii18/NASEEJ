import React from 'react';
import { useLang } from '../context/LangContext.js';
import { useTheme, ThemePreference } from '../context/ThemeContext.js';

const labels = {
  ar: {
    group: 'مظهر الموقع',
    switchTo: 'التبديل إلى',
    light: 'الوضع النهاري',
    dark: 'الوضع الليلي',
    system: 'حسب النظام',
  },
  en: {
    group: 'Theme',
    switchTo: 'Switch to',
    light: 'Day mode',
    dark: 'Night mode',
    system: 'Match system',
  },
} as const;

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
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

// One button cycles day, night, then follow the system.
const next: Record<ThemePreference, ThemePreference> = { light: 'dark', dark: 'system', system: 'light' };

interface ThemeToggleProps {
  compact?: boolean;
}

/**
 * One compact button that cycles day mode, night mode and the system setting.
 * When compact=true, only the icon is rendered, omitting the text label.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact }) => {
  const { lang } = useLang();
  const { preference, setPreference } = useTheme();
  const c = labels[lang];
  const target = next[preference];
  const description = `${c.group}: ${c[preference]}. ${c.switchTo} ${c[target]}`;

  return (
    <button
      type="button"
      className={compact ? 'site-act' : 'site-util'}
      aria-label={description}
      title={description}
      onClick={() => setPreference(target)}
    >
      {icons[preference]}
      {!compact && (
        <span className="site-util-label">
          {c.group}: {c[preference]}
        </span>
      )}
    </button>
  );
};
