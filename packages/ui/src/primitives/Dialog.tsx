import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { CloseIcon } from '../icons.js';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  actions?: ReactNode;
  labelledBy?: string;
  closeDisabled?: boolean;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  actions,
  closeDisabled = false,
}: DialogProps): JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const target = dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog ?? null;
    target?.focus();

    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!closeDisabled) onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="cr-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        className="cr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="cr-dialog-head">
          <div>
            <h2 className="cr-dialog-title" id={titleId}>
              {title}
            </h2>
            {description !== undefined ? (
              <p className="cr-dialog-copy" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="cr-icon-button"
            aria-label="Close dialog"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="cr-dialog-body">
          {children}
          {actions !== undefined ? <div className="cr-dialog-actions">{actions}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
