import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface MultiSelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface MultiSelectProps<T extends string> {
  label: string;
  allLabel: string;
  options: readonly MultiSelectOption<T>[];
  selected: ReadonlySet<T>;
  onChange: (next: Set<T>) => void;
  disabled?: boolean;
}

function summaryFor<T extends string>(
  options: readonly MultiSelectOption<T>[],
  selected: ReadonlySet<T>,
  allLabel: string,
): string {
  if (selected.size === 0) return allLabel;
  if (selected.size === 1) {
    const value = [...selected][0];
    const option = options.find((item) => item.value === value);
    return option === undefined ? '1 selected' : String(option.label);
  }
  if (selected.size <= 2) {
    return options
      .filter((item) => selected.has(item.value))
      .map((item) => String(item.label))
      .join(', ');
  }
  return `${String(selected.size)} selected`;
}

/** Checkbox filter menu with OR semantics inside the group. */
export function MultiSelect<T extends string>({
  label,
  allLabel,
  options,
  selected,
  onChange,
  disabled = false,
}: MultiSelectProps<T>): JSX.Element {
  const id = useId();
  const buttonId = `${id}-button`;
  const menuId = `${id}-menu`;
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const summary = summaryFor(options, selected, allLabel);

  useEffect(() => {
    if (selected.size === 0) return;
    const available = new Set(options.map((option) => option.value));
    if ([...selected].every((value) => available.has(value))) return;
    onChange(new Set([...selected].filter((value) => available.has(value))));
  }, [onChange, options, selected]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (containerRef.current?.contains(event.target as Node) !== true) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function toggleOption(value: T): void {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // "All" is represented by an empty selection, so selecting every option is
    // the same state as no filter.
    onChange(next.size === options.length ? new Set() : next);
  }

  return (
    <div
      className="cr-multi-select"
      ref={containerRef}
      data-open={open ? '' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <span className="cr-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className="cr-multi-select-trigger"
        aria-label={`${label}: ${summary}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{summary}</span>
        <span className="cr-multi-select-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      <div
        className="cr-multi-select-menu"
        id={menuId}
        role="group"
        aria-labelledby={`${id}-label`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
      >
        <label className="cr-check cr-multi-select-option">
          <input
            type="checkbox"
            checked={selected.size === 0}
            disabled={disabled}
            onChange={() => onChange(new Set())}
          />
          <span>{allLabel}</span>
        </label>
        {options.map((option) => (
          <label className="cr-check cr-multi-select-option" key={option.value}>
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              disabled={disabled}
              onChange={() => toggleOption(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
