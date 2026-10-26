import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'default' | 'danger';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  items: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  durationMs?: number;
}

export function ToastProvider({ children, durationMs = 5000 }: ToastProviderProps): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'default') => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, timer);
    },
    [dismiss, durationMs],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss, items }),
    [dismiss, items, toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="cr-toast-region" role="status" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div className="cr-toast" key={item.id} data-tone={item.tone}>
            <span>{item.message}</span>
            <button
              type="button"
              className="cr-icon-button"
              style={{ width: 28, height: 28, flexBasis: 28 }}
              aria-label="Dismiss notification"
              onClick={() => dismiss(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === null) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
