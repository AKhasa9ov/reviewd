import type { ComponentType } from 'react';
import { NativePanel } from './client/NativePanel.js';
import { SettingsSection } from './client/SettingsSection.js';

declare const __REVIEW_CSS__: string;

const PANEL_ID = 'code-review';

function Icon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <rect x="2" y="4" width="20" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 9h9M6 13h12M6 17h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="18" cy="16" r="4.5" fill="var(--dsw-alias-state-success-primary, #22c55e)" />
      <path
        d="m16.3 16 1.2 1.2 2.2-2.6"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ClientContext {
  effect?: (setup: () => () => void, label?: string) => void;
  slots: {
    inject(name: string, callback: () => void): void;
    register(
      config: { name: string; id?: string; key?: string; order?: number; label?: () => string },
      component: ComponentType,
    ): () => void;
  };
}

export const inject = ['slots'];

export function apply(ctx: ClientContext): void {
  ctx.effect?.(() => {
    const style = document.createElement('style');
    style.dataset.reviewdNative = 'true';
    style.textContent = __REVIEW_CSS__;
    document.head.append(style);
    return () => style.remove();
  }, 'reviewd: scoped styles');

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 12, label: () => 'Code Review' },
      Icon,
    ),
  );
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, NativePanel));
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: PANEL_ID, order: 25, label: () => 'Code Review' },
      SettingsSection,
    ),
  );
}
