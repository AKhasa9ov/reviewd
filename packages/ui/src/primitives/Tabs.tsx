import { useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}

export function Tabs({ items, value, onChange, label, className }: TabsProps): JSX.Element {
  const baseId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    const enabled = items
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item.disabled !== true);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((entry) => entry.item.id === value);
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else if (event.key === 'ArrowRight') next = (Math.max(current, 0) + 1) % enabled.length;
    else next = (Math.max(current, 0) - 1 + enabled.length) % enabled.length;
    const target = enabled[next];
    if (target === undefined) return;
    onChange(target.item.id);
    refs.current[target.index]?.focus();
  }

  return (
    <div className={className}>
      <div className="cr-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {items.map((item, index) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              id={`${baseId}-tab-${item.id}`}
              className="cr-tab"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== value}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
      <span className="cr-visually-hidden" aria-live="polite">
        {items[activeIndex]?.label ?? ''}
      </span>
    </div>
  );
}
