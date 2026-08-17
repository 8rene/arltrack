import { createContext, useCallback, useContext, useRef, useState } from "react";
import "../styles/toast.css";

// One shared notification pattern for the whole app. Before this, the same
// "tell the user an action succeeded/failed" problem was solved three
// different ways in three different places (LoginModal's static <p>,
// ProfilePage's local toast state, ad hoc local state everywhere else).
// Anything that needs to notify the user about the result of an action
// should call useToast() instead of inventing another local error/success
// pattern.
const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  // type: "error" | "success" | "info"
  const showToast = useCallback((message, type = "error", duration = 4000) => {
    if (!message) return;
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismissToast(id), duration);
    return id;
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="arl-toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`arl-toast arl-toast--${t.type}`}
            onClick={() => dismissToast(t.id)}
          >
            <span className="arl-toast-icon">
              {t.type === "success" ? "✅" : t.type === "info" ? "ℹ️" : "⛔"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used within <ToastProvider>.");
  }
  return ctx;
}
