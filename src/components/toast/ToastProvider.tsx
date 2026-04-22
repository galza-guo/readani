import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

type ToastTone = "neutral" | "success" | "error";

type ToastOptions = {
  message: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = ToastOptions & {
  durationMs: number;
  id: number;
  isExiting: boolean;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_EXIT_DURATION_MS = 180;

function getToastExitDurationMs() {
  if (typeof window === "undefined") {
    return TOAST_EXIT_DURATION_MS;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : TOAST_EXIT_DURATION_MS;
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v5" strokeLinecap="round" />
      <circle cx="12" cy="7.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3 4.9-5.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4 3.8 19h16.4Z" strokeLinejoin="round" />
      <path d="M12 9v4.5" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") {
    return <CheckIcon />;
  }

  if (tone === "error") {
    return <AlertIcon />;
  }

  return <InfoIcon />;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextToastIdRef = useRef(1);
  const toastsRef = useRef<ToastRecord[]>([]);
  const autoDismissTimersRef = useRef(new Map<number, number>());
  const exitTimersRef = useRef(new Map<number, number>());

  const finalizeToastRemoval = useCallback((id: number) => {
    const autoDismissTimerId = autoDismissTimersRef.current.get(id);
    if (autoDismissTimerId !== undefined) {
      window.clearTimeout(autoDismissTimerId);
      autoDismissTimersRef.current.delete(id);
    }

    const exitTimerId = exitTimersRef.current.get(id);
    if (exitTimerId !== undefined) {
      window.clearTimeout(exitTimerId);
      exitTimersRef.current.delete(id);
    }

    setToasts((current) => {
      const next = current.filter((toast) => toast.id !== id);
      toastsRef.current = next;
      return next;
    });
  }, []);

  const removeToast = useCallback(
    (id: number) => {
      const toast = toastsRef.current.find((entry) => entry.id === id);
      if (!toast || toast.isExiting) {
        return;
      }

      const autoDismissTimerId = autoDismissTimersRef.current.get(id);
      if (autoDismissTimerId !== undefined) {
        window.clearTimeout(autoDismissTimerId);
        autoDismissTimersRef.current.delete(id);
      }

      setToasts((current) => {
        const next = current.map((entry) => (entry.id === id ? { ...entry, isExiting: true } : entry));
        toastsRef.current = next;
        return next;
      });

      const exitTimerId = window.setTimeout(() => {
        finalizeToastRemoval(id);
      }, getToastExitDurationMs());

      exitTimersRef.current.set(id, exitTimerId);
    },
    [finalizeToastRemoval]
  );

  const showToast = useCallback(
    ({
      message,
      detail,
      actionLabel,
      onAction,
      tone = "neutral",
      durationMs = 3600,
    }: ToastOptions) => {
      const id = nextToastIdRef.current++;

      setToasts((current) => {
        const next = [
          ...current,
          {
            id,
            message,
            detail,
            actionLabel,
            onAction,
            tone,
            durationMs,
            isExiting: false,
          },
        ].slice(-4);
        toastsRef.current = next;
        return next;
      });

      const timerId = window.setTimeout(() => {
        removeToast(id);
      }, durationMs);

      autoDismissTimersRef.current.set(id, timerId);
    },
    [removeToast]
  );

  useEffect(() => {
    return () => {
      for (const timerId of autoDismissTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }

      autoDismissTimersRef.current.clear();

      for (const timerId of exitTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }

      exitTimersRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.tone}${toast.isExiting ? " toast--exiting" : ""}`}
            role="status"
          >
            <span className="toast__icon" aria-hidden="true">
              <ToastIcon tone={toast.tone} />
            </span>
            <div className="toast__copy">
              <span className="toast__message">{toast.message}</span>
              {toast.detail ? <span className="toast__detail">{toast.detail}</span> : null}
              {toast.actionLabel && toast.onAction ? (
                <button
                  className="toast__action"
                  onClick={() => {
                    toast.onAction?.();
                    removeToast(toast.id);
                  }}
                  type="button"
                >
                  {toast.actionLabel}
                </button>
              ) : null}
            </div>
            <button
              aria-label="Dismiss notification"
              className="toast__dismiss"
              onClick={() => removeToast(toast.id)}
              type="button"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}
