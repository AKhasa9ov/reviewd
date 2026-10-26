import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps): JSX.Element {
  return (
    <span className={['cr-badge', className].filter(Boolean).join(' ')} data-tone={tone}>
      {children}
    </span>
  );
}

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 6,
  className,
}: SkeletonProps): JSX.Element {
  return (
    <span
      className={['cr-skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="cr-empty">
      <span className="cr-empty-icon" aria-hidden="true">
        {icon ?? '∅'}
      </span>
      <h2 className="cr-empty-title">{title}</h2>
      {description !== undefined ? <p className="cr-empty-copy">{description}</p> : null}
      {action}
    </div>
  );
}
