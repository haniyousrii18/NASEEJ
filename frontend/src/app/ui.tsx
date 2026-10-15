import React, { useEffect, useRef } from 'react';
import { AppIcon, type IconName } from './AppIcons.js';
import { useA } from './useA.js';
import type { ApiFailure, AsyncState } from './api.js';

/** Presentational building blocks of the authenticated app. All styling comes from `na-` classes in app.css. */

export const PageHead: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  back?: { label: string; onClick: () => void };
}> = ({ title, subtitle, actions, back }) => (
  <div className="na-pagehead">
    <div className="na-pagehead-text">
      {back && (
        <button type="button" className="na-back" onClick={back.onClick}>
          <AppIcon name="chevron" size={16} className="na-icon" />
          {back.label}
        </button>
      )}
      <h1 className="na-title" tabIndex={-1} data-page-title>
        {title}
      </h1>
      {subtitle && <p className="na-sub">{subtitle}</p>}
    </div>
    {actions && <div className="na-actions">{actions}</div>}
  </div>
);

export const Card: React.FC<{
  title?: string;
  hint?: string;
  actions?: React.ReactNode;
  flat?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, hint, actions, flat, className, children }) => (
  <section className={`na-card${flat ? ' na-card--flat' : ''}${className ? ` ${className}` : ''}`}>
    {(title || actions) && (
      <div className="na-card-h">
        {title && <h2 className="na-card-title">{title}</h2>}
        {actions}
      </div>
    )}
    {hint && <p className="na-card-hint">{hint}</p>}
    {children}
  </section>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'warn' | 'ok' }> = ({ label, value, tone }) => (
  <div className="na-stat" data-tone={tone}>
    <span className="na-stat-value">{value}</span>
    <span className="na-stat-label">{label}</span>
  </div>
);

export type Tone = 'ok' | 'warn' | 'info' | 'danger' | 'lilac' | 'neutral';

export const Pill: React.FC<{ tone?: Tone; children: React.ReactNode; title?: string }> = ({ tone = 'neutral', children, title }) => (
  <span className="na-pill" data-tone={tone} title={title}>
    {children}
  </span>
);

export const Notice: React.FC<{ tone?: 'ok' | 'warn' | 'info' | 'danger'; icon?: IconName; children: React.ReactNode; live?: boolean }> = ({
  tone = 'info',
  icon,
  children,
  live,
}) => (
  <div className="na-notice" data-tone={tone} role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}>
    {icon && <AppIcon name={icon} size={18} className="na-icon" />}
    <div>{children}</div>
  </div>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'danger'; small?: boolean; icon?: IconName }
> = ({ variant, small, icon, className, children, type = 'button', ...rest }) => (
  <button
    type={type}
    className={`na-btn${variant ? ` na-btn--${variant}` : ''}${small ? ' na-btn--small' : ''}${className ? ` ${className}` : ''}`}
    {...rest}
  >
    {icon && <AppIcon name={icon} size={small ? 16 : 18} />}
    {children}
  </button>
);

export const Field: React.FC<{ label: string; htmlFor: string; help?: string; children: React.ReactNode }> = ({ label, htmlFor, help, children }) => (
  <div className="na-field">
    <label className="na-label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {help && <p className="na-help">{help}</p>}
  </div>
);

/** A neutral message block for the "nothing here yet" state. */
export const EmptyState: React.FC<{ title: string; body?: string; action?: React.ReactNode }> = ({ title, body, action }) => (
  <div className="na-state">
    <h3 className="na-state-title">{title}</h3>
    {body && <p>{body}</p>}
    {action}
  </div>
);

export const Loading: React.FC = () => {
  const A = useA();
  return (
    <div className="na-skeleton" role="status" aria-live="polite" aria-label={A.common.states.loading}>
      <i />
      <i />
      <i />
    </div>
  );
};

/** Error block that tells the failure kinds apart: forbidden, not found, stale, offline, server error. */
export const ErrorState: React.FC<{ error: ApiFailure; onRetry?: () => void }> = ({ error, onRetry }) => {
  const A = useA();
  const S = A.common.states;
  let title = S.errorTitle;
  let body = S.errorBody;
  if (error.status === 0) [title, body] = [S.networkTitle, S.networkBody];
  else if (error.status === 403) [title, body] = [S.forbiddenTitle, S.forbiddenBody];
  else if (error.status === 404) [title, body] = [S.notFoundTitle, S.notFoundBody];
  else if (error.code === 'STALE_VERSION') [title, body] = [S.staleTitle, S.staleBody];
  const retryable = error.status !== 403 && error.status !== 404;
  return (
    <div className="na-state" data-tone="error" role="alert">
      <h3 className="na-state-title">{title}</h3>
      <p>{body}</p>
      {retryable && onRetry && (
        <Button small onClick={onRetry} icon="refresh">
          {A.common.actions.retry}
        </Button>
      )}
    </div>
  );
};

/**
 * Renders the right block for an async state: skeleton while loading, error kinds, an empty message, or the data.
 * `isEmpty` decides what "empty" means for the screen; `empty` is what to show then.
 */
export function Async<T>({
  state,
  onRetry,
  isEmpty,
  empty,
  children,
}: {
  state: AsyncState<T>;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  children: (data: T, meta?: any) => React.ReactNode;
}) {
  const A = useA();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={onRetry} />;
  if (isEmpty && isEmpty(state.data)) return <>{empty ?? <EmptyState title={A.common.states.emptyDefault} />}</>;
  return <>{children(state.data, state.meta)}</>;
}

/** A modal dialog with focus handling: focus moves in, Escape closes, focus returns to the opener. */
export const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const A = useA();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])');
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="na-dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="na-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="na-card-h">
          <h2 className="na-card-title">{title}</h2>
          <button type="button" className="na-icon-btn" onClick={onClose} aria-label={A.common.actions.close}>
            <AppIcon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const SyntheticNote: React.FC = () => {
  const A = useA();
  return <Pill tone="info">{A.common.shell.syntheticNote}</Pill>;
};
