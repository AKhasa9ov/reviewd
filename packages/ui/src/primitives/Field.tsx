import { forwardRef, useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export interface FieldChromeProps {
  inputId?: string;
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

export function FieldChrome({
  inputId: providedId,
  label,
  hint,
  error,
  hideLabel = false,
  children,
}: FieldChromeProps): JSX.Element {
  const generated = useId();
  const inputId = providedId ?? `field-${generated}`;
  const hintId = hint === undefined ? undefined : `${inputId}-hint`;
  const errorId = error === undefined ? undefined : `${inputId}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="cr-field">
      <label className={hideLabel ? 'cr-visually-hidden' : 'cr-label'} htmlFor={inputId}>
        {label}
      </label>
      {children({ inputId, describedBy })}
      {hint !== undefined ? (
        <span className="cr-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error !== undefined ? (
        <span className="cr-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel, id, className, ...rest },
  ref,
) {
  return (
    <FieldChrome inputId={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {({ inputId, describedBy }) => (
        <input
          {...rest}
          ref={ref}
          id={inputId}
          className={['cr-input', className].filter(Boolean).join(' ')}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
        />
      )}
    </FieldChrome>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, hideLabel, id, className, ...rest },
  ref,
) {
  return (
    <FieldChrome inputId={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {({ inputId, describedBy }) => (
        <textarea
          {...rest}
          ref={ref}
          id={inputId}
          className={['cr-textarea', className].filter(Boolean).join(' ')}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
        />
      )}
    </FieldChrome>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, error, hideLabel, id, className, ...rest },
  ref,
) {
  return (
    <FieldChrome inputId={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {({ inputId, describedBy }) => (
        <select
          {...rest}
          ref={ref}
          id={inputId}
          className={['cr-select', className].filter(Boolean).join(' ')}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldChrome>
  );
});
