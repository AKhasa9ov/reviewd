import { cloneElement, useId, useState } from 'react';
import type { FocusEvent, ReactElement, ReactNode } from 'react';

interface TooltipChildProps {
  'aria-describedby'?: string;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export interface TooltipProps {
  label: string;
  children: ReactElement<TooltipChildProps>;
  side?: 'top' | 'bottom';
}

export function Tooltip({ label, children, side = 'top' }: TooltipProps): JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(false);
  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ');

  const child = cloneElement(children, {
    'aria-describedby': describedBy,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      setOpen(true);
      children.props.onFocus?.(event);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      setOpen(false);
      children.props.onBlur?.(event);
    },
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
  });

  return (
    <span className="cr-tooltip-wrap">
      {child}
      <span
        className="cr-tooltip"
        id={id}
        role="tooltip"
        data-open={open || undefined}
        data-side={side}
      >
        {label}
      </span>
    </span>
  );
}

export interface TooltipTextProps {
  label: string;
  children: ReactNode;
}

/** A non-interactive tooltip wrapper for explanatory copy. */
export function TooltipText({ label, children }: TooltipTextProps): JSX.Element {
  return (
    <Tooltip label={label}>
      <span tabIndex={0}>{children}</span>
    </Tooltip>
  );
}
