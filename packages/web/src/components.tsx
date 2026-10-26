import type { ReactNode } from 'react';
import { Link } from './router.js';

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps): JSX.Element {
  return (
    <header className="cr-page-head">
      <div>
        <p className="cr-eyebrow">{eyebrow}</p>
        <h1 className="cr-page-title">{title}</h1>
        {description !== undefined ? <p className="cr-page-sub">{description}</p> : null}
      </div>
      {actions !== undefined ? <div className="cr-page-actions">{actions}</div> : null}
    </header>
  );
}

export interface BackLinkProps {
  to: string;
  label: string;
}

export function BackLink({ to, label }: BackLinkProps): JSX.Element {
  return (
    <Link className="cr-back" to={to}>
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}

export function ErrorPanel({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="cr-error-panel" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onRetry !== undefined ? (
        <button type="button" className="cr-button" data-variant="secondary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
