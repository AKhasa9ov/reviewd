window.__ModuleLoader__.load({
  id: '@sir_yami/reviewd',
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/dsh/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// packages/dsh/src/client/NativePanel.tsx
var import_react33 = require("react");

// packages/ui/src/primitives/Button.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var Button = (0, import_react.forwardRef)(function Button2({
  variant = "primary",
  loading = false,
  size = "medium",
  icon,
  children,
  disabled,
  className,
  type = "button",
  ...rest
}, ref) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      ...rest,
      ref,
      type,
      className: ["cr-button", className].filter(Boolean).join(" "),
      "data-variant": variant,
      "data-size": size,
      disabled: disabled === true || loading,
      "aria-busy": loading || void 0,
      children: [
        loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cr-spinner", "aria-hidden": "true" }) : icon,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children })
      ]
    }
  );
});
var IconButton = (0, import_react.forwardRef)(function IconButton2({ label, loading = false, children, disabled, className, type = "button", ...rest }, ref) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      ...rest,
      ref,
      type,
      className: ["cr-icon-button", className].filter(Boolean).join(" "),
      "aria-label": label,
      "aria-busy": loading || void 0,
      disabled: disabled === true || loading,
      children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cr-spinner", "aria-hidden": "true" }) : children
    }
  );
});

// packages/ui/src/primitives/Field.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function FieldChrome({
  inputId: providedId,
  label,
  hint,
  error,
  hideLabel = false,
  children
}) {
  const generated = (0, import_react2.useId)();
  const inputId = providedId ?? `field-${generated}`;
  const hintId = hint === void 0 ? void 0 : `${inputId}-hint`;
  const errorId = error === void 0 ? void 0 : `${inputId}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "cr-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: hideLabel ? "cr-visually-hidden" : "cr-label", htmlFor: inputId, children: label }),
    children({ inputId, describedBy }),
    hint !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "cr-hint", id: hintId, children: hint }) : null,
    error !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "cr-error", id: errorId, role: "alert", children: error }) : null
  ] });
}
var Input = (0, import_react2.forwardRef)(function Input2({ label, hint, error, hideLabel, id, className, ...rest }, ref) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(FieldChrome, { inputId: id, label, hint, error, hideLabel, children: ({ inputId, describedBy }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "input",
    {
      ...rest,
      ref,
      id: inputId,
      className: ["cr-input", className].filter(Boolean).join(" "),
      "aria-invalid": error === void 0 ? void 0 : true,
      "aria-describedby": describedBy
    }
  ) });
});
var Textarea = (0, import_react2.forwardRef)(function Textarea2({ label, hint, error, hideLabel, id, className, ...rest }, ref) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(FieldChrome, { inputId: id, label, hint, error, hideLabel, children: ({ inputId, describedBy }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "textarea",
    {
      ...rest,
      ref,
      id: inputId,
      className: ["cr-textarea", className].filter(Boolean).join(" "),
      "aria-invalid": error === void 0 ? void 0 : true,
      "aria-describedby": describedBy
    }
  ) });
});
var Select = (0, import_react2.forwardRef)(function Select2({ label, options, hint, error, hideLabel, id, className, ...rest }, ref) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(FieldChrome, { inputId: id, label, hint, error, hideLabel, children: ({ inputId, describedBy }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "select",
    {
      ...rest,
      ref,
      id: inputId,
      className: ["cr-select", className].filter(Boolean).join(" "),
      "aria-invalid": error === void 0 ? void 0 : true,
      "aria-describedby": describedBy,
      children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: option.value, disabled: option.disabled, children: option.label }, option.value))
    }
  ) });
});

// packages/ui/src/primitives/Feedback.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function Badge({ children, tone = "neutral", className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: ["cr-badge", className].filter(Boolean).join(" "), "data-tone": tone, children });
}
function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
  className
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "span",
    {
      className: ["cr-skeleton", className].filter(Boolean).join(" "),
      style: { width, height, borderRadius: radius },
      "aria-hidden": "true"
    }
  );
}
function EmptyState({ title, description, icon, action }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "cr-empty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "cr-empty-icon", "aria-hidden": "true", children: icon ?? "\u2205" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { className: "cr-empty-title", children: title }),
    description !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "cr-empty-copy", children: description }) : null,
    action
  ] });
}

// packages/ui/src/primitives/Dialog.tsx
var import_react4 = require("react");
var import_react_dom = require("react-dom");

// packages/ui/src/icons.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function iconProps({ size = 18, ...props }) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...props
  };
}
function ReviewsIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { ...iconProps(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M4 5.5A2.5 2.5 0 0 1 6.5 3H18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 18.5z" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M8 7h8M8 11h8M8 15h5" })
  ] });
}
function SearchIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { ...iconProps(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "11", cy: "11", r: "6.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "m16 16 4.5 4.5" })
  ] });
}
function ArrowLeftIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { ...iconProps(props), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M19 12H5M11 18l-6-6 6-6" }) });
}
function CloseIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { ...iconProps(props), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "m6 6 12 12M18 6 6 18" }) });
}
function FolderIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { ...iconProps(props), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" }) });
}
function FileIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { ...iconProps(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M14 3v5h5M9 13h6M9 17h4" })
  ] });
}
function GitBranchIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { ...iconProps(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "6", cy: "5", r: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "6", cy: "19", r: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "18", cy: "7", r: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M6 7v10M18 9c0 4-4 4-8 5" })
  ] });
}

// packages/ui/src/primitives/PortalContainer.tsx
var import_react3 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var PortalContainerContext = (0, import_react3.createContext)(null);
function PortalContainerProvider({
  container,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PortalContainerContext.Provider, { value: container, children });
}
function usePortalContainer() {
  return (0, import_react3.useContext)(PortalContainerContext)?.current ?? null;
}

// packages/ui/src/primitives/Dialog.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");
function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  actions,
  closeDisabled = false
}) {
  const titleId = (0, import_react4.useId)();
  const descriptionId = (0, import_react4.useId)();
  const portalContainer = usePortalContainer();
  const dialogRef = (0, import_react4.useRef)(null);
  const restoreRef = (0, import_react4.useRef)(null);
  const onCloseRef = (0, import_react4.useRef)(onClose);
  onCloseRef.current = onClose;
  (0, import_react4.useEffect)(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const target = dialog?.querySelector(FOCUSABLE) ?? dialog ?? null;
    target?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);
  if (!open) return null;
  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!closeDisabled) onCloseRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (first === void 0 || last === void 0) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "div",
      {
        className: "cr-overlay",
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && !closeDisabled) onCloseRef.current();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "div",
          {
            ref: dialogRef,
            className: "cr-dialog",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            "aria-describedby": description === void 0 ? void 0 : descriptionId,
            tabIndex: -1,
            onKeyDown,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "cr-dialog-head", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { className: "cr-dialog-title", id: titleId, children: title }),
                  description !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "cr-dialog-copy", id: descriptionId, children: description }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "cr-icon-button",
                    "aria-label": "Close dialog",
                    disabled: closeDisabled,
                    onClick: onClose,
                    children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(CloseIcon, {})
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "cr-dialog-body", children: [
                children,
                actions !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "cr-dialog-actions", children: actions }) : null
              ] })
            ]
          }
        )
      }
    ),
    portalContainer ?? document.body
  );
}

// packages/ui/src/primitives/Tabs.tsx
var import_react5 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function Tabs({ items, value, onChange, label, className }) {
  const baseId = (0, import_react5.useId)();
  const refs = (0, import_react5.useRef)([]);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value)
  );
  function onKeyDown(event) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const enabled = items.map((item, index) => ({ item, index })).filter((entry) => entry.item.disabled !== true);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((entry) => entry.item.id === value);
    let next;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    else if (event.key === "ArrowRight") next = (Math.max(current, 0) + 1) % enabled.length;
    else next = (Math.max(current, 0) - 1 + enabled.length) % enabled.length;
    const target = enabled[next];
    if (target === void 0) return;
    onChange(target.item.id);
    refs.current[target.index]?.focus();
  }
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "cr-tabs", role: "tablist", "aria-label": label, onKeyDown, children: items.map((item, index) => {
      const selected = item.id === value;
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "button",
        {
          ref: (node) => {
            refs.current[index] = node;
          },
          type: "button",
          id: `${baseId}-tab-${item.id}`,
          className: "cr-tab",
          role: "tab",
          "aria-selected": selected,
          "aria-controls": `${baseId}-panel-${item.id}`,
          tabIndex: selected ? 0 : -1,
          disabled: item.disabled,
          onClick: () => onChange(item.id),
          children: item.label
        },
        item.id
      );
    }) }),
    items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "div",
      {
        id: `${baseId}-panel-${item.id}`,
        role: "tabpanel",
        "aria-labelledby": `${baseId}-tab-${item.id}`,
        hidden: item.id !== value,
        tabIndex: 0,
        children: item.content
      },
      item.id
    )),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "cr-visually-hidden", "aria-live": "polite", children: items[activeIndex]?.label ?? "" })
  ] });
}

// packages/ui/src/primitives/Toast.tsx
var import_react6 = require("react");
var import_jsx_runtime8 = require("react/jsx-runtime");
var ToastContext = (0, import_react6.createContext)(null);
function ToastProvider({ children, durationMs = 5e3 }) {
  const [items, setItems] = (0, import_react6.useState)([]);
  const nextId = (0, import_react6.useRef)(1);
  const timers = (0, import_react6.useRef)(/* @__PURE__ */ new Map());
  const dismiss = (0, import_react6.useCallback)((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== void 0) clearTimeout(timer);
    timers.current.delete(id);
  }, []);
  const toast = (0, import_react6.useCallback)(
    (message, tone = "default") => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, timer);
    },
    [dismiss, durationMs]
  );
  (0, import_react6.useEffect)(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    []
  );
  const value = (0, import_react6.useMemo)(
    () => ({ toast, dismiss, items }),
    [dismiss, items, toast]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(ToastContext.Provider, { value, children: [
    children,
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "cr-toast-region", role: "status", "aria-live": "polite", "aria-atomic": "false", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "cr-toast", "data-tone": item.tone, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: item.message }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          className: "cr-icon-button",
          style: { width: 28, height: 28, flexBasis: 28 },
          "aria-label": "Dismiss notification",
          onClick: () => dismiss(item.id),
          children: "\xD7"
        }
      )
    ] }, item.id)) })
  ] });
}
function useToast() {
  const value = (0, import_react6.useContext)(ToastContext);
  if (value === null) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

// packages/ui/src/primitives/Tooltip.tsx
var import_react7 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function Tooltip({ label, children, side = "top" }) {
  const id = (0, import_react7.useId)();
  const [open, setOpen] = (0, import_react7.useState)(false);
  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");
  const child = (0, import_react7.cloneElement)(children, {
    "aria-describedby": describedBy,
    onFocus: (event) => {
      setOpen(true);
      children.props.onFocus?.(event);
    },
    onBlur: (event) => {
      setOpen(false);
      children.props.onBlur?.(event);
    },
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false)
  });
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "cr-tooltip-wrap", children: [
    child,
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "span",
      {
        className: "cr-tooltip",
        id,
        role: "tooltip",
        "data-open": open || void 0,
        "data-side": side,
        children: label
      }
    )
  ] });
}

// packages/ui/src/theme.tsx
var import_react8 = require("react");
var import_jsx_runtime10 = require("react/jsx-runtime");
var THEME_STORAGE_KEY = "cr-theme";
var DEFAULT_THEME = "dark";
function readStoredTheme(storageKey = THEME_STORAGE_KEY) {
  try {
    const value = globalThis.localStorage?.getItem(storageKey);
    return value === "light" ? "light" : "dark";
  } catch {
    return DEFAULT_THEME;
  }
}
function applyTheme(theme, root = document.documentElement) {
  root.dataset.theme = theme;
}
var ThemeContext = (0, import_react8.createContext)(null);
function ThemeProvider({
  children,
  initialTheme,
  storageKey = THEME_STORAGE_KEY,
  persist = true,
  targetRef
}) {
  const [theme, setThemeState] = (0, import_react8.useState)(
    () => initialTheme ?? (persist ? readStoredTheme(storageKey) : DEFAULT_THEME)
  );
  (0, import_react8.useEffect)(() => {
    if (targetRef !== void 0) {
      if (targetRef.current !== null) applyTheme(theme, targetRef.current);
    } else {
      applyTheme(theme);
    }
    if (!persist) return;
    try {
      globalThis.localStorage?.setItem(storageKey, theme);
    } catch {
    }
  }, [persist, storageKey, targetRef, theme]);
  const setTheme = (0, import_react8.useCallback)((next) => {
    setThemeState(next);
  }, []);
  const toggleTheme = (0, import_react8.useCallback)(() => {
    setThemeState((current) => current === "dark" ? "light" : "dark");
  }, []);
  const value = (0, import_react8.useMemo)(
    () => ({ theme, setTheme, toggleTheme }),
    [setTheme, theme, toggleTheme]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ThemeContext.Provider, { value, children });
}

// packages/ui/src/api/client.ts
var ApiError = class extends Error {
  status;
  code;
  details;
  requestId;
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "network";
    if (options.details !== void 0) this.details = options.details;
    if (options.requestId !== void 0) this.requestId = options.requestId;
  }
};
function normalizeBase(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}
function currentPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
function isErrorEnvelope(value) {
  return typeof value === "object" && value !== null && "error" in value;
}
var ApiClient = class {
  baseUrl;
  fetchImpl;
  onUnauthorized;
  getPath;
  constructor(options = {}) {
    this.baseUrl = normalizeBase(options.baseUrl ?? "");
    const injected = options.fetchImpl;
    this.fetchImpl = injected ?? ((input, init) => globalThis.fetch(input, init));
    this.onUnauthorized = options.onUnauthorized;
    this.getPath = options.getCurrentPath ?? currentPath;
  }
  async request(path, options = {}) {
    const headers = {
      accept: "application/json",
      ...options.headers
    };
    let body;
    if (options.body !== void 0) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        credentials: "same-origin",
        ...body === void 0 ? {} : { body },
        ...options.signal === void 0 ? {} : { signal: options.signal }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiError("Cannot reach the review daemon", { code: "network", status: 0 });
    }
    const requestId = response.headers.get("x-request-id") ?? void 0;
    if (response.status === 401) {
      const next = this.getPath();
      if (this.onUnauthorized !== void 0 && !next.startsWith("/auth")) {
        this.onUnauthorized(next);
      }
      throw new ApiError("Authentication required", {
        status: 401,
        code: "unauthorized",
        ...requestId === void 0 ? {} : { requestId }
      });
    }
    const text = await response.text();
    let payload = null;
    if (text !== "") {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError("The daemon returned an invalid JSON response", {
          status: response.status,
          code: "invalid-response",
          ...requestId === void 0 ? {} : { requestId }
        });
      }
    }
    if (!response.ok) {
      const envelope = isErrorEnvelope(payload) ? payload : void 0;
      const error = envelope?.error;
      throw new ApiError(error?.message ?? `Request failed with ${response.status}`, {
        status: response.status,
        code: error?.code ?? "internal",
        ...error?.details === void 0 ? {} : { details: error.details },
        ...requestId === void 0 ? {} : { requestId }
      });
    }
    return payload;
  }
  async listReviews(options = {}) {
    const params = new URLSearchParams();
    if (options.status !== void 0) params.set("status", options.status);
    if (options.limit !== void 0) params.set("limit", String(options.limit));
    if (options.offset !== void 0) params.set("offset", String(options.offset));
    const query = params.toString();
    return this.request(`/api/reviews${query === "" ? "" : `?${query}`}`);
  }
  async listRepositories() {
    return this.request("/api/settings/repositories");
  }
  async saveRepositories(repositories) {
    return this.request("/api/settings/repositories", {
      method: "PUT",
      body: { repositories }
    });
  }
  async listDirectories(path, signal) {
    const params = new URLSearchParams();
    const trimmed = path?.trim();
    if (trimmed !== void 0 && trimmed !== "") params.set("path", trimmed);
    const query = params.toString();
    return this.request(`/api/fs/dirs${query === "" ? "" : `?${query}`}`, {
      ...signal === void 0 ? {} : { signal }
    });
  }
  async listBranches(path, signal) {
    const query = new URLSearchParams({ path });
    return this.request(`/api/repos/branches?${query.toString()}`, {
      ...signal === void 0 ? {} : { signal }
    });
  }
  async listCommits(path, base, head) {
    const query = new URLSearchParams({ path, base, head });
    return this.request(`/api/repos/commits?${query.toString()}`);
  }
  async createReview(input) {
    return this.request("/api/reviews", { method: "POST", body: input });
  }
  async getReview(id) {
    return this.request(`/api/reviews/${encodeURIComponent(id)}`);
  }
  async updateReview(id, input) {
    return this.request(`/api/reviews/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input
    });
  }
  async deleteReview(id, reason) {
    await this.request(`/api/reviews/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: reason === void 0 ? {} : { reason }
    });
  }
  async getSnapshot(id, round, file) {
    const params = new URLSearchParams({ round: String(round) });
    if (file !== void 0) params.set("file", file);
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/snapshot?${params.toString()}`
    );
  }
  async getFileDiff(id, round, path) {
    const params = new URLSearchParams({ path });
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/snapshot/${round}/diff?${params.toString()}`
    );
  }
  async addComment(id, input) {
    return this.request(`/api/reviews/${encodeURIComponent(id)}/comments`, {
      method: "POST",
      body: input
    });
  }
  async reply(id, commentId, body) {
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/replies`,
      { method: "POST", body: { body } }
    );
  }
  async editComment(id, commentId, body) {
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
      { method: "PATCH", body: { body } }
    );
  }
  async deleteComment(id, commentId) {
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" }
    );
  }
  async setCommentState(id, commentId, state) {
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
      { method: "PATCH", body: { state } }
    );
  }
  async decideFinding(id, findingId, input) {
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/findings/${encodeURIComponent(findingId)}/decision`,
      { method: "POST", body: input }
    );
  }
  async decideFindings(id, state, findingIds) {
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/findings/decisions`,
      {
        method: "POST",
        body: { state, ...findingIds === void 0 ? {} : { findingIds } }
      }
    );
  }
  async submit(id, input) {
    return this.request(`/api/reviews/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      body: input
    });
  }
  async refresh(id, scope) {
    return this.request(`/api/reviews/${encodeURIComponent(id)}/refresh`, {
      method: "POST",
      body: scope === void 0 ? {} : { scope }
    });
  }
  async latestFeedback(id) {
    return this.request(`/api/reviews/${encodeURIComponent(id)}/feedback`);
  }
  async cancelAgent(id) {
    await this.request(`/api/reviews/${encodeURIComponent(id)}/agent/cancel`, {
      method: "POST"
    });
  }
  async retryAgent(id) {
    return this.request(`/api/reviews/${encodeURIComponent(id)}/agent/retry`, {
      method: "POST"
    });
  }
  async events(id, options = {}) {
    const params = new URLSearchParams({
      wait: "25",
      ...options.after === void 0 ? {} : { after: String(options.after) }
    });
    return this.request(
      `/api/reviews/${encodeURIComponent(id)}/events?${params.toString()}`,
      {
        headers: { accept: "application/json" },
        ...options.signal === void 0 ? {} : { signal: options.signal }
      }
    );
  }
  async health() {
    return this.request("/api/health");
  }
  async authenticate(token) {
    await this.request("/api/auth", { method: "POST", body: { token } });
  }
  async logout() {
    await this.request("/api/auth/logout", { method: "POST" });
  }
};
function createApiClient(options = {}) {
  return new ApiClient(options);
}

// packages/ui/src/format.ts
function formatAge(iso, now = Date.now()) {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "unknown";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1e3));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
function shortSha(sha, length = 8) {
  if (sha === null) return "worktree";
  return sha.slice(0, length);
}

// packages/ui/src/review/ReviewDetail.tsx
var import_react20 = require("react");

// packages/core/src/review/coverage.ts
var COVERAGE_STATUSES = Object.freeze([
  "pending",
  "deep-reviewed",
  "light-reviewed",
  "manifest-only",
  "skipped",
  "no-hunks",
  "deferred",
  "failed"
]);
var UNRESOLVED_STATUSES = /* @__PURE__ */ new Set(["pending", "skipped", "deferred", "failed"]);
var POLICY_REASONS = /* @__PURE__ */ new Set(["binary", "ignored", "generated"]);
function summarizeCoverage(files) {
  const byStatus = Object.fromEntries(COVERAGE_STATUSES.map((status) => [status, 0]));
  const known = new Set(COVERAGE_STATUSES);
  for (const file of files) {
    if (!known.has(file.status)) continue;
    byStatus[file.status] += 1;
  }
  return { files: files.length, byStatus };
}
function isCoverageComplete(coverage) {
  if (coverage.incomplete === true) return false;
  const computed = summarizeCoverage(coverage.files);
  const knownCount = COVERAGE_STATUSES.reduce((sum, status) => sum + computed.byStatus[status], 0);
  if (knownCount !== coverage.files.length) return false;
  if (coverage.totals.files !== coverage.files.length) return false;
  for (const status of COVERAGE_STATUSES) {
    if ((coverage.totals.byStatus[status] ?? 0) !== computed.byStatus[status]) return false;
  }
  const persistedCount = COVERAGE_STATUSES.reduce(
    (sum, status) => sum + (coverage.totals.byStatus[status] ?? 0),
    0
  );
  if (persistedCount !== coverage.files.length) return false;
  return coverage.files.every((file) => {
    if (UNRESOLVED_STATUSES.has(file.status)) return false;
    if (file.status !== "manifest-only") return true;
    return file.reason !== void 0 && POLICY_REASONS.has(file.reason);
  });
}
function promotePendingToLight(coverage) {
  const files = coverage.files.map(
    (file) => file.status === "pending" ? { ...file, status: "light-reviewed" } : { ...file }
  );
  return {
    files,
    totals: summarizeCoverage(files),
    ...coverage.incomplete === true ? { incomplete: true } : {}
  };
}

// packages/core/src/review/fold.ts
var ReviewFoldError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewFoldError";
  }
};
function findComment(state, commentId) {
  const comment = state.comments.find((candidate) => candidate.id === commentId);
  if (comment === void 0) {
    throw new ReviewFoldError(`unknown comment: ${commentId}`);
  }
  return comment;
}
function fold(state, event) {
  if (event.reviewId !== state.id) {
    throw new ReviewFoldError(`event ${event.id} belongs to ${event.reviewId}, not ${state.id}`);
  }
  if (event.type === "review/created") {
    if (event.data.review.id !== event.reviewId) {
      throw new ReviewFoldError(
        `review payload ${event.data.review.id} belongs to a different review than ${event.reviewId}`
      );
    }
    return {
      ...structuredClone(event.data.review),
      version: 1,
      warnings: []
    };
  }
  const next = structuredClone(state);
  next.version += 1;
  next.warnings ??= [];
  switch (event.type) {
    case "round/created": {
      if (next.rounds.some((round) => round.no === event.data.round.no)) {
        throw new ReviewFoldError(`duplicate round: ${event.data.round.no}`);
      }
      const expected = next.rounds.length + 1;
      if (event.data.round.no !== expected) {
        throw new ReviewFoldError(`round order: expected ${expected}, got ${event.data.round.no}`);
      }
      next.rounds.push(structuredClone(event.data.round));
      break;
    }
    case "comment/added": {
      if (next.comments.some((comment) => comment.id === event.data.comment.id)) {
        throw new ReviewFoldError(`duplicate comment: ${event.data.comment.id}`);
      }
      next.comments.push(structuredClone(event.data.comment));
      break;
    }
    case "comment/replied": {
      const comment = findComment(next, event.data.commentId);
      comment.replies.push(structuredClone(event.data.reply));
      break;
    }
    case "comment/state": {
      findComment(next, event.data.commentId).state = event.data.state;
      break;
    }
    case "comment/edited": {
      const comment = findComment(next, event.data.commentId);
      comment.body = event.data.body;
      comment.editedAt = event.at;
      comment.editedBy = structuredClone(event.actor);
      break;
    }
    case "comment/deleted": {
      const comment = findComment(next, event.data.commentId);
      comment.deletedAt = event.at;
      comment.deletedBy = structuredClone(event.actor);
      break;
    }
    case "comment/anchor": {
      const comment = findComment(next, event.data.commentId);
      const anchor = structuredClone(event.data.anchor);
      const index = comment.anchors.findIndex((candidate) => candidate.round === anchor.round);
      if (index < 0) comment.anchors.push(anchor);
      else comment.anchors[index] = anchor;
      if (event.data.outcome !== void 0) {
        comment.outcomes.push(structuredClone(event.data.outcome));
      }
      break;
    }
    case "suggestion/state": {
      findComment(next, event.data.commentId).suggestionState = event.data.state;
      break;
    }
    case "fix/claim": {
      next.fixClaims ??= [];
      next.fixClaims.push(...structuredClone(event.data.claims));
      break;
    }
    case "finding/decision": {
      next.findingDecisions ??= [];
      next.findingDecisions.push(structuredClone(event.data.decision));
      if (event.data.comment !== void 0) {
        const comment = event.data.comment;
        if (next.comments.some((candidate) => candidate.id === comment.id)) {
          throw new ReviewFoldError(`duplicate comment: ${comment.id}`);
        }
        next.comments.push(structuredClone(comment));
      }
      if (event.data.deletedCommentId !== void 0) {
        const comment = findComment(next, event.data.deletedCommentId);
        if (comment.deletedAt === void 0) {
          comment.deletedAt = event.at;
          comment.deletedBy = structuredClone(event.actor);
        }
      }
      break;
    }
    case "review/updated": {
      if (event.data.title !== void 0) next.title = event.data.title;
      if (event.data.reviewer !== void 0) {
        next.reviewer = structuredClone(event.data.reviewer);
      }
      next.updatedAt = event.at;
      next.updatedBy = structuredClone(event.actor);
      break;
    }
    case "review/deleted": {
      next.deletedAt = event.at;
      next.deletedBy = structuredClone(event.actor);
      break;
    }
    case "suggestion/applied": {
      const comment = findComment(next, event.data.commentId);
      const alreadyApplied = comment.outcomes.some(
        (outcome) => outcome.round === event.data.round && outcome.status === "applied"
      );
      if (!alreadyApplied) {
        comment.outcomes.push({
          round: event.data.round,
          status: "applied",
          confidence: "high"
        });
        comment.suggestionState = "applied";
      }
      break;
    }
    case "review/closed": {
      next.status = "closed";
      next.closedAt ??= event.at;
      next.closeVerdict = event.data.verdict;
      break;
    }
    case "review/submitted": {
      const submission = structuredClone(event.data.submission);
      next.submissions ??= [];
      if (next.submissions.some((item) => item.submissionId === submission.submissionId)) {
        throw new ReviewFoldError(`duplicate submission: ${submission.submissionId}`);
      }
      next.submissions.push(submission);
      if (submission.verdict === "approve") {
        next.status = "closed";
        next.closedAt ??= event.at;
        next.closeVerdict ??= "approved";
      }
      break;
    }
    case "agent/coverage": {
      next.agent = {
        status: "queued",
        round: event.data.round,
        coverage: structuredClone(event.data.coverage),
        findings: [],
        shards: []
      };
      break;
    }
    case "agent/started": {
      next.agent = {
        ...next.agent?.coverage === void 0 ? {} : { coverage: next.agent.coverage },
        ...next.agent?.shards === void 0 ? {} : { shards: next.agent.shards },
        status: "running",
        jobId: event.data.jobId,
        round: event.data.round,
        startedAt: event.at,
        findings: []
      };
      break;
    }
    case "agent/shard": {
      next.agent ??= { status: "running", findings: [] };
      next.agent.shards ??= [];
      const index = next.agent.shards.findIndex((shard2) => shard2.shardId === event.data.shardId);
      const shard = {
        shardId: event.data.shardId,
        shardIndex: event.data.shardIndex,
        shardCount: event.data.shardCount,
        round: event.data.round,
        report: structuredClone(event.data.report)
      };
      if (index < 0) next.agent.shards.push(shard);
      else next.agent.shards[index] = shard;
      if (next.agent.coverage !== void 0 && event.data.paths !== void 0) {
        const covered = new Set(event.data.paths);
        const tier = event.data.tier ?? "deep";
        const files = next.agent.coverage.files.map((file) => {
          if (!covered.has(file.path) || file.status !== "pending") return file;
          const nextFile = {
            ...file,
            status: tier === "deep" ? "deep-reviewed" : "light-reviewed"
          };
          delete nextFile.reason;
          return nextFile;
        });
        next.agent.coverage = {
          ...next.agent.coverage,
          files,
          totals: summarizeCoverage(files)
        };
      }
      break;
    }
    case "agent/finding": {
      next.agent ??= { status: "running", findings: [] };
      next.agent.findings ??= [];
      next.agent.findings.push(structuredClone(event.data.finding));
      break;
    }
    case "agent/report": {
      const reportSkipped = event.data.report.skipped === true;
      const coverage = event.data.coverage !== void 0 ? structuredClone(event.data.coverage) : reportSkipped || next.agent?.coverage === void 0 ? next.agent?.coverage : promotePendingToLight(next.agent.coverage);
      let status;
      if (reportSkipped) status = "skipped";
      else if (coverage === void 0) status = "done";
      else status = isCoverageComplete(coverage) ? "done" : "partial";
      next.report = structuredClone(event.data.report);
      next.agent = {
        ...next.agent ?? {},
        status,
        round: event.data.report.round,
        findings: structuredClone(event.data.report.findings),
        ...coverage === void 0 ? {} : { coverage }
      };
      break;
    }
    case "agent/failed": {
      next.agent = {
        ...next.agent ?? {},
        status: "failed",
        error: event.data.message
      };
      break;
    }
    case "agent/retry": {
      const agent = next.agent ?? { status: "queued", findings: [] };
      const retryShards = new Set(event.data.shardIds);
      let coverage = agent.coverage;
      if (coverage !== void 0) {
        const files = coverage.files.map((file) => {
          if (file.shardId === void 0 || !retryShards.has(file.shardId) || file.status !== "failed" && file.status !== "pending") {
            return file;
          }
          const retried = { ...file, status: "pending" };
          delete retried.reason;
          return retried;
        });
        coverage = { ...coverage, files, totals: summarizeCoverage(files) };
      }
      next.agent = {
        ...agent,
        status: "queued",
        round: event.data.round,
        ...coverage === void 0 ? {} : { coverage }
      };
      delete next.agent.jobId;
      delete next.agent.startedAt;
      delete next.agent.error;
      break;
    }
  }
  return next;
}

// packages/core/src/review/final.ts
function isFinalReviewReport(review, report = review.report) {
  const latestRound = review.rounds.at(-1);
  if (report === void 0 || latestRound === void 0 || report.round !== latestRound.no) {
    return false;
  }
  const agent = review.agent;
  if (agent === void 0) return true;
  if (agent.status !== "done") return false;
  return agent.coverage === void 0 || isCoverageComplete(agent.coverage);
}

// packages/core/src/review/plan.ts
var DEFAULT_SHARD_LIMITS = Object.freeze({
  maxFiles: 12,
  maxPatchBytes: 12e4
});

// packages/core/src/review/aggregate.ts
var RISK_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};
function findingKey(finding) {
  return `${finding.file}\0${finding.lineStart}\0${finding.lineEnd}\0${finding.title}`;
}
function questionKey(question) {
  return `${question.file}\0${question.line}\0${question.question}`;
}
function mergeFindings(reports) {
  const findings = [];
  const seen = /* @__PURE__ */ new Set();
  for (const report of reports) {
    for (const finding of report.report.findings) {
      const key = findingKey(finding);
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ ...finding });
    }
  }
  return findings;
}
function mergeQuestions(reports) {
  const questions = [];
  const seen = /* @__PURE__ */ new Set();
  for (const report of reports) {
    for (const question of report.report.questions) {
      const key = questionKey(question);
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push({ ...question });
    }
  }
  return questions;
}
function mergeTests(reports) {
  const commands = [];
  const seen = /* @__PURE__ */ new Set();
  for (const report of reports) {
    for (const command of report.report.tests.commands) {
      const key = `${command.command}\0${command.result}\0${command.summary}`;
      if (seen.has(key)) continue;
      seen.add(key);
      commands.push({ ...command });
    }
  }
  return { ran: reports.some((report) => report.report.tests.ran), commands };
}
function mergeVerification(reports) {
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  for (const report of reports) {
    for (const item of report.report.verification) {
      const key = `${item.commentId}\0${item.status}\0${item.evidence}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ ...item });
    }
  }
  return entries;
}
function highestRisk(reports) {
  let result = "low";
  for (const report of reports) {
    if (RISK_ORDER[report.report.riskLevel] > RISK_ORDER[result]) {
      result = report.report.riskLevel;
    }
  }
  return result;
}
function mergeShardReports(input) {
  const findings = mergeFindings(input.reports);
  const summaryParts = input.reports.map((report) => report.report.summary.trim()).filter((summary2) => summary2 !== "");
  const summary = summaryParts.length === 0 ? "The review did not produce a shard report." : summaryParts.join("\n\n").slice(0, 2e4);
  return {
    schemaVersion: 1,
    summary,
    riskLevel: highestRisk(input.reports),
    findings,
    questions: mergeQuestions(input.reports),
    tests: mergeTests(input.reports),
    verification: mergeVerification(input.reports),
    reviewId: input.reviewId,
    round: input.round,
    backend: input.backend,
    rejected: input.reports.flatMap((item) => item.report.rejected),
    warnings: [...new Set(input.reports.flatMap((report) => report.report.warnings))],
    ...input.reports.some((item) => item.report.dirtyWorktree === true) ? { dirtyWorktree: true } : {},
    skipped: false
  };
}

// packages/ui/src/review/CommentComposer.tsx
var import_react9 = require("react");

// packages/ui/src/review/model.ts
function liveReportFor(agent, reviewId, round) {
  if (agent === void 0 || round === null) return null;
  const shards = (agent.shards ?? []).filter((shard) => shard.round === round).sort((left, right) => left.shardIndex - right.shardIndex);
  if (shards.length === 0) return null;
  const totalShards = Math.max(...shards.map((shard) => shard.shardCount), shards.length);
  const merged = mergeShardReports({
    reviewId,
    round,
    backend: "worker",
    reports: shards.map((shard) => ({ shardId: shard.shardId, report: shard.report }))
  });
  return {
    report: {
      ...merged,
      summary: "Provisional findings from completed shards."
    },
    completedShards: shards.length,
    totalShards
  };
}
var FIX_GROUPS = [
  { id: "addressed", label: "Addressed", description: "Reviewer or agent confirms a fix." },
  { id: "not-fixed", label: "Not fixed", description: "Still present in the latest round." },
  { id: "outdated", label: "Outdated", description: "The quoted code no longer exists." },
  {
    id: "needs-decision",
    label: "Needs decision",
    description: "Open, ambiguous or unchanged without a verdict."
  }
];
function filesForSnapshot(snapshot) {
  const present = new Map(snapshot.files.map((item) => [item.path, item]));
  const manifest = snapshot.manifest?.files;
  if (manifest === void 0) return snapshot.files;
  const files = [];
  for (const entry of manifest) {
    const existing = present.get(entry.path);
    if (existing !== void 0) {
      files.push(existing);
      continue;
    }
    files.push({
      path: entry.path,
      ...entry.oldPath === void 0 ? {} : { oldPath: entry.oldPath },
      status: entry.status,
      binary: entry.binary,
      oversized: entry.oversized,
      ...entry.ignored ? { ignored: true } : {},
      ...entry.conflicted === true ? { conflicted: true } : {},
      truncated: true,
      reason: entry.reason === "unreadable" ? "unreadable" : "diff-truncated",
      added: entry.added,
      deleted: entry.deleted,
      hunks: [],
      contentHash: null
    });
  }
  return files;
}
function buildDiffRows(file) {
  const rows = [];
  file.hunks.forEach((hunk, hunkIndex) => {
    rows.push({ key: `${file.path}:h:${hunkIndex}`, type: "hunk", hunk, hunkIndex, lineIndex: -1 });
    hunk.lines.forEach((line, lineIndex) => {
      rows.push({
        key: `${file.path}:l:${hunkIndex}:${lineIndex}`,
        type: "line",
        hunk,
        line,
        hunkIndex,
        lineIndex
      });
    });
  });
  return rows;
}
function firstChangedLine(file) {
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add" && line.newNo !== null) return { line: line.newNo, side: "new" };
      if (line.kind === "del" && line.oldNo !== null) return { line: line.oldNo, side: "old" };
    }
  }
  const first = file.hunks[0]?.lines[0];
  if (first !== void 0) {
    if (first.newNo !== null) return { line: first.newNo, side: "new" };
    if (first.oldNo !== null) return { line: first.oldNo, side: "old" };
  }
  return null;
}
function linesForSide(file, side) {
  return side === "new" ? file.newLines : file.oldLines;
}
function fileLineCount(file, side) {
  const lines = linesForSide(file, side);
  if (lines !== void 0) return lines.length;
  let max = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const no = side === "new" ? line.newNo : line.oldNo;
      if (no !== null && no > max) max = no;
    }
  }
  return max;
}
function selectedLines(file, side, lineStart, lineEnd) {
  const lines = linesForSide(file, side);
  if (lines === void 0) return [];
  return lines.slice(Math.max(0, lineStart - 1), Math.max(0, lineEnd));
}
function latestAnchor(comment) {
  return [...comment.anchors].sort((a, b) => a.round - b.round).at(-1);
}
function anchorForRound(comment, round) {
  const same = comment.anchors.find((anchor) => anchor.round === round);
  if (same !== void 0) return same;
  return [...comment.anchors].filter((anchor) => anchor.round <= round).sort((a, b) => a.round - b.round).at(-1);
}
function anchorHistory(comment) {
  const sorted = [...comment.anchors].sort((a, b) => a.round - b.round);
  const from = sorted[0];
  const to = sorted.at(-1);
  const lineChanged = from !== void 0 && to !== void 0 && from.lineStart !== to.lineStart;
  const pathChanged = from !== void 0 && to !== void 0 && from.path !== to.path;
  let label = to === void 0 ? "No anchor" : `line ${to.lineStart}`;
  if (lineChanged) label = `line ${from.lineStart} \u2192 ${to.lineStart}`;
  if (to !== void 0 && to.lineStart !== to.lineEnd) {
    label = `${to.lineStart}\u2013${to.lineEnd}`;
    if (lineChanged) label = `${from.lineStart} \u2192 ${label}`;
  }
  return { from, to, lineChanged, pathChanged, label };
}
function latestClaim(review, commentId) {
  return review.fixClaims?.filter((claim) => claim.commentId === commentId).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
}
function latestVerification(report, commentId) {
  return report?.verification?.filter((item) => item.commentId === commentId).at(-1);
}
function fixStatus(review, comment) {
  if (comment.state === "resolved") return "addressed";
  if (comment.state === "dismissed") return "needs-decision";
  const anchor = latestAnchor(comment);
  if (anchor?.state === "outdated") return "outdated";
  const claim = latestClaim(review, comment.id);
  const verification = latestVerification(review.report, comment.id);
  const fixed = claim?.status === "fixed" || verification?.status === "fixed" || comment.outcomes.some(
    (outcome) => outcome.status === "applied" || outcome.status === "addressed"
  );
  const notFixed = claim?.status === "not-fixed" || verification?.status === "not-fixed";
  if (fixed && notFixed) return "needs-decision";
  if (fixed) return "addressed";
  if (notFixed) return "not-fixed";
  if (anchor?.state === "ambiguous") return "needs-decision";
  const latestOutcome = [...comment.outcomes].sort((a, b) => a.round - b.round).at(-1);
  if (latestOutcome?.status === "unchanged" || latestOutcome?.status === "moved") {
    return "needs-decision";
  }
  return "needs-decision";
}
function actorSource(kind) {
  if (kind === "agent") return { label: "AI", tone: "info" };
  if (kind === "system") return { label: "System", tone: "warning" };
  return { label: "Human", tone: "neutral" };
}
function isTransferredComment(comment) {
  return comment.sourceFindingId !== void 0;
}
function fixCounts(review) {
  const counts = {
    addressed: 0,
    "not-fixed": 0,
    outdated: 0,
    "needs-decision": 0
  };
  for (const comment of review.comments) {
    if (comment.deletedAt !== void 0) continue;
    counts[fixStatus(review, comment)] += 1;
  }
  return counts;
}
function filterComments(review, filter) {
  if (filter === "all") {
    return review.comments.filter(
      (comment) => comment.deletedAt === void 0 || comment.replies.length > 0
    );
  }
  return review.comments.filter(
    (comment) => comment.deletedAt === void 0 && fixStatus(review, comment) === filter
  );
}
function roundCommentCount(review, round) {
  return review.comments.filter(
    (comment) => comment.deletedAt === void 0 && comment.anchors.some((anchor) => anchor.round === round)
  ).length;
}
function unresolvedComments(review) {
  return review.comments.filter(
    (comment) => comment.deletedAt === void 0 && comment.state === "open"
  );
}
function latestVerdict(review) {
  if (review.closeVerdict === "approved") return "approve";
  if (review.closeVerdict !== void 0) return review.closeVerdict;
  const submission = [...review.submissions ?? []].sort((a, b) => a.round - b.round).at(-1);
  if (submission !== void 0) return submission.verdict;
  return review.status === "closed" ? "closed" : "open";
}
function deltaPaths(current, previous) {
  if (previous === null) return new Set(current.files.map((file) => file.path));
  const previousByPath = new Map(previous.files.map((file) => [file.path, file]));
  const changed = /* @__PURE__ */ new Set();
  for (const file of current.files) {
    const before = previousByPath.get(file.path) ?? previousByPath.get(file.oldPath ?? "");
    if (before === void 0) {
      changed.add(file.path);
      continue;
    }
    if (before.contentHash !== file.contentHash || before.status !== file.status || before.added !== file.added || before.deleted !== file.deleted || before.path !== file.path || before.truncated !== file.truncated) {
      changed.add(file.path);
    }
  }
  return changed;
}
function parseReviewLocation(location) {
  const url = new URL(location, "http://local");
  const roundRaw = url.searchParams.get("round");
  const round = roundRaw === null ? void 0 : Number(roundRaw);
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const file = hash.get("file") ?? void 0;
  const lineRaw = hash.get("line");
  const line = lineRaw === null ? void 0 : Number(lineRaw);
  return {
    ...round !== void 0 && Number.isInteger(round) && round > 0 ? { round } : {},
    ...file !== void 0 && file !== "" ? { file } : {},
    ...line !== void 0 && Number.isInteger(line) && line > 0 ? { line } : {}
  };
}
function buildReviewLocation(id, state, extra = {}) {
  const params = new URLSearchParams();
  if (state.round !== void 0) params.set("round", String(state.round));
  if (extra.tab !== void 0 && extra.tab !== "conversation") params.set("tab", extra.tab);
  const query = params.toString();
  const hash = new URLSearchParams();
  if (state.file !== void 0) hash.set("file", state.file);
  if (state.line !== void 0) hash.set("line", String(state.line));
  const fragment = hash.toString();
  return `/review/${encodeURIComponent(id)}${query === "" ? "" : `?${query}`}${fragment === "" ? "" : `#${fragment}`}`;
}
function parseTab(value) {
  return value === "files" || value === "report" || value === "signals" ? value : "conversation";
}
function validateCommentDraft(draft, maxLine) {
  const errors = {};
  if (draft.body.trim() === "") errors.body = "Write a comment before posting.";
  if (draft.body.length > 32e3) errors.body = "Comments are limited to 32,000 characters.";
  if (!Number.isInteger(draft.lineStart) || !Number.isInteger(draft.lineEnd) || draft.lineStart < 1 || draft.lineEnd < draft.lineStart || maxLine > 0 && draft.lineEnd > maxLine) {
    errors.range = maxLine > 0 ? `Choose a line between 1 and ${maxLine}.` : "Choose a line that exists in this diff.";
  }
  if (draft.suggestionEnabled) {
    if (draft.original.trim() === "") {
      errors.suggestion = "The original snippet is required for a suggestion.";
    } else if (draft.replacement.trim() === "") {
      errors.suggestion = "Write the replacement code.";
    } else if (draft.original === draft.replacement) {
      errors.suggestion = "The replacement is identical to the original.";
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
var TEST_PATH = /(^|\/)(__tests__|tests?|specs?)\/|\.(test|spec)\.[a-z0-9]+$/i;
var LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum)$/i;
var MIGRATION = /(^|\/)migrations?\//i;
var SECRET = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(api[_-]?key|secret|password|access[_-]?token)\b\s*[:=]\s*['"]?[A-Za-z0-9_-]{12,})/i;
var TODO = /\b(TODO|FIXME|HACK|XXX)\b/;
var MERGE_MARKER = /^(<{7}|={7}|>{7})/;
function addedLines(file) {
  const result = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add" && line.newNo !== null) {
        result.push({ line: line.newNo, text: line.text });
      }
    }
  }
  return result;
}
function deriveSignals(snapshot) {
  const signals = [];
  const seen = /* @__PURE__ */ new Set();
  function add(signal) {
    if (seen.has(signal.id)) return;
    seen.add(signal.id);
    signals.push(signal);
  }
  for (const file of snapshot.files) {
    if (TEST_PATH.test(file.path)) {
      add({
        id: `tests:${file.path}`,
        tone: "warning",
        label: "Test file changed",
        detail: `${file.path} was ${file.status}. Review coverage before merging.`,
        file: file.path
      });
    }
    if (LOCKFILE.test(file.path)) {
      add({
        id: `lockfile:${file.path}`,
        tone: "warning",
        label: "Dependency lockfile changed",
        detail: "Check that dependency changes are intentional and reproducible.",
        file: file.path
      });
    }
    if (MIGRATION.test(file.path)) {
      add({
        id: `migration:${file.path}`,
        tone: "danger",
        label: "Migration changed",
        detail: "Destructive or missing migrations can break production data.",
        file: file.path
      });
    }
    if (file.binary) {
      add({
        id: `binary:${file.path}`,
        tone: "info",
        label: "Binary file",
        detail: "Binary changes cannot be reviewed as text.",
        file: file.path
      });
    }
    if (file.truncated === true || file.oversized) {
      add({
        id: `truncated:${file.path}`,
        tone: "warning",
        label: "Diff truncated",
        detail: "Part of this file is not visible in the review surface.",
        file: file.path
      });
    }
    if (file.status === "renamed" && file.oldPath !== void 0) {
      add({
        id: `renamed:${file.path}`,
        tone: "info",
        label: "File renamed",
        detail: `${file.oldPath} \u2192 ${file.path}`,
        file: file.path
      });
    }
    if (file.status === "submodule") {
      add({
        id: `submodule:${file.path}`,
        tone: "info",
        label: "Submodule updated",
        detail: "The pinned submodule commit changed.",
        file: file.path
      });
    }
    if (file.added + file.deleted > 500) {
      add({
        id: `large:${file.path}`,
        tone: "info",
        label: "Large change",
        detail: `${file.added} additions and ${file.deleted} deletions.`,
        file: file.path
      });
    }
    for (const line of addedLines(file)) {
      if (TODO.test(line.text)) {
        add({
          id: `todo:${file.path}:${line.line}`,
          tone: "info",
          label: "New TODO marker",
          detail: line.text.trim().slice(0, 200),
          file: file.path,
          line: line.line
        });
      }
      if (MERGE_MARKER.test(line.text)) {
        add({
          id: `merge:${file.path}:${line.line}`,
          tone: "danger",
          label: "Merge marker added",
          detail: "A conflict marker was added to the file.",
          file: file.path,
          line: line.line
        });
      } else if (SECRET.test(line.text)) {
        add({
          id: `secret:${file.path}:${line.line}`,
          tone: "danger",
          label: "Possible secret",
          detail: "A credential-like value was added. Confirm it is not committed.",
          file: file.path,
          line: line.line
        });
      }
    }
  }
  return signals;
}
function matchesFilter(value, filter) {
  if (filter === "all") return true;
  if (typeof filter === "object") return filter.size === 0 || filter.has(value);
  return value === filter;
}
function filterFindings(findings, severity, category) {
  return (findings ?? []).filter(
    (finding) => matchesFilter(finding.severity, severity) && matchesFilter(finding.category, category)
  );
}
function findingCounts(report) {
  const counts = {
    blocker: 0,
    major: 0,
    minor: 0,
    nit: 0
  };
  for (const finding of report?.findings ?? [])
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  return counts;
}
function commentsAtLine(comments, round, path, line, side) {
  return comments.filter((comment) => {
    const anchor = anchorForRound(comment, round);
    return anchor !== void 0 && anchor.path === path && anchor.side === side && anchor.lineStart === line;
  });
}
function diffFileId(path) {
  return `diff-file-${encodeURIComponent(path)}`;
}
function diffLineId(path, side, line) {
  return `diff-line-${encodeURIComponent(path)}-${side}-${line}`;
}

// packages/ui/src/review/CommentComposer.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
function CommentComposer({
  file,
  side,
  lineStart,
  lineEnd,
  maxLine,
  submitting = false,
  serverError,
  initialDraft,
  onCancel,
  onSubmit,
  onDraftChange
}) {
  const [body, setBody] = (0, import_react9.useState)(initialDraft?.body ?? "");
  const [start, setStart] = (0, import_react9.useState)(initialDraft?.lineStart ?? lineStart);
  const [end, setEnd] = (0, import_react9.useState)(initialDraft?.lineEnd ?? lineEnd);
  const [suggestionEnabled, setSuggestionEnabled] = (0, import_react9.useState)(
    initialDraft?.suggestionEnabled ?? false
  );
  const suggested = (0, import_react9.useMemo)(
    () => selectedLines(file, side, start, end).join("\n"),
    [file, side, start, end]
  );
  const [original, setOriginal] = (0, import_react9.useState)(() => initialDraft?.original || suggested);
  const [replacement, setReplacement] = (0, import_react9.useState)(initialDraft?.replacement ?? "");
  const [errors, setErrors] = (0, import_react9.useState)({});
  const lineLabel2 = start === end ? `line ${start}` : `lines ${start}\u2013${end}`;
  const restored = initialDraft !== void 0 && (initialDraft.body ?? "") !== "";
  (0, import_react9.useEffect)(() => {
    onDraftChange?.({
      body,
      lineStart: start,
      lineEnd: end,
      suggestionEnabled,
      original: suggestionEnabled ? original || suggested : "",
      replacement
    });
  }, [body, start, end, suggestionEnabled, original, replacement, suggested, onDraftChange]);
  function submit() {
    const draft = {
      body,
      lineStart: start,
      lineEnd: end,
      suggestionEnabled,
      original: suggestionEnabled ? original || suggested : "",
      replacement
    };
    const result = validateCommentDraft(draft, maxLine);
    setErrors(result.errors);
    if (!result.ok) return;
    onSubmit(draft);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
    "form",
    {
      className: "cr-composer",
      "aria-label": `Comment on ${lineLabel2}`,
      onSubmit: (event) => {
        event.preventDefault();
        submit();
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("header", { className: "cr-composer-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "cr-composer-title", children: [
            "Comment on ",
            lineLabel2
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "cr-meta", children: [
            file.path,
            " \xB7 ",
            side,
            " side"
          ] })
        ] }),
        restored ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "cr-draft-note", role: "status", children: "Draft restored from this browser. It will be discarded after posting or cancel." }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "cr-composer-range", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            Input,
            {
              label: "Start line",
              type: "number",
              min: 1,
              max: maxLine,
              value: start,
              onChange: (event) => {
                const value = Number(event.target.value);
                setStart(value);
                if (value > end) setEnd(value);
                setErrors((current) => ({ ...current, range: void 0 }));
              },
              error: errors.range
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            Input,
            {
              label: "End line",
              type: "number",
              min: 1,
              max: maxLine,
              value: end,
              onChange: (event) => setEnd(Number(event.target.value))
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          Textarea,
          {
            label: "Comment",
            value: body,
            onChange: (event) => setBody(event.target.value),
            rows: 3,
            placeholder: "What should change, and why?",
            error: errors.body,
            autoFocus: true
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: "cr-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "input",
            {
              type: "checkbox",
              checked: suggestionEnabled,
              onChange: (event) => {
                setSuggestionEnabled(event.target.checked);
                if (event.target.checked && original === "") setOriginal(suggested);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: "Add a code suggestion" })
        ] }),
        suggestionEnabled ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "cr-composer-suggestion", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            Input,
            {
              label: "Original snippet",
              value: original,
              onChange: (event) => setOriginal(event.target.value),
              hint: "Must match the selected lines.",
              error: errors.suggestion
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            Textarea,
            {
              label: "Replacement",
              value: replacement,
              onChange: (event) => setReplacement(event.target.value),
              rows: 3,
              placeholder: "Suggested replacement code"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "cr-suggestion-preview", "aria-label": "Suggestion preview", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "cr-suggestion-block cr-suggestion-old", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "cr-suggestion-caption", children: "Before" }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("pre", { children: original || suggested || "(empty)" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "cr-suggestion-block cr-suggestion-new", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "cr-suggestion-caption", children: "After" }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("pre", { children: replacement || "(empty)" })
            ] })
          ] })
        ] }) : null,
        serverError !== null && serverError !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "cr-error", role: "alert", children: serverError }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "cr-composer-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { type: "submit", loading: submitting, children: "Post comment" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { variant: "ghost", onClick: onCancel, children: "Cancel" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "cr-meta", children: "c comments \xB7 Esc closes" })
        ] })
      ]
    }
  );
}

// packages/ui/src/review/CommentThread.tsx
var import_react10 = require("react");
var import_jsx_runtime12 = require("react/jsx-runtime");
function stateTone(state) {
  if (state === "resolved") return "success";
  if (state === "dismissed") return "neutral";
  return "warning";
}
function CommentThread({
  comment,
  active = false,
  compact = false,
  readOnly = false,
  pending = false,
  onReply,
  onState,
  onEdit,
  onDelete,
  onJump,
  onFocus
}) {
  const [replyOpen, setReplyOpen] = (0, import_react10.useState)(false);
  const [reply, setReply] = (0, import_react10.useState)("");
  const [replyError, setReplyError] = (0, import_react10.useState)(null);
  const [editOpen, setEditOpen] = (0, import_react10.useState)(false);
  const [editBody, setEditBody] = (0, import_react10.useState)(comment.body);
  const [editError, setEditError] = (0, import_react10.useState)(null);
  const [deleteConfirm, setDeleteConfirm] = (0, import_react10.useState)(false);
  const [busy, setBusy] = (0, import_react10.useState)(false);
  const history = anchorHistory(comment);
  const source = actorSource(comment.author.kind);
  const transferred = isTransferredComment(comment);
  const quoteLines = history.to?.quote.split("\n") ?? [];
  const shownQuote = quoteLines.slice(0, compact ? 6 : 14);
  const anchor = history.to;
  async function submitReply() {
    if (reply.trim() === "") {
      setReplyError("Write a reply before sending.");
      return;
    }
    setBusy(true);
    setReplyError(null);
    try {
      await onReply(comment, reply);
      setReply("");
      setReplyOpen(false);
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  }
  async function changeState(state) {
    setBusy(true);
    try {
      await onState(comment, state);
    } finally {
      setBusy(false);
    }
  }
  if (comment.deletedAt !== void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
      "article",
      {
        id: `comment-${comment.id}`,
        className: ["cr-thread", "cr-thread-deleted", compact ? "cr-thread-compact" : ""].filter(Boolean).join(" "),
        "aria-label": `Deleted comment by ${comment.author.name}`,
        "data-testid": `comment-${comment.id}`,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("header", { className: "cr-thread-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-avatar", "aria-hidden": "true", children: comment.author.name.slice(0, 1).toUpperCase() }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-thread-author", children: comment.author.name }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("time", { className: "cr-meta", dateTime: comment.createdAt, title: comment.createdAt, children: formatAge(comment.createdAt) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Badge, { tone: "neutral", children: "deleted" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "cr-thread-tombstone", children: "Comment deleted" }),
          comment.replies.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ol", { className: "cr-replies", "aria-label": "Replies", children: comment.replies.map((item) => {
            const replySource = actorSource(item.author.kind);
            return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { className: "cr-reply", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-reply-head", children: [
                item.author.name === replySource.label ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { children: item.author.name }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Badge, { tone: replySource.tone, children: replySource.label }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("time", { className: "cr-meta", dateTime: item.createdAt, children: formatAge(item.createdAt) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "cr-reply-body", children: item.body })
            ] }, item.id);
          }) }) : null
        ]
      }
    );
  }
  async function submitEdit() {
    const body = editBody.trim();
    if (body === "") {
      setEditError("Write a comment before saving.");
      return;
    }
    if (onEdit === void 0) return;
    setBusy(true);
    setEditError(null);
    try {
      await onEdit(comment, body);
      setEditOpen(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not save the comment.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (onDelete === void 0) return;
    setBusy(true);
    try {
      await onDelete(comment);
      setDeleteConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
    "article",
    {
      id: `comment-${comment.id}`,
      className: ["cr-thread", compact ? "cr-thread-compact" : "", active ? "cr-thread-active" : ""].filter(Boolean).join(" "),
      "aria-label": `Comment by ${comment.author.name}`,
      "data-testid": `comment-${comment.id}`,
      onFocus: () => onFocus?.(comment),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("header", { className: "cr-thread-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-avatar", "aria-hidden": "true", children: comment.author.name.slice(0, 1).toUpperCase() }),
          comment.author.name === source.label ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-thread-author", children: comment.author.name }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Badge, { tone: source.tone, children: source.label }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("time", { className: "cr-meta", dateTime: comment.createdAt, title: comment.createdAt, children: formatAge(comment.createdAt) }),
          comment.editedAt !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "cr-meta", title: comment.editedAt, children: [
            "edited ",
            formatAge(comment.editedAt)
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Badge, { tone: stateTone(comment.state), children: comment.state })
        ] }),
        anchor !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
          "button",
          {
            type: "button",
            className: "cr-anchor-jump",
            onClick: () => onJump(comment),
            "aria-label": `${anchor.path} ${history.label}${anchor.state !== "active" ? ` ${anchor.state}` : ""} (jump to line)`,
            title: `Jump to ${anchor.path} ${history.label}`,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-anchor-path", children: history.pathChanged && history.from !== void 0 ? `${history.from.path} \u2192 ${anchor.path}` : anchor.path }),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-anchor-line", children: history.label }),
              anchor.state !== "active" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Badge, { tone: anchor.state === "ambiguous" ? "warning" : "danger", children: anchor.state })
              ] }) : null
            ]
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "cr-thread-body", children: comment.body }),
        shownQuote.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("pre", { className: "cr-quote", "aria-label": "Quoted code", children: [
          shownQuote.join("\n"),
          quoteLines.length > shownQuote.length ? "\n\u2026" : ""
        ] }) : null,
        comment.suggestion !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-suggestion", "aria-label": "Suggested change", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-suggestion-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-suggestion-label", children: "Suggested change" }),
            comment.suggestionState !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Badge, { tone: comment.suggestionState === "applied" ? "success" : "neutral", children: comment.suggestionState }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-suggestion-block cr-suggestion-old", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-suggestion-caption", children: "Before" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("pre", { children: comment.suggestion.original })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-suggestion-block cr-suggestion-new", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-suggestion-caption", children: "After" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("pre", { children: comment.suggestion.replacement })
          ] })
        ] }) : null,
        comment.replies.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ol", { className: "cr-replies", "aria-label": "Replies", children: comment.replies.map((item) => {
          const replySource = actorSource(item.author.kind);
          return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { className: "cr-reply", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-reply-head", children: [
              item.author.name === replySource.label ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { children: item.author.name }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Badge, { tone: replySource.tone, children: replySource.label }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("time", { className: "cr-meta", dateTime: item.createdAt, children: formatAge(item.createdAt) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "cr-reply-body", children: item.body })
          ] }, item.id);
        }) }) : null,
        !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("footer", { className: "cr-thread-actions", children: [
          comment.state === "open" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Button,
              {
                size: "small",
                variant: "secondary",
                loading: busy,
                onClick: () => void changeState("resolved"),
                children: "Resolve"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Button,
              {
                size: "small",
                variant: "ghost",
                loading: busy,
                onClick: () => void changeState("dismissed"),
                children: "Dismiss"
              }
            )
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Button,
            {
              size: "small",
              variant: "secondary",
              loading: busy,
              onClick: () => void changeState("open"),
              children: "Reopen"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Button,
            {
              size: "small",
              variant: "ghost",
              onClick: () => setReplyOpen((value) => !value),
              "aria-expanded": replyOpen,
              children: "Reply"
            }
          ),
          onEdit !== void 0 && !transferred ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Button,
            {
              size: "small",
              variant: "ghost",
              onClick: () => {
                setEditBody(comment.body);
                setEditError(null);
                setEditOpen(true);
              },
              children: "Edit"
            }
          ) : null,
          onDelete !== void 0 && !transferred ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Button,
            {
              size: "small",
              variant: "ghost",
              onClick: () => setDeleteConfirm(true),
              disabled: deleteConfirm,
              children: "Delete"
            }
          ) : null,
          anchor !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "small", variant: "ghost", onClick: () => onJump(comment), children: "Jump to line" }) : null,
          pending ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "cr-meta", children: "Saving\u2026" }) : null
        ] }) : null,
        replyOpen && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-reply-form", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Textarea,
            {
              label: `Reply to ${comment.author.name}`,
              value: reply,
              onChange: (event) => setReply(event.target.value),
              rows: 3,
              error: replyError ?? void 0,
              placeholder: "Reply in the thread\u2026"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-inline-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "small", loading: busy, onClick: () => void submitReply(), children: "Send reply" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Button,
              {
                size: "small",
                variant: "ghost",
                onClick: () => {
                  setReplyOpen(false);
                  setReplyError(null);
                },
                children: "Cancel"
              }
            )
          ] })
        ] }) : null,
        editOpen && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-reply-form", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Textarea,
            {
              label: "Edit comment",
              value: editBody,
              onChange: (event) => setEditBody(event.target.value),
              rows: 4,
              error: editError ?? void 0
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-inline-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "small", loading: busy, onClick: () => void submitEdit(), children: "Save" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Button,
              {
                size: "small",
                variant: "ghost",
                onClick: () => {
                  setEditOpen(false);
                  setEditError(null);
                },
                children: "Cancel"
              }
            )
          ] })
        ] }) : null,
        deleteConfirm && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "cr-thread-delete-confirm", role: "group", "aria-label": "Delete comment", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: "Delete this comment?" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "small", variant: "danger", loading: busy, onClick: () => void confirmDelete(), children: "Confirm delete" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Button,
            {
              size: "small",
              variant: "ghost",
              onClick: () => setDeleteConfirm(false),
              disabled: busy,
              children: "Cancel"
            }
          )
        ] }) : null
      ]
    }
  );
}

// packages/ui/src/review/DiffViewer.tsx
var import_react16 = require("react");

// packages/ui/src/review/FullFileDialog.tsx
var import_react15 = require("react");

// packages/ui/src/review/InlineFinding.tsx
var import_react12 = require("react");

// packages/ui/src/review/FindingDecisionControls.tsx
var import_react11 = require("react");
var import_jsx_runtime13 = require("react/jsx-runtime");
function actionLabel(state) {
  return state === "accepted" ? "Accept finding" : "Dismiss finding";
}
function FindingDecisionControls({
  finding,
  decision,
  showStatus = true,
  readOnly = false,
  pending = false,
  error,
  onDecide
}) {
  const [draftState, setDraftState] = (0, import_react11.useState)(void 0);
  const [note, setNote] = (0, import_react11.useState)("");
  if (finding.kind === "praise" && decision === void 0) return null;
  const showActions = !readOnly && finding.kind !== "praise" && onDecide !== void 0;
  function openForm(state) {
    if (draftState === void 0) setNote(decision?.note ?? "");
    setDraftState(state);
  }
  function closeForm() {
    setDraftState(void 0);
    setNote("");
  }
  async function submit() {
    if (draftState === void 0 || onDecide === void 0) return;
    const trimmed = note.trim();
    const ok = await onDecide(finding, draftState, trimmed === "" ? void 0 : trimmed);
    if (ok) closeForm();
  }
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "cr-finding-decision", "aria-label": "Finding decision", children: [
    decision !== void 0 && (showStatus || decision.note !== void 0) ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "cr-finding-decision-status", children: [
      showStatus ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Badge, { tone: decision.state === "accepted" ? "success" : "neutral", children: decision.state === "accepted" ? "Accepted" : "Dismissed" }) : null,
      decision.note !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "cr-finding-decision-note", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "cr-finding-decision-note-label", children: "Note to the agent:" }),
        " ",
        decision.note
      ] }) : null
    ] }) : null,
    showActions ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "cr-finding-decision-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        Button,
        {
          size: "small",
          variant: "secondary",
          "aria-pressed": decision?.state === "accepted",
          disabled: pending,
          onClick: () => openForm("accepted"),
          children: "Accept"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        Button,
        {
          size: "small",
          variant: "secondary",
          "aria-pressed": decision?.state === "dismissed",
          disabled: pending,
          onClick: () => openForm("dismissed"),
          children: "Dismiss"
        }
      )
    ] }) : null,
    showActions && draftState !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
      "form",
      {
        className: "cr-finding-decision-editor",
        "aria-label": actionLabel(draftState),
        onSubmit: (event) => {
          event.preventDefault();
          void submit();
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
            Textarea,
            {
              label: "Note for the agent (optional)",
              hint: "Sent with the next feedback package. Leave empty to decide without a note.",
              value: note,
              maxLength: 4e3,
              rows: 3,
              autoFocus: true,
              onChange: (event) => setNote(event.target.value)
            }
          ),
          error !== void 0 && error !== null ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "cr-finding-decision-error", role: "alert", children: error }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "cr-finding-decision-editor-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              Button,
              {
                type: "submit",
                variant: draftState === "accepted" ? "primary" : "secondary",
                loading: pending,
                children: actionLabel(draftState)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { type: "button", variant: "secondary", onClick: closeForm, children: "Cancel" })
          ] })
        ]
      }
    ) : null
  ] });
}

// packages/ui/src/review/InlineFinding.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
function severityLetter(severity) {
  return severity === "blocker" ? "B" : severity === "major" ? "M" : severity === "minor" ? "m" : "n";
}
function severityTone(severity) {
  return severity === "blocker" ? "danger" : severity === "major" ? "warning" : severity === "minor" ? "info" : "neutral";
}
function InlineFinding({
  finding,
  decision,
  readOnly = false,
  pending = false,
  error,
  onDecide,
  onOpenFinding
}) {
  const [expanded, setExpanded] = (0, import_react12.useState)(false);
  const bodyId = `finding-body-${(0, import_react12.useId)()}`;
  const lines = finding.lineStart === finding.lineEnd ? `line ${finding.lineStart}` : `lines ${finding.lineStart}\u2013${finding.lineEnd}`;
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
    "article",
    {
      role: "cell",
      className: [
        "cr-inline-finding",
        `cr-risk-${finding.severity}`,
        expanded ? "cr-inline-finding-expanded" : "cr-inline-finding-collapsed"
      ].filter(Boolean).join(" "),
      "aria-label": `${finding.severity} finding: ${finding.title}`,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
          "button",
          {
            type: "button",
            className: "cr-inline-finding-header",
            "aria-expanded": expanded,
            "aria-controls": expanded ? bodyId : void 0,
            "aria-label": `${expanded ? "Collapse" : "Expand"} finding ${finding.title}`,
            onClick: () => setExpanded((value) => !value),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "cr-inline-finding-toggle", "aria-hidden": "true", children: expanded ? "\u25BE" : "\u25B8" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "cr-inline-finding-severity", "aria-hidden": "true", children: severityLetter(finding.severity) }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "cr-inline-finding-main", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "cr-inline-finding-head", children: [
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("strong", { children: finding.title }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "cr-meta", children: [
                  finding.category,
                  " \xB7 ",
                  lines,
                  " \xB7 agent"
                ] })
              ] }) })
            ]
          }
        ),
        expanded ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "cr-inline-finding-body", id: bodyId, children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "cr-inline-finding-rationale", children: finding.rationale }),
          finding.evidence.trim() !== "" || finding.suggestion !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("details", { className: "cr-inline-finding-details", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("summary", { children: "Evidence and suggestion" }),
            finding.evidence.trim() !== "" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("pre", { className: "cr-inline-finding-evidence", children: finding.evidence }) : null,
            finding.suggestion !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "cr-inline-finding-suggestion", children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "cr-suggestion-caption", children: "Suggested change" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("pre", { children: finding.suggestion.replacement })
            ] }) : null
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "cr-inline-finding-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Badge, { tone: severityTone(finding.severity), children: finding.severity }),
            onOpenFinding !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "button",
              {
                type: "button",
                className: "cr-link-button",
                onClick: () => onOpenFinding(finding),
                children: "Open in report"
              }
            ) : null
          ] }),
          onDecide !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
            FindingDecisionControls,
            {
              finding,
              decision,
              readOnly,
              pending,
              error: error ?? null,
              onDecide
            }
          ) : null
        ] }) : null
      ]
    }
  );
}

// packages/ui/src/review/InlineQuestion.tsx
var import_react14 = require("react");

// packages/ui/src/review/ThreadConversation.tsx
var import_react13 = require("react");
var import_jsx_runtime15 = require("react/jsx-runtime");
var noReply = async () => void 0;
var noState = async () => void 0;
var noJump = () => void 0;
function ThreadConversation({
  comments,
  action = "comment",
  readOnly = false,
  activeCommentId,
  pendingCommentId,
  onReply,
  onState,
  onEdit,
  onDelete,
  onJump,
  onFocus,
  onAdd
}) {
  const [addOpen, setAddOpen] = (0, import_react13.useState)(false);
  const [body, setBody] = (0, import_react13.useState)("");
  const [error, setError] = (0, import_react13.useState)(null);
  const [busy, setBusy] = (0, import_react13.useState)(false);
  const canAdd = !readOnly && onAdd !== void 0;
  const threadReadOnly = readOnly || onReply === void 0 || onState === void 0;
  const isAnswer = action === "answer";
  if (comments.length === 0 && !canAdd) return null;
  async function submit() {
    if (body.trim() === "") {
      setError(isAnswer ? "Write an answer before sending." : "Write a comment before posting.");
      return;
    }
    if (onAdd === void 0) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(body.trim());
      setBody("");
      setAddOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your message.");
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
    "section",
    {
      className: "cr-topic-thread",
      "aria-label": isAnswer ? "Question thread" : "Finding thread",
      children: [
        comments.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ol", { className: "cr-topic-thread-list", "aria-label": isAnswer ? "Answers" : "Comments", children: comments.map((comment) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          CommentThread,
          {
            comment,
            compact: true,
            readOnly: threadReadOnly,
            active: activeCommentId === comment.id,
            pending: pendingCommentId === comment.id,
            onReply: onReply ?? noReply,
            onState: onState ?? noState,
            onJump: onJump ?? noJump,
            ...onEdit === void 0 ? {} : { onEdit },
            ...onDelete === void 0 ? {} : { onDelete },
            ...onFocus === void 0 ? {} : { onFocus }
          }
        ) }, comment.id)) }) : null,
        canAdd && !addOpen ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "cr-topic-thread-actions", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Button, { size: "small", variant: "secondary", onClick: () => setAddOpen(true), children: isAnswer ? "Answer" : "Comment" }) }) : null,
        canAdd && addOpen ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
          "form",
          {
            className: "cr-topic-thread-form",
            onSubmit: (event) => {
              event.preventDefault();
              void submit();
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                Textarea,
                {
                  label: isAnswer ? "Your answer" : "Your comment",
                  value: body,
                  rows: 3,
                  disabled: busy,
                  onChange: (event) => {
                    setBody(event.target.value);
                    setError(null);
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "cr-meta", children: isAnswer ? "Saved as a comment on this line and visible in the diff." : "Saved as a comment on this finding line and visible in the diff." }),
              error !== null ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "cr-topic-thread-error", role: "alert", children: error }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "cr-topic-thread-form-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Button, { type: "submit", size: "small", disabled: busy, children: isAnswer ? "Send answer" : "Post comment" }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                  Button,
                  {
                    type: "button",
                    size: "small",
                    variant: "ghost",
                    disabled: busy,
                    onClick: () => {
                      setAddOpen(false);
                      setBody("");
                      setError(null);
                    },
                    children: "Cancel"
                  }
                )
              ] })
            ]
          }
        ) : null
      ]
    }
  );
}

// packages/ui/src/review/InlineQuestion.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
function InlineQuestion({
  question,
  comments = [],
  readOnly = false,
  activeCommentId,
  pendingCommentId,
  onReply,
  onState,
  onEdit,
  onDelete,
  onJump,
  onFocus,
  onAnswer
}) {
  const [expanded, setExpanded] = (0, import_react14.useState)(false);
  const bodyId = `question-body-${(0, import_react14.useId)()}`;
  const answerCount = comments.length;
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
    "article",
    {
      className: [
        "cr-inline-question",
        expanded ? "cr-inline-question-expanded" : "cr-inline-question-collapsed"
      ].filter(Boolean).join(" "),
      role: "cell",
      "aria-label": `question: ${question.question}`,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "cr-inline-question-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
            "button",
            {
              type: "button",
              className: "cr-inline-question-header",
              "aria-expanded": expanded,
              "aria-controls": expanded ? bodyId : void 0,
              "aria-label": expanded ? "Collapse question" : "Expand question",
              onClick: () => setExpanded((value) => !value),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "cr-inline-question-toggle", "aria-hidden": "true", children: expanded ? "\u25BE" : "\u25B8" }),
                /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "cr-inline-question-mark", "aria-hidden": "true", children: "?" }),
                /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "cr-inline-question-main", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { className: "cr-inline-question-head", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Badge, { tone: "info", children: "question" }),
                  /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { className: "cr-meta", children: [
                    "line ",
                    question.line
                  ] }),
                  answerCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { className: "cr-meta", children: [
                    answerCount,
                    " ",
                    answerCount === 1 ? "answer" : "answers"
                  ] }) : null
                ] }) })
              ]
            }
          ),
          !expanded && onAnswer !== void 0 && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
            "button",
            {
              type: "button",
              className: "cr-inline-question-cta",
              "aria-label": "Answer question",
              onClick: () => setExpanded(true),
              children: "Answer"
            }
          ) : null
        ] }),
        expanded ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "cr-inline-question-body", id: bodyId, children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "cr-inline-question-text", children: question.question }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { className: "cr-inline-question-why", children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "cr-meta", children: "Why:" }),
            " ",
            question.why
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
            ThreadConversation,
            {
              comments,
              action: "answer",
              readOnly,
              activeCommentId,
              pendingCommentId,
              onReply,
              onState,
              onEdit,
              onDelete,
              onJump,
              onFocus,
              onAdd: onAnswer
            }
          )
        ] }) : null
      ]
    }
  );
}

// packages/ui/src/review/FullFileDialog.tsx
var import_jsx_runtime17 = require("react/jsx-runtime");
var MAX_FULL_FILE_LINES = 2e3;
var EMPTY_FINDING_DECISIONS = /* @__PURE__ */ new Map();
var numberFormat = new Intl.NumberFormat("en-US");
var TOUCH_LONG_PRESS_MS = 450;
var TOUCH_MOVE_TOLERANCE_PX = 8;
function sideLabel(side) {
  return side === "new" ? "Current" : "Base";
}
function changedLines(file, side) {
  const lines = /* @__PURE__ */ new Set();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (side === "new" && line.kind === "add" && line.newNo !== null) lines.add(line.newNo);
      if (side === "old" && line.kind === "del" && line.oldNo !== null) lines.add(line.oldNo);
    }
  }
  return lines;
}
function unavailableMessage(file) {
  if (file.binary) return "Binary files cannot be displayed as text.";
  if (file.oversized) return "This file is too large to include in the snapshot.";
  if (file.truncated)
    return "The snapshot omitted this file's full content because of a size limit.";
  if (file.reason === "unreadable")
    return "This file could not be read when the snapshot was built.";
  if (file.reason === "diff-truncated")
    return "This file fell beyond the diff cap, so its full content is unavailable.";
  if (file.ignored) return "This path is ignored and its content was not captured.";
  return "Full file content is unavailable for this file.";
}
function lineLabel(start, end) {
  return start === end ? `line ${start}` : `lines ${start}\u2013${end}`;
}
function FullFileDialog({
  file,
  comments = [],
  round,
  initialSide,
  initialLine,
  composer = null,
  activeCommentId,
  readOnly = false,
  controllerRef,
  findings = [],
  questions = [],
  findingDecisions = EMPTY_FINDING_DECISIONS,
  onDecideFinding,
  decidingFindingId,
  findingDecisionError,
  onOpenFinding,
  onClose,
  onOpenComposer,
  onCancelComposer,
  renderComposer,
  onReply,
  onState,
  onCommentJump,
  onCommentFocus,
  onAnswerQuestion
}) {
  const hasCurrent = file.newLines !== void 0 && file.status !== "deleted";
  const hasBase = file.oldLines !== void 0 && file.status !== "added";
  const fallbackSide = hasCurrent ? "new" : "old";
  const [side, setSide] = (0, import_react15.useState)(
    () => initialSide !== void 0 && (initialSide === "new" && hasCurrent || initialSide === "old" && hasBase) ? initialSide : fallbackSide
  );
  const [showAll, setShowAll] = (0, import_react15.useState)(false);
  const [anchor, setAnchor] = (0, import_react15.useState)(initialLine ?? 1);
  const [selection, setSelection] = (0, import_react15.useState)(
    initialLine === void 0 ? null : { start: initialLine, end: initialLine }
  );
  const activeSideRef = (0, import_react15.useRef)(null);
  const commentAtSelectionRef = (0, import_react15.useRef)(() => {
  });
  const dragRef = (0, import_react15.useRef)(null);
  const touchRef = (0, import_react15.useRef)(null);
  const [touchSelection, setTouchSelection] = (0, import_react15.useState)(null);
  const [touchSelecting, setTouchSelecting] = (0, import_react15.useState)(false);
  const suppressClickRef = (0, import_react15.useRef)(false);
  const onOpenComposerRef = (0, import_react15.useRef)(onOpenComposer);
  const readOnlyRef = (0, import_react15.useRef)(readOnly);
  onOpenComposerRef.current = onOpenComposer;
  readOnlyRef.current = readOnly;
  (0, import_react15.useEffect)(() => {
    setShowAll(false);
  }, [side]);
  const activeSide = side === "new" && !hasCurrent || side === "old" && !hasBase ? fallbackSide : side;
  const lines = activeSide === "new" ? file.newLines : file.oldLines;
  const maxLine = lines?.length ?? 0;
  (0, import_react15.useEffect)(() => {
    if (activeSideRef.current === activeSide) return;
    const first = activeSideRef.current === null;
    activeSideRef.current = activeSide;
    if (first) return;
    dragRef.current = null;
    touchRef.current = null;
    setTouchSelection(null);
    document.body.classList.remove("cr-selecting-lines");
    setAnchor(1);
    setSelection(null);
    if (composer !== null && composer.side !== activeSide) onCancelComposer?.();
  }, [activeSide, composer, onCancelComposer]);
  (0, import_react15.useEffect)(() => {
    if (maxLine === 0) return;
    setAnchor((current) => Math.min(Math.max(1, current), maxLine));
    setSelection(
      (current) => current === null ? null : {
        start: Math.min(Math.max(1, current.start), maxLine),
        end: Math.min(Math.max(1, current.end), maxLine)
      }
    );
  }, [maxLine]);
  const changed = (0, import_react15.useMemo)(() => changedLines(file, activeSide), [file, activeSide]);
  const shown = lines === void 0 ? [] : showAll ? lines : lines.slice(0, MAX_FULL_FILE_LINES);
  const description = lines === void 0 ? "Full file content is unavailable." : `${sideLabel(activeSide)} version \xB7 ${numberFormat.format(lines.length)} lines \xB7 ${numberFormat.format(changed.size)} changed`;
  const focusLine = selection?.end ?? anchor;
  function commentAtSelection() {
    if (readOnly || onOpenComposer === void 0) return;
    if (lines === void 0 || lines.length === 0) return;
    const target = selection ?? { start: anchor, end: anchor };
    if (selection === null) setSelection(target);
    onOpenComposer(activeSide, target.start, target.end);
  }
  commentAtSelectionRef.current = commentAtSelection;
  (0, import_react15.useEffect)(() => {
    function finishDrag() {
      const drag = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("cr-selecting-lines");
      if (drag === null || drag.last === drag.anchor) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (readOnlyRef.current) return;
      onOpenComposerRef.current?.(
        drag.side,
        Math.min(drag.anchor, drag.last),
        Math.max(drag.anchor, drag.last)
      );
    }
    window.addEventListener("mouseup", finishDrag);
    return () => {
      window.removeEventListener("mouseup", finishDrag);
      dragRef.current = null;
      document.body.classList.remove("cr-selecting-lines");
    };
  }, []);
  (0, import_react15.useEffect)(() => {
    function clearTouchTimer(gesture) {
      if (gesture.timer !== null) {
        window.clearTimeout(gesture.timer);
        gesture.timer = null;
      }
    }
    function lineAtPoint(x, y) {
      const hit = document.elementFromPoint?.(x, y);
      const row = hit instanceof Element ? hit.closest("[data-full-file-line]") : null;
      const line = Number(row?.dataset.fullFileLine);
      return Number.isFinite(line) && line > 0 ? line : null;
    }
    function extend(gesture, line) {
      gesture.last = line;
      const start = Math.min(gesture.anchor, line);
      const end = Math.max(gesture.anchor, line);
      setSelection({ start, end });
      setTouchSelection({ start, end });
    }
    function moveTo(x, y) {
      const gesture = touchRef.current;
      if (gesture === null || !gesture.activated) return;
      const line = lineAtPoint(x, y);
      if (line !== null) extend(gesture, line);
    }
    function onPointerMove(event) {
      const gesture = touchRef.current;
      if (gesture === null || event.pointerId !== gesture.pointerId) return;
      if (!gesture.activated) {
        if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > TOUCH_MOVE_TOLERANCE_PX) {
          clearTouchTimer(gesture);
          touchRef.current = null;
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      moveTo(event.clientX, event.clientY);
    }
    function onTouchMove(event) {
      const gesture = touchRef.current;
      if (gesture === null || !gesture.activated) return;
      if (event.cancelable) event.preventDefault();
      const touch = event.touches[0];
      if (touch !== void 0) moveTo(touch.clientX, touch.clientY);
    }
    function finishTouch(event) {
      const gesture = touchRef.current;
      if (gesture === null || event.pointerId !== gesture.pointerId) return;
      clearTouchTimer(gesture);
      touchRef.current = null;
      if (gesture.activated) {
        setTouchSelecting(false);
        document.body.classList.remove("cr-selecting-lines");
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    }
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finishTouch);
    window.addEventListener("pointercancel", finishTouch);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishTouch);
      window.removeEventListener("pointercancel", finishTouch);
      window.removeEventListener("touchmove", onTouchMove);
      const gesture = touchRef.current;
      if (gesture !== null) clearTouchTimer(gesture);
      touchRef.current = null;
      document.body.classList.remove("cr-selecting-lines");
    };
  }, []);
  (0, import_react15.useEffect)(() => {
    if (controllerRef === void 0) return;
    const controller = {
      commentAtSelection: () => commentAtSelectionRef.current()
    };
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [controllerRef]);
  function beginTouchLineSelection(no, event) {
    if (readOnly || onOpenComposer === void 0) return;
    if (event.pointerType !== "touch" || event.button !== 0) return;
    const target = event.target;
    if (target !== null && target.closest("button, a, input, textarea, select") !== null) return;
    const previous = touchRef.current;
    if (previous !== null && previous.timer !== null) window.clearTimeout(previous.timer);
    const gesture = {
      pointerId: event.pointerId,
      anchor: no,
      last: no,
      startX: event.clientX,
      startY: event.clientY,
      activated: false,
      timer: null
    };
    touchRef.current = gesture;
    gesture.timer = window.setTimeout(() => {
      if (touchRef.current !== gesture) return;
      gesture.timer = null;
      gesture.activated = true;
      suppressClickRef.current = true;
      document.body.classList.add("cr-selecting-lines");
      setTouchSelecting(true);
      navigator.vibrate?.(10);
      setAnchor(no);
      setSelection({ start: no, end: no });
      setTouchSelection({ start: no, end: no });
    }, TOUCH_LONG_PRESS_MS);
  }
  function clearTouchBar() {
    setTouchSelection(null);
    setTouchSelecting(false);
    document.body.classList.remove("cr-selecting-lines");
  }
  function commentOnLine(no) {
    if (onOpenComposer === void 0) return;
    setAnchor(no);
    setSelection({ start: no, end: no });
    setTouchSelection(null);
    onOpenComposer(activeSide, no, no);
  }
  function beginLineDrag(no, event) {
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    setAnchor(no);
    dragRef.current = { side: activeSide, anchor: no, last: no };
    document.body.classList.add("cr-selecting-lines");
  }
  function enterLine(no) {
    const drag = dragRef.current;
    if (drag === null || drag.side !== activeSide) return;
    if (no === drag.anchor && drag.last === drag.anchor) return;
    drag.last = no;
    setSelection({
      start: Math.min(drag.anchor, no),
      end: Math.max(drag.anchor, no)
    });
  }
  function consumeSuppressedClick() {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }
  function focusLineNumber(no) {
    window.requestAnimationFrame(() => {
      document.getElementById(`full-file-${activeSide}-${no}`)?.focus({ preventScroll: false });
    });
  }
  function selectLine(no, extend) {
    if (extend) {
      setSelection({ start: Math.min(anchor, no), end: Math.max(anchor, no) });
    } else {
      setAnchor(no);
      setSelection({ start: no, end: no });
      setTouchSelection(null);
    }
    focusLineNumber(no);
  }
  function moveSelection(no, extend) {
    const next = Math.min(Math.max(1, no), maxLine);
    if (extend) {
      setSelection({ start: Math.min(anchor, next), end: Math.max(anchor, next) });
    } else {
      setAnchor(next);
      setSelection({ start: next, end: next });
    }
    focusLineNumber(next);
  }
  function onLineKeyDown(event, no) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(no + (event.key === "ArrowDown" ? 1 : -1), event.shiftKey);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveSelection(event.key === "Home" ? 1 : maxLine, event.shiftKey);
      return;
    }
    if (event.key === "Enter" && selection !== null && !readOnly) {
      event.preventDefault();
      onOpenComposer?.(activeSide, selection.start, selection.end);
    }
  }
  function openSelectionComposer() {
    if (selection === null || readOnly) return;
    onOpenComposer?.(activeSide, selection.start, selection.end);
  }
  function handleDialogClose() {
    if (composer !== null && onCancelComposer !== void 0) {
      onCancelComposer();
      return;
    }
    onClose();
  }
  function threadFor(no) {
    const hasQuestion = activeSide === "new" && questions.some((question) => question.file === file.path && question.line === no);
    if (hasQuestion) return null;
    const items = commentsAtLine(comments, round, file.path, no, activeSide);
    if (items.length === 0 || onReply === void 0 || onState === void 0) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "cr-full-file-thread", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "cr-full-file-thread-cell", role: "cell", "aria-colspan": 4, children: items.map((comment) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      CommentThread,
      {
        comment,
        compact: true,
        active: activeCommentId === comment.id,
        readOnly,
        onReply,
        onState,
        onJump: (item) => {
          onClose();
          onCommentJump?.(item);
        },
        onFocus: (item) => onCommentFocus?.(item)
      },
      comment.id
    )) }) });
  }
  function findingRows(no) {
    if (activeSide !== "new") return [];
    return findings.filter(
      (finding) => finding.file === file.path && finding.unanchored !== true && finding.lineStart === no
    ).map((finding) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "cr-full-file-finding", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      InlineFinding,
      {
        finding,
        decision: findingDecisions.get(finding.id),
        readOnly,
        pending: decidingFindingId === finding.id,
        error: findingDecisionError?.findingId === finding.id ? findingDecisionError.message : null,
        onDecide: onDecideFinding,
        onOpenFinding
      }
    ) }, finding.id));
  }
  function questionRows(no) {
    if (activeSide !== "new") return [];
    const lineComments = commentsAtLine(comments, round, file.path, no, "new");
    return questions.filter((question) => question.file === file.path && question.line === no).map((question) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "cr-full-file-question", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      InlineQuestion,
      {
        question,
        comments: lineComments,
        readOnly,
        activeCommentId,
        onReply,
        onState,
        onJump: onCommentJump,
        onFocus: onCommentFocus,
        ...onAnswerQuestion === void 0 ? {} : { onAnswer: (body) => onAnswerQuestion(question, body) }
      }
    ) }, question.id));
  }
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Dialog, { open: true, title: file.path, description, onClose: handleDialogClose, children: /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "cr-file-view", children: [
    touchSelection !== null && onOpenComposer !== void 0 && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
      "div",
      {
        className: ["cr-touch-comment-bar", touchSelecting ? "cr-touch-comment-bar-active" : ""].filter(Boolean).join(" "),
        role: "status",
        "aria-live": "polite",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "cr-touch-comment-range", children: touchSelection.start === touchSelection.end ? `Line ${touchSelection.start}` : `Lines ${touchSelection.start}\u2013${touchSelection.end}` }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
            "button",
            {
              type: "button",
              className: "cr-touch-comment-cta",
              onClick: () => {
                const selected = touchSelection;
                clearTouchBar();
                onOpenComposer(activeSide, selected.start, selected.end);
              },
              children: [
                "Comment",
                " ",
                touchSelection.start === touchSelection.end ? "1 line" : `${touchSelection.end - touchSelection.start + 1} lines`
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
            "button",
            {
              type: "button",
              className: "cr-touch-comment-clear",
              "aria-label": "Clear line selection",
              onClick: () => {
                clearTouchBar();
                setSelection(null);
              },
              children: "\xD7"
            }
          )
        ]
      }
    ) : null,
    hasCurrent && hasBase ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "cr-segmented", role: "group", "aria-label": "File version", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        "button",
        {
          type: "button",
          className: "cr-segmented-button",
          "aria-pressed": activeSide === "new",
          onClick: () => setSide("new"),
          children: "Current"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        "button",
        {
          type: "button",
          className: "cr-segmented-button",
          "aria-pressed": activeSide === "old",
          onClick: () => setSide("old"),
          children: "Base"
        }
      )
    ] }) : null,
    lines === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "cr-notice cr-notice-warning", children: unavailableMessage(file) }) : lines.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "cr-meta", children: "This file is empty." }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "cr-full-file-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "cr-meta", children: "Click a line, drag across rows, or focus one and use \u2191/\u2193. Shift-click or Shift+\u2191/\u2193 selects a range." }),
        selection !== null && onOpenComposer !== void 0 && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(Button, { size: "small", variant: "secondary", onClick: openSelectionComposer, children: [
          "Comment on ",
          lineLabel(selection.start, selection.end)
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
        "div",
        {
          className: "cr-full-file",
          role: "table",
          "aria-label": `Full ${activeSide === "new" ? "current" : "base"} file for ${file.path}`,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "cr-full-file-head", role: "row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "cr-full-file-no", role: "columnheader", children: "line" }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { role: "columnheader", "aria-hidden": "true" }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { role: "columnheader", children: "content" }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { role: "columnheader", "aria-hidden": "true" })
            ] }),
            shown.map((text, index) => {
              const no = index + 1;
              const isChanged = changed.has(no);
              const kind = isChanged ? activeSide === "new" ? "added" : "removed" : "unchanged";
              const selected = selection !== null && no >= selection.start && no <= selection.end;
              return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "cr-full-file-block", children: [
                /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
                  "div",
                  {
                    id: `full-file-${activeSide}-${no}`,
                    className: [
                      "cr-full-file-line",
                      isChanged ? activeSide === "new" ? "cr-full-file-line-add" : "cr-full-file-line-del" : "",
                      selected ? "cr-full-file-line-selected" : ""
                    ].filter(Boolean).join(" "),
                    role: "row",
                    tabIndex: no === focusLine ? 0 : -1,
                    "aria-selected": selected,
                    "aria-label": `Line ${no}, ${kind}: ${text || "(blank)"}`,
                    "data-full-file-line": no,
                    onPointerDown: (event) => beginTouchLineSelection(no, event),
                    onMouseDown: (event) => {
                      if (event.button !== 0 || event.shiftKey) return;
                      const target = event.target;
                      if (target === null || target.closest("button, a, input, textarea, select") !== null) {
                        return;
                      }
                      beginLineDrag(no, event);
                    },
                    onMouseOver: () => enterLine(no),
                    onClick: (event) => {
                      if (consumeSuppressedClick()) return;
                      selectLine(no, event.shiftKey);
                    },
                    onKeyDown: (event) => onLineKeyDown(event, no),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "cr-full-file-no", role: "cell", "aria-hidden": "true", children: no }),
                      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "cr-full-file-marker", role: "cell", "aria-hidden": "true", children: isChanged ? activeSide === "new" ? "+" : "\u2212" : " " }),
                      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("code", { className: "cr-full-file-code", role: "cell", children: text === "" ? " " : text }),
                      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "cr-full-file-actions-cell", role: "cell", children: !readOnly && onOpenComposer !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
                        "button",
                        {
                          type: "button",
                          className: "cr-full-file-comment",
                          "aria-label": `Comment on line ${no}`,
                          onClick: (event) => {
                            event.stopPropagation();
                            if (consumeSuppressedClick()) return;
                            commentOnLine(no);
                          },
                          children: "+"
                        }
                      ) : null })
                    ]
                  }
                ),
                findingRows(no),
                questionRows(no),
                threadFor(no),
                composer !== null && composer.side === activeSide && composer.lineEnd === no && renderComposer !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "cr-full-file-composer", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "cr-full-file-composer-cell", role: "cell", "aria-colspan": 4, children: renderComposer(activeSide, composer.lineStart, composer.lineEnd) }) }) : null
              ] }, `${activeSide}:${no}`);
            })
          ]
        }
      ),
      lines.length > MAX_FULL_FILE_LINES && !showAll ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "cr-full-file-more", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(Button, { variant: "secondary", size: "small", onClick: () => setShowAll(true), children: [
          "Show all ",
          numberFormat.format(lines.length),
          " lines"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "cr-meta", children: "Rendering is capped to keep the dialog responsive." })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "cr-dialog-actions", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Button, { variant: "secondary", onClick: onClose, children: "Close" }) })
  ] }) });
}

// packages/ui/src/review/DiffViewer.tsx
var import_jsx_runtime18 = require("react/jsx-runtime");
var MAX_DIFF_ROWS = 800;
var EMPTY_FINDING_DECISIONS2 = /* @__PURE__ */ new Map();
var TOUCH_LONG_PRESS_MS2 = 450;
var TOUCH_MOVE_TOLERANCE_PX2 = 8;
var SEVERITY_RANK = {
  blocker: 4,
  major: 3,
  minor: 2,
  nit: 1
};
function findingsOnLine(findings, path, side, line) {
  if (side !== "new") return [];
  return findings.filter(
    (finding) => finding.file === path && finding.unanchored !== true && line >= finding.lineStart && line <= finding.lineEnd
  );
}
function highestFinding(findings) {
  return findings.reduce(
    (highest, finding) => highest === null || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[highest.severity] ? finding : highest,
    null
  );
}
function questionsOnLine(questions, path, side, line) {
  if (side !== "new") return [];
  return questions.filter((question) => question.file === path && question.line === line);
}
function statusTone(status) {
  if (status === "added" || status === "untracked") return "success";
  if (status === "deleted") return "danger";
  if (status === "renamed") return "warning";
  if (status === "submodule") return "info";
  return "neutral";
}
function statusLetter(status) {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "submodule":
      return "S";
    case "untracked":
      return "U";
    default:
      return "M";
  }
}
function groupByDirectory(files) {
  const groups = /* @__PURE__ */ new Map();
  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const directory = slash < 0 ? "/" : file.path.slice(0, slash);
    const existing = groups.get(directory);
    if (existing === void 0) groups.set(directory, [file]);
    else existing.push(file);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([directory, items]) => ({
    directory,
    files: items.sort((a, b) => a.path.localeCompare(b.path))
  }));
}
function fileEstimate(rows) {
  return Math.min(720, Math.max(120, rows.length * 20 + 44));
}
function isVisibleFallback() {
  return typeof IntersectionObserver === "undefined";
}
function DiffFileSection({
  file,
  comments,
  round,
  active,
  activeLine,
  activeCommentId,
  composer,
  dragRange,
  findings,
  questions,
  findingDecisions,
  onDecideFinding,
  decidingFindingId,
  findingDecisionError,
  onJump,
  onLoadDiff,
  onViewFullFile,
  onSelectLine,
  onLineDragStart,
  onLineDragEnter,
  onLineTouchStart,
  onOpenComposer,
  onOpenFinding,
  consumeSuppressedClick,
  renderComposer,
  onReply,
  onCommentState,
  onCommentJump,
  onCommentFocus,
  onAnswerQuestion,
  readOnly = false
}) {
  const [visible, setVisible] = (0, import_react16.useState)(isVisibleFallback());
  const [showAll, setShowAll] = (0, import_react16.useState)(false);
  const [open, setOpen] = (0, import_react16.useState)(true);
  const [loaded, setLoaded] = (0, import_react16.useState)(null);
  const [loading, setLoading] = (0, import_react16.useState)(false);
  const [loadError, setLoadError] = (0, import_react16.useState)(null);
  const requested = (0, import_react16.useRef)(false);
  const generation = (0, import_react16.useRef)(0);
  const ref = (0, import_react16.useRef)(null);
  const shownFile = loaded ?? file;
  const rows = buildDiffRows(shownFile);
  const first = firstChangedLine(shownFile);
  const needsLoad = loaded === null && file.truncated === true && onLoadDiff !== void 0;
  const load = (0, import_react16.useCallback)(async () => {
    if (requested.current || onLoadDiff === void 0) return null;
    requested.current = true;
    const requestGeneration = generation.current;
    setLoading(true);
    try {
      const next = await onLoadDiff(file.path);
      if (generation.current !== requestGeneration) return null;
      setLoaded(next);
      setLoadError(null);
      return next;
    } catch (error) {
      if (generation.current !== requestGeneration) return null;
      setLoadError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [file.path, onLoadDiff]);
  (0, import_react16.useEffect)(() => {
    if (active) setVisible(true);
  }, [active]);
  (0, import_react16.useEffect)(() => {
    generation.current += 1;
    requested.current = false;
    setLoaded(null);
    setLoadError(null);
    setLoading(false);
  }, [file.path, round]);
  (0, import_react16.useEffect)(() => {
    if (!visible || !needsLoad || requested.current) return;
    void load();
  }, [load, needsLoad, visible]);
  (0, import_react16.useEffect)(() => {
    if (visible || isVisibleFallback() || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (node === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  const shown = showAll ? rows : rows.slice(0, MAX_DIFF_ROWS);
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
    "section",
    {
      ref,
      id: diffFileId(file.path),
      className: ["cr-diff-file", active ? "cr-diff-file-active" : ""].filter(Boolean).join(" "),
      "data-file": file.path,
      "aria-label": `Diff for ${file.path}`,
      style: { minHeight: visible ? void 0 : fileEstimate(rows) },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("header", { className: "cr-diff-file-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            "button",
            {
              type: "button",
              className: "cr-diff-collapse",
              "aria-expanded": open,
              "aria-label": `${open ? "Collapse" : "Expand"} ${file.path}`,
              onClick: () => setOpen((value) => !value),
              children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { "aria-hidden": "true", children: open ? "\u2304" : "\u203A" })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
            "button",
            {
              type: "button",
              className: "cr-diff-path",
              onClick: () => onJump(file.path, first?.line),
              title: file.path,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-diff-path-text", children: file.path }),
                file.oldPath !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-meta", children: [
                  "from ",
                  file.oldPath
                ] }) : null
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(Badge, { tone: statusTone(file.status), children: [
            statusLetter(file.status),
            " ",
            file.status
          ] }),
          file.conflicted === true ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Badge, { tone: "danger", children: "conflict" }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-diff-stat cr-diff-stat-add", children: [
            "+",
            shownFile.added
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-diff-stat cr-diff-stat-del", children: [
            "\u2212",
            shownFile.deleted
          ] }),
          shownFile.binary ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Badge, { tone: "neutral", children: "binary" }) : null,
          shownFile.truncated === true ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Badge, { tone: "warning", children: "truncated" }) : null,
          file.ignored === true ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Badge, { tone: "neutral", children: "ignored" }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
            Button,
            {
              variant: "secondary",
              size: "small",
              className: "cr-diff-full-file",
              "aria-label": `View full file for ${file.path}`,
              title: "View full file",
              onClick: () => {
                if (shownFile.truncated === true && onLoadDiff !== void 0) {
                  void load().then((next) => {
                    if (next !== null) onViewFullFile(next);
                  });
                  return;
                }
                onViewFullFile(shownFile);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(FileIcon, { size: 14 }),
                "Full file"
              ]
            }
          )
        ] }),
        open ? visible ? loading ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-diff-empty", children: "Loading this file's diff\u2026" }) : loadError !== null ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-diff-empty", children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { children: [
            "Could not load this file's diff: ",
            loadError
          ] }),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            Button,
            {
              variant: "secondary",
              size: "small",
              onClick: () => {
                requested.current = false;
                setLoadError(null);
                void load();
              },
              children: "Retry"
            }
          )
        ] }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-diff-empty", children: shownFile.ignored === true ? "This path is ignored by the review settings." : shownFile.binary ? "Binary changes are not rendered." : shownFile.reason === "diff-truncated" ? "The diff cap cut this file before its contents. The summary is still available." : shownFile.reason === "unreadable" ? "This file could not be read for the snapshot." : `No textual diff is available (${shownFile.added} added, ${shownFile.deleted} deleted).` }) : /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(import_jsx_runtime18.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
            "div",
            {
              className: "cr-diff-body",
              role: "table",
              "aria-label": `Unified diff for ${file.path}`,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-diff-gutter-head", "aria-hidden": "true", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: "old" }),
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: "new" }),
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", {}),
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", {})
                ] }),
                shown.map(
                  (row) => row.type === "hunk" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-hunk", role: "row", children: (() => {
                    const header = row.hunk?.header.trim() ?? "";
                    const raw = header.startsWith("@@");
                    return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(import_jsx_runtime18.Fragment, { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-hunk-code", role: "cell", children: raw ? header : `@@ -${row.hunk?.oldStart},${row.hunk?.oldLines} +${row.hunk?.newStart},${row.hunk?.newLines} @@` }),
                      !raw && header !== "" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-hunk-header", role: "cell", children: header }) : null
                    ] });
                  })() }, row.key) : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
                    DiffLineRow,
                    {
                      file: shownFile,
                      row,
                      comments,
                      round,
                      activeLine,
                      activeCommentId,
                      composer,
                      dragRange,
                      findings,
                      questions,
                      findingDecisions,
                      onDecideFinding,
                      decidingFindingId,
                      findingDecisionError,
                      onSelectLine,
                      onLineDragStart,
                      onLineDragEnter,
                      onLineTouchStart,
                      onOpenComposer,
                      onOpenFinding,
                      consumeSuppressedClick,
                      renderComposer,
                      onReply,
                      onCommentState,
                      onCommentJump,
                      onCommentFocus,
                      onAnswerQuestion,
                      readOnly
                    },
                    row.key
                  )
                )
              ]
            }
          ),
          rows.length > MAX_DIFF_ROWS && !showAll ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-diff-more", children: [
            /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(Button, { variant: "secondary", size: "small", onClick: () => setShowAll(true), children: [
              "Show all ",
              rows.length,
              " diff rows"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-meta", children: "Rendering is capped to keep the page responsive." })
          ] }) : null
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-diff-placeholder", "aria-hidden": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Skeleton, { width: "44%", height: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { style: { height: 8 } }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Skeleton, { width: "76%", height: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { style: { height: 8 } }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Skeleton, { width: "63%", height: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-visually-hidden", children: [
            "Loading ",
            file.path
          ] })
        ] }) : null
      ]
    }
  );
}
function DiffLineRow({
  file,
  row,
  comments,
  round,
  activeLine,
  activeCommentId,
  composer,
  dragRange,
  findings,
  questions,
  findingDecisions,
  onDecideFinding,
  decidingFindingId,
  findingDecisionError,
  onSelectLine,
  onLineDragStart,
  onLineDragEnter,
  onLineTouchStart,
  onOpenComposer,
  onOpenFinding,
  consumeSuppressedClick,
  renderComposer,
  onReply,
  onCommentState,
  onCommentJump,
  onCommentFocus,
  onAnswerQuestion,
  readOnly
}) {
  const line = row.line;
  if (line === void 0) return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(import_jsx_runtime18.Fragment, {});
  const side = line.kind === "del" ? "old" : "new";
  const no = side === "new" ? line.newNo : line.oldNo;
  if (no === null) return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(import_jsx_runtime18.Fragment, {});
  const lineComments = commentsAtLine(comments, round, file.path, no, side);
  const lineFindings = findingsOnLine(findings, file.path, side, no);
  const lineQuestions = questionsOnLine(questions, file.path, side, no);
  const highestRisk2 = highestFinding(lineFindings);
  const selected = activeLine === no;
  const inDragRange = dragRange !== null && dragRange.path === file.path && dragRange.side === side && no >= dragRange.lineStart && no <= dragRange.lineEnd;
  const range = composer !== null && composer !== void 0 && composer.path === file.path && composer.side === side && no >= composer.lineStart && no <= composer.lineEnd;
  const marker = line.kind === "add" ? "+" : line.kind === "del" ? "\u2212" : " ";
  const label = `line ${no}, ${line.kind === "add" ? "added" : line.kind === "del" ? "removed" : "context"}: ${line.text || "(blank)"}`;
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(import_jsx_runtime18.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
      "div",
      {
        id: diffLineId(file.path, side, no),
        className: [
          "cr-diff-line",
          `cr-diff-line-${line.kind}`,
          selected ? "cr-diff-line-selected" : "",
          range ? "cr-diff-line-range" : "",
          inDragRange ? "cr-diff-line-drag" : "",
          lineComments.length > 0 ? "cr-diff-line-commented" : "",
          highestRisk2 !== null ? `cr-diff-line-risk cr-risk-${highestRisk2.severity}` : ""
        ].filter(Boolean).join(" "),
        role: "row",
        tabIndex: 0,
        "aria-label": label,
        "aria-current": selected ? "true" : void 0,
        "data-diff-path": file.path,
        "data-diff-side": side,
        "data-diff-line": no,
        onPointerDown: (event) => onLineTouchStart(file, side, no, event),
        onMouseDown: (event) => {
          if (event.button !== 0 || event.shiftKey) return;
          const target = event.target;
          if (target === null || target.closest("button, a, input, textarea, select") !== null)
            return;
          onLineDragStart(file, side, no, event);
        },
        onMouseOver: () => onLineDragEnter(file, side, no),
        onClick: (event) => {
          if (consumeSuppressedClick()) return;
          onSelectLine(file, side, no, event.shiftKey);
        },
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectLine(file, side, no, event.shiftKey);
          }
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-diff-no", role: "cell", children: line.oldNo ?? "" }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-diff-no", role: "cell", children: line.newNo ?? "" }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-diff-marker", "aria-hidden": "true", children: marker }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-diff-risk-cell", role: "cell", children: highestRisk2 === null ? null : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            "button",
            {
              type: "button",
              className: `cr-diff-risk-pin cr-risk-${highestRisk2.severity}`,
              title: `${highestRisk2.severity}: ${highestRisk2.title}${highestRisk2.lineEnd > highestRisk2.lineStart ? ` (lines ${highestRisk2.lineStart}\u2013${highestRisk2.lineEnd})` : ""}`,
              "aria-label": `Open ${highestRisk2.severity} finding ${highestRisk2.title}`,
              onClick: (event) => {
                event.stopPropagation();
                onOpenFinding?.(highestRisk2);
              },
              children: severityLetter(highestRisk2.severity)
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("code", { className: "cr-diff-text", role: "cell", children: line.text === "" ? " " : line.text }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-diff-actions-cell", role: "cell", children: [
            !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
              "button",
              {
                type: "button",
                className: "cr-diff-comment",
                "aria-label": `Comment on line ${no}`,
                onClick: (event) => {
                  event.stopPropagation();
                  onOpenComposer(file, side, no, no);
                },
                children: "+"
              }
            ) : null,
            lineComments.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-diff-comment-count", "aria-label": `${lineComments.length} comments`, children: lineComments.length }) : null
          ] })
        ]
      }
    ),
    lineFindings.filter((finding) => finding.lineStart === no).map((finding) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-inline-finding-row", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      InlineFinding,
      {
        finding,
        decision: findingDecisions.get(finding.id),
        readOnly,
        pending: decidingFindingId === finding.id,
        error: findingDecisionError?.findingId === finding.id ? findingDecisionError.message : null,
        onDecide: onDecideFinding,
        onOpenFinding
      }
    ) }, finding.id)),
    lineQuestions.map((question) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-inline-question-row", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      InlineQuestion,
      {
        question,
        comments: lineComments,
        readOnly,
        activeCommentId,
        onReply,
        onState: onCommentState,
        onJump: onCommentJump,
        onFocus: onCommentFocus,
        ...onAnswerQuestion === void 0 ? {} : { onAnswer: (body) => onAnswerQuestion(question, body) }
      }
    ) }, question.id)),
    lineQuestions.length === 0 && lineComments.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-inline-thread", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-inline-thread-cell", role: "cell", children: lineComments.map((comment) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      CommentThread,
      {
        comment,
        compact: true,
        active: activeCommentId === comment.id,
        readOnly,
        onReply,
        onState: onCommentState,
        onJump: onCommentJump,
        onFocus: onCommentFocus
      },
      comment.id
    )) }) }) : null,
    composer !== null && composer !== void 0 && composer.path === file.path && composer.side === side && composer.lineStart === no && renderComposer !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-inline-composer", role: "row", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { role: "cell", children: renderComposer(file, side, composer.lineStart, composer.lineEnd) }) }) : null
  ] });
}
function DiffViewer({
  snapshot,
  comments,
  allComments,
  round,
  delta,
  canDelta,
  deltaHint,
  onRequestNextRound,
  changedPaths,
  findings = [],
  questions = [],
  findingDecisions = EMPTY_FINDING_DECISIONS2,
  onDecideFinding,
  decidingFindingId,
  findingDecisionError,
  activeFile,
  activeLine,
  activeCommentId,
  composer,
  fullFileComposer,
  fullFileJump,
  onFullFileJumpHandled,
  fullFileControllerRef,
  onCancelComposer,
  onDeltaChange,
  onJump,
  onLoadDiff,
  onSelectLine,
  onSelectRange,
  onOpenComposer,
  onOpenFinding,
  renderComposer,
  onReply,
  onCommentState,
  onCommentJump,
  onCommentFocus,
  onAnswerQuestion,
  readOnly = false
}) {
  const [search, setSearch] = (0, import_react16.useState)("");
  const [collapsed, setCollapsed] = (0, import_react16.useState)(/* @__PURE__ */ new Set());
  const [dragRange, setDragRange] = (0, import_react16.useState)(null);
  const [wrap, setWrap] = (0, import_react16.useState)(true);
  const [currentFile, setCurrentFile] = (0, import_react16.useState)(activeFile);
  const [fullFile, setFullFile] = (0, import_react16.useState)(null);
  const filesRef = (0, import_react16.useRef)(null);
  const dragRef = (0, import_react16.useRef)(null);
  const suppressClickRef = (0, import_react16.useRef)(false);
  const openComposerRef = (0, import_react16.useRef)(onOpenComposer);
  openComposerRef.current = onOpenComposer;
  const onSelectRangeRef = (0, import_react16.useRef)(onSelectRange);
  onSelectRangeRef.current = onSelectRange;
  const [touchSelection, setTouchSelection] = (0, import_react16.useState)(null);
  const [touchSelecting, setTouchSelecting] = (0, import_react16.useState)(false);
  const touchRef = (0, import_react16.useRef)(null);
  const allFiles = (0, import_react16.useMemo)(() => filesForSnapshot(snapshot), [snapshot]);
  const conflictedFiles = allFiles.filter((file) => file.conflicted === true);
  (0, import_react16.useEffect)(() => {
    if (activeFile !== void 0) setCurrentFile(activeFile);
  }, [activeFile]);
  (0, import_react16.useEffect)(() => {
    if (fullFileJump === null || fullFileJump === void 0) return;
    let alive = true;
    const file = allFiles.find((item) => item.path === fullFileJump.path);
    if (file === void 0) return;
    if (file.truncated === true && onLoadDiff !== void 0) {
      void onLoadDiff(file.path).then((next) => {
        if (!alive) return;
        setFullFile({ file: next, side: fullFileJump.side, line: fullFileJump.line });
        onFullFileJumpHandled?.();
      }).catch(() => {
        if (alive) onFullFileJumpHandled?.();
      });
      return () => {
        alive = false;
      };
    }
    setFullFile({ file, side: fullFileJump.side, line: fullFileJump.line });
    onFullFileJumpHandled?.();
    return () => {
      alive = false;
    };
  }, [allFiles, fullFileJump, onFullFileJumpHandled, onLoadDiff]);
  (0, import_react16.useEffect)(() => {
    function finishDrag() {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragRange(null);
      document.body.classList.remove("cr-selecting-lines");
      if (drag === null || drag.last === drag.anchor) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (!readOnly) {
        openComposerRef.current(
          drag.file,
          drag.side,
          Math.min(drag.anchor, drag.last),
          Math.max(drag.anchor, drag.last)
        );
      }
    }
    window.addEventListener("mouseup", finishDrag);
    return () => {
      window.removeEventListener("mouseup", finishDrag);
      document.body.classList.remove("cr-selecting-lines");
    };
  }, [readOnly]);
  (0, import_react16.useEffect)(() => {
    const filesByPath = new Map(allFiles.map((file) => [file.path, file]));
    function clearTouchTimer(gesture) {
      if (gesture.timer !== null) {
        window.clearTimeout(gesture.timer);
        gesture.timer = null;
      }
    }
    function lineAtPoint(x, y) {
      const hit = document.elementFromPoint?.(x, y);
      const row = hit instanceof Element ? hit.closest("[data-diff-line]") : null;
      if (row === null) return null;
      const path = row.dataset.diffPath;
      const side = row.dataset.diffSide;
      const line = Number(row.dataset.diffLine);
      if (path === void 0 || side !== "old" && side !== "new" || !Number.isFinite(line)) {
        return null;
      }
      const file = filesByPath.get(path);
      return file === void 0 ? null : { file, side, line };
    }
    function extendTouch(gesture, found) {
      if (found.file.path !== gesture.file.path || found.side !== gesture.side) return;
      gesture.last = found.line;
      const lineStart = Math.min(gesture.anchor, found.line);
      const lineEnd = Math.max(gesture.anchor, found.line);
      onSelectRangeRef.current(found.file, found.side, lineStart, lineEnd);
      setTouchSelection({
        file: found.file,
        path: found.file.path,
        side: found.side,
        lineStart,
        lineEnd
      });
    }
    function moveTo(x, y) {
      const gesture = touchRef.current;
      if (gesture === null || !gesture.activated) return;
      const found = lineAtPoint(x, y);
      if (found !== null) extendTouch(gesture, found);
    }
    function onPointerMove(event) {
      const gesture = touchRef.current;
      if (gesture === null || event.pointerId !== gesture.pointerId) return;
      if (!gesture.activated) {
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (Math.hypot(dx, dy) > TOUCH_MOVE_TOLERANCE_PX2) {
          clearTouchTimer(gesture);
          touchRef.current = null;
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      moveTo(event.clientX, event.clientY);
    }
    function onTouchMove(event) {
      const gesture = touchRef.current;
      if (gesture === null || !gesture.activated) return;
      if (event.cancelable) event.preventDefault();
      const touch = event.touches[0];
      if (touch !== void 0) moveTo(touch.clientX, touch.clientY);
    }
    function finishTouch(event) {
      const gesture = touchRef.current;
      if (gesture === null || event.pointerId !== gesture.pointerId) return;
      clearTouchTimer(gesture);
      touchRef.current = null;
      if (gesture.activated) {
        setTouchSelecting(false);
        document.body.classList.remove("cr-touch-selecting");
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    }
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finishTouch);
    window.addEventListener("pointercancel", finishTouch);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishTouch);
      window.removeEventListener("pointercancel", finishTouch);
      window.removeEventListener("touchmove", onTouchMove);
      const gesture = touchRef.current;
      if (gesture !== null) clearTouchTimer(gesture);
      touchRef.current = null;
      document.body.classList.remove("cr-touch-selecting");
    };
  }, [allFiles]);
  function beginTouchLineSelection(file, side, line, event) {
    if (readOnly || event.pointerType !== "touch" || event.button !== 0) return;
    const target = event.target;
    if (target !== null && target.closest("button, a, input, textarea, select") !== null) return;
    const previous = touchRef.current;
    if (previous !== null && previous.timer !== null) window.clearTimeout(previous.timer);
    const gesture = {
      pointerId: event.pointerId,
      file,
      side,
      anchor: line,
      last: line,
      startX: event.clientX,
      startY: event.clientY,
      activated: false,
      timer: null
    };
    touchRef.current = gesture;
    gesture.timer = window.setTimeout(() => {
      if (touchRef.current !== gesture) return;
      gesture.timer = null;
      gesture.activated = true;
      suppressClickRef.current = true;
      setTouchSelecting(true);
      document.body.classList.add("cr-touch-selecting");
      navigator.vibrate?.(10);
      onSelectRangeRef.current(file, side, line, line);
      setTouchSelection({ file, path: file.path, side, lineStart: line, lineEnd: line });
    }, TOUCH_LONG_PRESS_MS2);
  }
  function clearTouchSelection() {
    setTouchSelection(null);
    document.body.classList.remove("cr-touch-selecting");
  }
  function beginLineDrag(file, side, line, event) {
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    onSelectRange(file, side, line, line);
    dragRef.current = {
      path: file.path,
      side,
      lineStart: line,
      lineEnd: line,
      anchor: line,
      last: line,
      file
    };
    setDragRange({ path: file.path, side, lineStart: line, lineEnd: line });
    document.body.classList.add("cr-selecting-lines");
  }
  function enterLine(file, side, line) {
    const drag = dragRef.current;
    if (drag === null || drag.path !== file.path || drag.side !== side) return;
    drag.last = line;
    drag.lineStart = Math.min(drag.anchor, line);
    drag.lineEnd = Math.max(drag.anchor, line);
    setDragRange({
      path: drag.path,
      side: drag.side,
      lineStart: drag.lineStart,
      lineEnd: drag.lineEnd
    });
    onSelectRange(file, side, drag.lineStart, drag.lineEnd);
  }
  function consumeSuppressedClick() {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }
  const visibleFiles = delta ? allFiles.filter((file) => changedPaths.has(file.path)) : allFiles;
  const query = search.trim().toLowerCase();
  const filteredFiles = query === "" ? visibleFiles : visibleFiles.filter((file) => file.path.toLowerCase().includes(query));
  const groups = groupByDirectory(filteredFiles);
  const fileKey = filteredFiles.map((file) => file.path).join("\0");
  (0, import_react16.useEffect)(() => {
    const root = filesRef.current;
    if (root === null || typeof window === "undefined") return;
    let frame = 0;
    function update() {
      frame = 0;
      const sections = [...root.querySelectorAll(".cr-diff-file[data-file]")];
      if (sections.length === 0) return;
      const viewportHeight = window.innerHeight;
      let next;
      let bestVisible = 0;
      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        if (visible > bestVisible) {
          bestVisible = visible;
          next = section.dataset.file;
        }
      }
      const fallback = sections[0]?.dataset.file;
      const resolved = next ?? fallback;
      if (resolved !== void 0) {
        setCurrentFile((previous) => previous === resolved ? previous : resolved);
      }
    }
    function schedule() {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [fileKey]);
  const openCommentsByPath = /* @__PURE__ */ new Map();
  for (const comment of comments) {
    if (comment.state !== "open") continue;
    const anchor = latestAnchor(comment);
    if (anchor === void 0) continue;
    openCommentsByPath.set(anchor.path, (openCommentsByPath.get(anchor.path) ?? 0) + 1);
  }
  function riskBadge(path) {
    const items = findings.filter(
      (finding) => finding.file === path && finding.unanchored !== true
    );
    const highest = highestFinding(items);
    if (highest === null) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      "span",
      {
        className: `cr-tree-risk cr-risk-${highest.severity}`,
        "aria-label": `${items.length} reviewer ${items.length === 1 ? "risk" : "risks"}, highest ${highest.severity}`,
        title: `${items.length} reviewer ${items.length === 1 ? "risk" : "risks"} \xB7 highest ${highest.severity}`,
        children: items.length
      }
    );
  }
  if (allFiles.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      EmptyState,
      {
        title: "No changed files",
        description: "This round has no diff against its base. Refresh after new commits or switch rounds."
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
    "div",
    {
      className: ["cr-diff-layout", touchSelecting ? "cr-touch-selecting" : ""].filter(Boolean).join(" "),
      children: [
        touchSelection !== null && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-touch-comment-bar", role: "status", "aria-live": "polite", children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-touch-comment-range", children: touchSelection.lineStart === touchSelection.lineEnd ? `Line ${touchSelection.lineStart}` : `Lines ${touchSelection.lineStart}\u2013${touchSelection.lineEnd}` }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
            "button",
            {
              type: "button",
              className: "cr-touch-comment-cta",
              onClick: () => {
                const selected = touchSelection;
                clearTouchSelection();
                openComposerRef.current(
                  selected.file,
                  selected.side,
                  selected.lineStart,
                  selected.lineEnd
                );
              },
              children: [
                "Comment",
                " ",
                touchSelection.lineStart === touchSelection.lineEnd ? "1 line" : `${touchSelection.lineEnd - touchSelection.lineStart + 1} lines`
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            "button",
            {
              type: "button",
              className: "cr-touch-comment-clear",
              "aria-label": "Clear line selection",
              onClick: clearTouchSelection,
              children: "\xD7"
            }
          )
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("aside", { className: "cr-file-tree", "aria-label": "Changed files", children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-file-tree-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-card-title", children: "Files" }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-meta", children: visibleFiles.length })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            Input,
            {
              label: "Filter files",
              hideLabel: true,
              type: "search",
              placeholder: "Filter files\u2026",
              value: search,
              onChange: (event) => setSearch(event.target.value)
            }
          ),
          filteredFiles.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("p", { className: "cr-meta cr-file-tree-empty", children: "No files match this filter." }) : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-tree", children: groups.map((group) => {
            const isCollapsed = collapsed.has(group.directory);
            return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-tree-group", children: [
              /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
                "button",
                {
                  type: "button",
                  className: "cr-tree-dir",
                  "aria-expanded": !isCollapsed,
                  onClick: () => setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(group.directory)) next.delete(group.directory);
                    else next.add(group.directory);
                    return next;
                  }),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { "aria-hidden": "true", children: isCollapsed ? "\u203A" : "\u2304" }),
                    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-tree-dir-name", children: group.directory })
                  ]
                }
              ),
              isCollapsed ? null : group.files.map((file) => /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
                "button",
                {
                  type: "button",
                  className: [
                    "cr-tree-file",
                    currentFile === file.path ? "cr-tree-file-active" : ""
                  ].filter(Boolean).join(" "),
                  onClick: () => {
                    const first = firstChangedLine(file);
                    onJump(file.path, first?.line);
                  },
                  title: file.path,
                  "aria-current": currentFile === file.path ? "true" : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
                      "span",
                      {
                        className: `cr-tree-status cr-tree-status-${file.status}${file.conflicted === true ? " cr-tree-status-conflict" : ""}`,
                        "aria-hidden": "true",
                        children: file.conflicted === true ? "U" : statusLetter(file.status)
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-tree-path", children: file.path.slice(
                      group.directory === "/" ? 0 : group.directory.length + 1
                    ) }),
                    /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-tree-stat", children: [
                      file.added > 0 ? `+${file.added}` : "",
                      file.deleted > 0 ? ` \u2212${file.deleted}` : ""
                    ] }),
                    riskBadge(file.path),
                    (openCommentsByPath.get(file.path) ?? 0) > 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
                      "span",
                      {
                        className: "cr-tree-comments",
                        "aria-label": `${openCommentsByPath.get(file.path) ?? 0} open comments`,
                        title: `${openCommentsByPath.get(file.path) ?? 0} open comments`,
                        children: openCommentsByPath.get(file.path)
                      }
                    ) : null
                  ]
                },
                file.path
              ))
            ] }, group.directory);
          }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-diff-main", children: [
          conflictedFiles.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-conflict-banner", role: "alert", children: [
            /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("strong", { children: [
              "Merge conflicts",
              /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-conflict-count", children: [
                conflictedFiles.length,
                " unresolved file",
                conflictedFiles.length === 1 ? "" : "s"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("p", { children: "Resolve these conflicts in the worktree before merging. The diff may contain conflict markers until the index is clean." }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("ul", { children: conflictedFiles.map((file) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
              "button",
              {
                type: "button",
                className: "cr-link-button",
                onClick: () => onJump(file.path, firstChangedLine(file)?.line),
                children: file.path
              }
            ) }, file.path)) })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-diff-toolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "cr-segmented", role: "group", "aria-label": "Diff range", children: [
              /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-segmented-button",
                  "aria-pressed": delta && canDelta,
                  "aria-describedby": !canDelta && deltaHint !== void 0 ? "cr-delta-hint" : void 0,
                  disabled: !canDelta,
                  onClick: () => onDeltaChange(true),
                  children: "Delta"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-segmented-button",
                  "aria-pressed": !delta,
                  onClick: () => onDeltaChange(false),
                  children: "Full diff to base"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-meta cr-diff-scope-note", children: delta && canDelta ? `r${round} vs r${round - 1}` : "base \u2192 head" }),
            !canDelta && deltaHint !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-diff-delta-note", id: "cr-delta-hint", children: [
              deltaHint,
              round <= 1 && onRequestNextRound !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { type: "button", className: "cr-link-button", onClick: onRequestNextRound, children: "Create the next round" }) : null
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "cr-segmented", role: "group", "aria-label": "Code display", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
              "button",
              {
                type: "button",
                className: "cr-segmented-button",
                "aria-pressed": wrap,
                onClick: () => setWrap((value) => !value),
                children: "Wrap lines"
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: "cr-meta cr-diff-count", children: [
              filteredFiles.length,
              " file",
              filteredFiles.length === 1 ? "" : "s"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-meta cr-shortcut-hint", "aria-hidden": "true", children: "j/k files \xB7 c comment" }),
            /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("label", { className: "cr-mobile-file-select", children: [
              /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "cr-visually-hidden", children: "Jump to file" }),
              /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
                "select",
                {
                  value: activeFile ?? "",
                  onChange: (event) => {
                    if (event.target.value !== "") onJump(event.target.value);
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("option", { value: "", children: "Jump to file\u2026" }),
                    filteredFiles.map((file) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("option", { value: file.path, children: file.path }, file.path))
                  ]
                }
              )
            ] })
          ] }),
          filteredFiles.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            EmptyState,
            {
              title: delta ? "No files changed in this round" : "No files match this filter",
              description: delta ? "Switch to the full diff to review the whole branch." : "Clear the file filter to see the complete diff.",
              action: delta ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Button, { variant: "secondary", onClick: () => onDeltaChange(false), children: "Show full diff" }) : void 0
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            "div",
            {
              className: ["cr-diff-files", wrap ? "cr-diff-wrap" : ""].filter(Boolean).join(" "),
              ref: filesRef,
              children: filteredFiles.map((file) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
                DiffFileSection,
                {
                  file,
                  comments,
                  round,
                  active: currentFile === file.path,
                  activeLine: activeFile === file.path ? activeLine : void 0,
                  activeCommentId,
                  composer,
                  dragRange: dragRange ?? touchSelection,
                  findings,
                  questions,
                  findingDecisions,
                  onDecideFinding,
                  decidingFindingId,
                  findingDecisionError,
                  onJump,
                  onLoadDiff,
                  onViewFullFile: (file2) => setFullFile({ file: file2 }),
                  onSelectLine,
                  onLineDragStart: beginLineDrag,
                  onLineDragEnter: enterLine,
                  onLineTouchStart: beginTouchLineSelection,
                  onOpenComposer,
                  onOpenFinding,
                  consumeSuppressedClick,
                  renderComposer,
                  onReply,
                  onCommentState,
                  onCommentJump,
                  onCommentFocus,
                  onAnswerQuestion,
                  readOnly
                },
                file.path
              ))
            }
          )
        ] }),
        fullFile !== null ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
          FullFileDialog,
          {
            file: fullFile.file,
            comments: allComments ?? comments,
            round,
            initialSide: fullFile.side,
            initialLine: fullFile.line,
            composer: fullFileComposer !== null && fullFileComposer !== void 0 && fullFileComposer.path === fullFile.file.path ? {
              side: fullFileComposer.side,
              lineStart: fullFileComposer.lineStart,
              lineEnd: fullFileComposer.lineEnd
            } : null,
            activeCommentId,
            readOnly,
            controllerRef: fullFileControllerRef,
            findings,
            questions,
            findingDecisions,
            onDecideFinding,
            decidingFindingId,
            findingDecisionError,
            ...onOpenFinding === void 0 ? {} : {
              onOpenFinding: (finding) => {
                setFullFile(null);
                onOpenFinding(finding);
              }
            },
            onClose: () => setFullFile(null),
            onOpenComposer: (side, start, end) => onOpenComposer(fullFile.file, side, start, end, "full"),
            onCancelComposer,
            ...renderComposer === void 0 ? {} : {
              renderComposer: (side, start, end) => renderComposer(fullFile.file, side, start, end)
            },
            onReply,
            onState: onCommentState,
            onCommentJump,
            onCommentFocus,
            onAnswerQuestion
          },
          `${fullFile.file.path}:${fullFile.side ?? "default"}:${fullFile.line ?? "all"}`
        ) : null
      ]
    }
  );
}

// packages/ui/src/review/drafts.ts
var PREFIX = "dsh-code-review:comment-draft:";
var VERSION = 1;
var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var MAX_BODY = 32e3;
var MAX_SNIPPET = 1e5;
function storageOrUndefined() {
  try {
    return globalThis.localStorage;
  } catch {
    return void 0;
  }
}
function draftStorageKey(reviewId) {
  return `${PREFIX}${reviewId}`;
}
function isLine(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1e6;
}
function isStoredDraft(value) {
  if (typeof value !== "object" || value === null) return false;
  const draft = value;
  return draft.version === VERSION && typeof draft.path === "string" && draft.path.length > 0 && draft.path.length <= 4096 && (draft.side === "new" || draft.side === "old") && isLine(draft.lineStart) && isLine(draft.lineEnd) && draft.lineStart <= draft.lineEnd && typeof draft.body === "string" && draft.body.length <= MAX_BODY && typeof draft.suggestionEnabled === "boolean" && typeof draft.original === "string" && draft.original.length <= MAX_SNIPPET && typeof draft.replacement === "string" && draft.replacement.length <= MAX_SNIPPET && typeof draft.updatedAt === "number" && Number.isFinite(draft.updatedAt);
}
function readDraft(reviewId, storage = storageOrUndefined(), now = Date.now()) {
  if (storage === void 0) return null;
  let raw;
  try {
    raw = storage.getItem(draftStorageKey(reviewId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDraft(reviewId, storage);
    return null;
  }
  if (!isStoredDraft(parsed) || now - parsed.updatedAt > MAX_AGE_MS) {
    clearDraft(reviewId, storage);
    return null;
  }
  return parsed;
}
function writeDraft(reviewId, draft, storage = storageOrUndefined(), now = Date.now()) {
  if (storage === void 0) return false;
  const record = {
    ...draft,
    version: VERSION,
    updatedAt: draft.updatedAt ?? now
  };
  if (!isStoredDraft(record)) return false;
  try {
    storage.setItem(draftStorageKey(reviewId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
function clearDraft(reviewId, storage = storageOrUndefined()) {
  if (storage === void 0) return;
  try {
    storage.removeItem(draftStorageKey(reviewId));
  } catch {
  }
}

// packages/ui/src/review/FixStatusBoard.tsx
var import_jsx_runtime19 = require("react/jsx-runtime");
function FixStatusBoard({
  counts,
  active,
  onFilter,
  compact = false
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
    "div",
    {
      className: ["cr-fix-board", compact ? "cr-fix-board-compact" : ""].filter(Boolean).join(" "),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("div", { className: "cr-card-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { className: "cr-card-title", children: "Fix status" }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { className: "cr-meta", children: "human + agent signals" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("div", { className: "cr-fix-grid", role: "group", "aria-label": "Filter comments by fix status", children: FIX_GROUPS.map((group) => {
          const selected = active === group.id;
          return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
            "button",
            {
              type: "button",
              className: "cr-fix-cell",
              "data-group": group.id,
              "aria-pressed": selected,
              title: group.description,
              onClick: () => onFilter(selected ? "all" : group.id),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { className: "cr-fix-count", children: counts[group.id] }),
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { className: "cr-fix-label", children: group.label })
              ]
            },
            group.id
          );
        }) }),
        active !== "all" ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("button", { type: "button", className: "cr-link-button", onClick: () => onFilter("all"), children: "Clear filter" }) : null,
        !compact ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "cr-meta cr-fix-note", children: "Claims and reviewer verification are shown side by side. A human decision wins when set." }) : null
      ]
    }
  );
}

// packages/ui/src/review/ReportPanel.tsx
var import_react18 = require("react");

// packages/ui/src/primitives/MultiSelect.tsx
var import_react17 = require("react");
var import_jsx_runtime20 = require("react/jsx-runtime");
function summaryFor(options, selected, allLabel) {
  if (selected.size === 0) return allLabel;
  if (selected.size === 1) {
    const value = [...selected][0];
    const option = options.find((item) => item.value === value);
    return option === void 0 ? "1 selected" : String(option.label);
  }
  if (selected.size <= 2) {
    return options.filter((item) => selected.has(item.value)).map((item) => String(item.label)).join(", ");
  }
  return `${String(selected.size)} selected`;
}
function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
  disabled = false
}) {
  const id = (0, import_react17.useId)();
  const buttonId = `${id}-button`;
  const menuId = `${id}-menu`;
  const containerRef = (0, import_react17.useRef)(null);
  const buttonRef = (0, import_react17.useRef)(null);
  const [open, setOpen] = (0, import_react17.useState)(false);
  const summary = summaryFor(options, selected, allLabel);
  (0, import_react17.useEffect)(() => {
    if (selected.size === 0) return;
    const available = new Set(options.map((option) => option.value));
    if ([...selected].every((value) => available.has(value))) return;
    onChange(new Set([...selected].filter((value) => available.has(value))));
  }, [onChange, options, selected]);
  (0, import_react17.useEffect)(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (containerRef.current?.contains(event.target) !== true) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  function toggleOption(value) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === options.length ? /* @__PURE__ */ new Set() : next);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(
    "div",
    {
      className: "cr-multi-select",
      ref: containerRef,
      "data-open": open ? "" : void 0,
      onKeyDown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          buttonRef.current?.focus();
        }
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: "cr-label", id: `${id}-label`, children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(
          "button",
          {
            ref: buttonRef,
            id: buttonId,
            type: "button",
            className: "cr-multi-select-trigger",
            "aria-label": `${label}: ${summary}`,
            "aria-haspopup": "true",
            "aria-expanded": open,
            "aria-controls": menuId,
            disabled,
            onClick: () => setOpen((value) => !value),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: summary }),
              /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: "cr-multi-select-chevron", "aria-hidden": "true", children: "\u25BE" })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(
          "div",
          {
            className: "cr-multi-select-menu",
            id: menuId,
            role: "group",
            "aria-labelledby": `${id}-label`,
            onBlur: (event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setOpen(false);
              }
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("label", { className: "cr-check cr-multi-select-option", children: [
                /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: selected.size === 0,
                    disabled,
                    onChange: () => onChange(/* @__PURE__ */ new Set())
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: allLabel })
              ] }),
              options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("label", { className: "cr-check cr-multi-select-option", children: [
                /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: selected.has(option.value),
                    disabled,
                    onChange: () => toggleOption(option.value)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: option.label })
              ] }, option.value))
            ]
          }
        )
      ]
    }
  );
}

// packages/ui/src/review/ReportPanel.tsx
var import_jsx_runtime21 = require("react/jsx-runtime");
var SEVERITIES = ["blocker", "major", "minor", "nit"];
var CATEGORIES = [
  "security",
  "correctness",
  "tests",
  "performance",
  "maintainability",
  "api",
  "concurrency",
  "docs",
  "other"
];
function severityTone2(severity) {
  if (severity === "blocker") return "danger";
  if (severity === "major") return "warning";
  if (severity === "minor") return "info";
  return "neutral";
}
function riskTone(risk) {
  if (risk === "critical") return "danger";
  if (risk === "high") return "warning";
  if (risk === "low") return "success";
  return "neutral";
}
var EMPTY_DECISIONS = /* @__PURE__ */ new Map();
var EMPTY_TRANSFERRED = /* @__PURE__ */ new Set();
var PAGE_SIZE = 50;
function PaginationBar({
  kind,
  placement,
  page,
  pageCount,
  pageStart,
  pageEnd,
  total,
  onPageChange
}) {
  const title = kind === "report" ? "Report" : "Question";
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("nav", { className: "cr-report-pagination", "aria-label": `${title} pages (${placement})`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { className: "cr-meta", children: [
      pageStart + 1,
      "\u2013",
      pageEnd,
      " of ",
      total
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-report-pagination-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
        Button,
        {
          size: "small",
          variant: "secondary",
          "aria-label": `Previous ${kind} page (${placement})`,
          disabled: page === 0,
          onClick: () => onPageChange(page - 1),
          children: "Previous"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { className: "cr-meta", children: [
        "Page ",
        page + 1,
        " of ",
        pageCount
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
        Button,
        {
          size: "small",
          variant: "secondary",
          "aria-label": `Next ${kind} page (${placement})`,
          disabled: page >= pageCount - 1,
          onClick: () => onPageChange(page + 1),
          children: "Next"
        }
      )
    ] })
  ] });
}
function ReportPanel({
  report,
  onJump,
  onJumpComment,
  decisions = EMPTY_DECISIONS,
  canDecide = false,
  onDecide,
  decidingFindingId,
  findingDecisionError,
  onDecideSelected,
  bulkPending = false,
  bulkError,
  partial = false,
  liveProgress,
  live = true,
  pending = false,
  comments = [],
  transferredFindingIds = EMPTY_TRANSFERRED,
  onOpenConversation,
  round,
  readOnly = false,
  activeCommentId,
  pendingCommentId,
  onReply,
  onCommentState,
  onCommentEdit,
  onCommentDelete,
  onCommentJump,
  onCommentFocus,
  onAddComment
}) {
  const [severities, setSeverities] = (0, import_react18.useState)(() => /* @__PURE__ */ new Set());
  const [categories, setCategories] = (0, import_react18.useState)(() => /* @__PURE__ */ new Set());
  const [page, setPage] = (0, import_react18.useState)(0);
  const [questionPage, setQuestionPage] = (0, import_react18.useState)(0);
  const [section, setSection] = (0, import_react18.useState)("issues");
  const [expandedFindings, setExpandedFindings] = (0, import_react18.useState)(() => /* @__PURE__ */ new Set());
  const [selectedIds, setSelectedIds] = (0, import_react18.useState)(() => /* @__PURE__ */ new Set());
  const [bulkState, setBulkState] = (0, import_react18.useState)(null);
  const [bulkFindingIds, setBulkFindingIds] = (0, import_react18.useState)([]);
  const [bulkRound, setBulkRound] = (0, import_react18.useState)(null);
  const [bulkAttempted, setBulkAttempted] = (0, import_react18.useState)(false);
  const listRef = (0, import_react18.useRef)(null);
  const questionListRef = (0, import_react18.useRef)(null);
  const activeFindings = report === null || report === void 0 ? [] : report.findings.filter((finding) => !transferredFindingIds.has(finding.id));
  const transferredCount = report === null || report === void 0 ? 0 : report.findings.length - activeFindings.length;
  const findings = report === null || report === void 0 ? [] : filterFindings(activeFindings, severities, categories);
  const questions = report === null || report === void 0 ? [] : report.questions;
  const decidableFindings = activeFindings.filter(
    (finding) => finding.kind !== "praise" && !decisions.has(finding.id)
  );
  const selectedFindings = decidableFindings.filter((finding) => selectedIds.has(finding.id));
  const selectedCount = selectedFindings.length;
  const filteredDecidable = findings.filter(
    (finding) => finding.kind !== "praise" && !decisions.has(finding.id)
  );
  const allFilteredSelected = filteredDecidable.length > 0 && filteredDecidable.every((finding) => selectedIds.has(finding.id));
  const someFilteredSelected = filteredDecidable.some((finding) => selectedIds.has(finding.id));
  const showSelection = !partial && !readOnly && canDecide && onDecideSelected !== void 0;
  const dialogRound = round ?? report?.round ?? 1;
  (0, import_react18.useEffect)(() => {
    if (bulkState === null || bulkPending) return;
    if (bulkRound !== dialogRound || !showSelection || bulkFindingIds.length === 0) {
      setBulkState(null);
      setBulkFindingIds([]);
      setBulkRound(null);
      setBulkAttempted(false);
    }
  }, [bulkFindingIds, bulkPending, bulkRound, bulkState, dialogRound, showSelection]);
  (0, import_react18.useEffect)(() => {
    setSelectedIds(/* @__PURE__ */ new Set());
  }, [severities, categories, report?.reviewId, report?.round, partial, canDecide, readOnly]);
  const pageCount = Math.max(1, Math.ceil(findings.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, findings.length);
  const visibleFindings = findings.slice(pageStart, pageStart + PAGE_SIZE);
  const questionPageCount = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
  const currentQuestionPage = Math.min(questionPage, questionPageCount - 1);
  const questionPageStart = currentQuestionPage * PAGE_SIZE;
  const questionPageEnd = Math.min(questionPageStart + PAGE_SIZE, questions.length);
  const visibleQuestions = questions.slice(questionPageStart, questionPageStart + PAGE_SIZE);
  function toggleFinding(findingId) {
    setExpandedFindings((current) => {
      const next = new Set(current);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  }
  function toggleSelection(findingId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const finding of filteredDecidable) next.delete(finding.id);
      } else {
        for (const finding of filteredDecidable) next.add(finding.id);
      }
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(/* @__PURE__ */ new Set());
  }
  (0, import_react18.useEffect)(() => {
    setPage(0);
    if (listRef.current !== null) listRef.current.scrollTop = 0;
  }, [severities, categories, report?.reviewId, report?.round, partial]);
  (0, import_react18.useEffect)(() => {
    setPage((value) => Math.min(value, pageCount - 1));
  }, [pageCount]);
  (0, import_react18.useEffect)(() => {
    setQuestionPage(0);
    if (questionListRef.current !== null) questionListRef.current.scrollTop = 0;
  }, [report?.reviewId, report?.round, partial]);
  (0, import_react18.useEffect)(() => {
    setQuestionPage((value) => Math.min(value, questionPageCount - 1));
  }, [questionPageCount]);
  const previousPage = (0, import_react18.useRef)(currentPage);
  (0, import_react18.useEffect)(() => {
    if (previousPage.current === currentPage) return;
    previousPage.current = currentPage;
    if (listRef.current !== null) listRef.current.scrollTop = 0;
  }, [currentPage]);
  const previousQuestionPage = (0, import_react18.useRef)(currentQuestionPage);
  (0, import_react18.useEffect)(() => {
    if (previousQuestionPage.current === currentQuestionPage) return;
    previousQuestionPage.current = currentQuestionPage;
    if (questionListRef.current !== null) questionListRef.current.scrollTop = 0;
  }, [currentQuestionPage]);
  if (report === null || report === void 0) {
    return pending ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
      EmptyState,
      {
        title: "Waiting for the first shard report",
        description: "Findings appear here as soon as a shard finishes. The final report follows when the reviewer completes."
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
      EmptyState,
      {
        title: "No reviewer report",
        description: "The reviewer has not produced a report for this review. Findings appear here when the agent finishes."
      }
    );
  }
  const counts = findingCounts({ ...report, findings: activeFindings });
  const filtered = severities.size > 0 || categories.size > 0;
  const reportRound = round ?? report.round;
  function commentsFor(file, line) {
    return commentsAtLine(comments, reportRound, file, line, "new");
  }
  function openBulkDialog(state) {
    setBulkAttempted(false);
    setBulkFindingIds(selectedFindings.map((finding) => finding.id));
    setBulkRound(dialogRound);
    setBulkState(state);
  }
  function closeBulkDialog() {
    if (!bulkPending) {
      setBulkState(null);
      setBulkFindingIds([]);
      setBulkRound(null);
      setBulkAttempted(false);
    }
  }
  async function submitBulkDecision() {
    if (bulkState === null || onDecideSelected === void 0) return;
    setBulkAttempted(true);
    if (await onDecideSelected(bulkState, [...bulkFindingIds])) {
      setBulkState(null);
      setBulkFindingIds([]);
      setSelectedIds(/* @__PURE__ */ new Set());
    }
  }
  const bulkAction = bulkState === "accepted" ? "Accept" : "Dismiss";
  const bulkCount = bulkFindingIds.length;
  const bulkFindingNoun = bulkCount === 1 ? "finding" : "findings";
  const bulkTitle = `${bulkAction} ${bulkCount} selected ${bulkFindingNoun}?`;
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-report", children: [
    partial && liveProgress !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("p", { className: "cr-notice cr-notice-info", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("strong", { children: live ? "Live partial report" : "Partial report" }),
      " \xB7",
      " ",
      liveProgress.completedShards,
      " of ",
      liveProgress.totalShards,
      " shards reported. Findings are provisional; decisions unlock with the final report."
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("section", { className: "cr-report-summary", "aria-label": "Reviewer summary", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-report-summary-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h2", { className: "cr-card-title", children: "Reviewer summary" }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(Badge, { tone: riskTone(report.riskLevel), children: [
          report.riskLevel,
          " risk"
        ] }),
        partial ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(Badge, { tone: "info", children: "partial" }) : null,
        report.skipped === true ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(Badge, { tone: "neutral", children: "skipped" }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "cr-report-copy", tabIndex: 0, children: report.summary }),
      transferredCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("p", { className: "cr-report-transferred", role: "status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(Badge, { tone: "info", children: [
          transferredCount,
          " accepted"
        ] }),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-meta", children: "moved to comments" }),
        onOpenConversation !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("button", { type: "button", className: "cr-link-button", onClick: onOpenConversation, children: "Open Conversation" }) : null
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-report-counts", children: [
        counts.blocker > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(Badge, { tone: "danger", children: [
          counts.blocker,
          " blocker"
        ] }) : null,
        counts.major > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(Badge, { tone: "warning", children: [
          counts.major,
          " major"
        ] }) : null,
        counts.minor > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(Badge, { tone: "info", children: [
          counts.minor,
          " minor"
        ] }) : null,
        counts.nit > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(Badge, { tone: "neutral", children: [
          counts.nit,
          " nit"
        ] }) : null,
        report.tests.ran ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
          Badge,
          {
            tone: report.tests.commands.some((item) => item.result === "fail") ? "danger" : "success",
            children: "tests ran"
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(Badge, { tone: "neutral", children: "tests not run" })
      ] }),
      report.dirtyWorktree === true ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "cr-notice cr-notice-warning", children: "The reviewer changed the worktree during the run. Inspect it before merging." }) : null,
      report.warnings.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { className: "cr-report-warnings", "aria-label": "Reviewer warnings", children: report.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("li", { children: warning }, warning)) }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("section", { className: "cr-report-browser", "aria-label": "Report findings and questions", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
      Tabs,
      {
        items: [
          {
            id: "issues",
            label: /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
              "Issues",
              /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-tab-count", children: activeFindings.length })
            ] }),
            content: /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-report-issues", children: [
              /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-report-toolbar", children: [
                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                  MultiSelect,
                  {
                    label: "Severity",
                    allLabel: "All severities",
                    options: SEVERITIES.map((value) => ({ value, label: value })),
                    selected: severities,
                    onChange: setSeverities
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                  MultiSelect,
                  {
                    label: "Category",
                    allLabel: "All categories",
                    options: CATEGORIES.map((value) => ({ value, label: value })),
                    selected: categories,
                    onChange: setCategories
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { className: "cr-meta", "aria-live": "polite", children: [
                  findings.length,
                  " of ",
                  activeFindings.length,
                  " findings"
                ] }),
                filtered ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "cr-link-button",
                    onClick: () => {
                      setSeverities(/* @__PURE__ */ new Set());
                      setCategories(/* @__PURE__ */ new Set());
                    },
                    children: "Clear filters"
                  }
                ) : null
              ] }),
              showSelection && filteredDecidable.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                "div",
                {
                  className: "cr-report-selection",
                  role: "group",
                  "aria-label": "Finding selection",
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("label", { className: "cr-check cr-report-select-all", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                        "input",
                        {
                          type: "checkbox",
                          checked: allFilteredSelected,
                          disabled: bulkPending,
                          ref: (input) => {
                            if (input !== null) {
                              input.indeterminate = someFilteredSelected && !allFilteredSelected;
                            }
                          },
                          onChange: toggleAllFiltered
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { children: [
                        "Select all filtered (",
                        filteredDecidable.length,
                        ")"
                      ] })
                    ] }),
                    selectedCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { className: "cr-meta", "aria-live": "polite", children: [
                        selectedCount,
                        " selected"
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                        "button",
                        {
                          type: "button",
                          className: "cr-link-button",
                          disabled: bulkPending,
                          onClick: clearSelection,
                          children: "Clear selection"
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                        "div",
                        {
                          className: "cr-report-bulk-actions",
                          role: "group",
                          "aria-label": "Selected finding decisions",
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                              Button,
                              {
                                size: "small",
                                variant: "secondary",
                                disabled: bulkPending,
                                onClick: () => openBulkDialog("accepted"),
                                children: [
                                  "Accept selected (",
                                  selectedCount,
                                  ")"
                                ]
                              }
                            ),
                            /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                              Button,
                              {
                                size: "small",
                                variant: "secondary",
                                disabled: bulkPending,
                                onClick: () => openBulkDialog("dismissed"),
                                children: [
                                  "Dismiss selected (",
                                  selectedCount,
                                  ")"
                                ]
                              }
                            )
                          ]
                        }
                      )
                    ] }) : null
                  ]
                }
              ) : null,
              findings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                EmptyState,
                {
                  title: filtered ? "No findings match these filters" : activeFindings.length === 0 && transferredCount > 0 ? "All findings accepted" : "No findings",
                  description: activeFindings.length === 0 && transferredCount > 0 ? "Accepted findings are available in Conversation." : filtered ? "Clear the severity or category filter to see the reviewer report." : "The reviewer did not report any issues for this round."
                }
              ) : /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
                findings.length > PAGE_SIZE ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                  PaginationBar,
                  {
                    kind: "report",
                    placement: "top",
                    page: currentPage,
                    pageCount,
                    pageStart,
                    pageEnd,
                    total: findings.length,
                    onPageChange: setPage
                  }
                ) : null,
                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "cr-report-scroll", ref: listRef, children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ol", { className: "cr-findings", "aria-label": "Reviewer findings", children: visibleFindings.map((finding) => {
                  const expanded = expandedFindings.has(finding.id);
                  const decision = decisions.get(finding.id);
                  const selected = selectedIds.has(finding.id);
                  const bodyId = `report-finding-body-${finding.id}`;
                  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                    "li",
                    {
                      className: "cr-finding-item",
                      id: `finding-${finding.id}`,
                      tabIndex: -1,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                          "div",
                          {
                            className: `cr-finding${expanded ? " cr-finding-expanded" : " cr-finding-collapsed"}${selected ? " cr-finding-selected" : ""}`,
                            children: [
                              /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                                "div",
                                {
                                  className: "cr-finding-head",
                                  onClick: () => toggleFinding(finding.id),
                                  children: [
                                    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                                      "button",
                                      {
                                        type: "button",
                                        className: "cr-finding-toggle",
                                        "aria-expanded": expanded,
                                        "aria-controls": expanded ? bodyId : void 0,
                                        "aria-label": `${expanded ? "Collapse" : "Expand"} finding ${finding.title}`,
                                        onClick: (event) => {
                                          event.stopPropagation();
                                          toggleFinding(finding.id);
                                        },
                                        children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { "aria-hidden": "true", children: expanded ? "\u25BE" : "\u25B8" })
                                      }
                                    ),
                                    showSelection && finding.kind !== "praise" && decision === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                                      "input",
                                      {
                                        type: "checkbox",
                                        className: "cr-finding-select",
                                        checked: selected,
                                        disabled: bulkPending,
                                        "aria-label": `Select finding ${finding.title}`,
                                        onClick: (event) => event.stopPropagation(),
                                        onChange: () => toggleSelection(finding.id)
                                      }
                                    ) : null,
                                    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(Badge, { tone: severityTone2(finding.severity), children: finding.severity }),
                                    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(Badge, { tone: "neutral", children: finding.category }),
                                    finding.kind !== "issue" ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(Badge, { tone: "info", children: finding.kind }) : null,
                                    decision !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                                      Badge,
                                      {
                                        tone: decision.state === "accepted" ? "success" : "neutral",
                                        children: decision.state === "accepted" ? "Accepted" : "Dismissed"
                                      }
                                    ) : null,
                                    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                                      "button",
                                      {
                                        type: "button",
                                        className: "cr-finding-location",
                                        onClick: (event) => {
                                          event.stopPropagation();
                                          onJump(finding);
                                        },
                                        "aria-label": `Jump to ${finding.file} line ${finding.lineStart}`,
                                        children: [
                                          finding.file,
                                          ":",
                                          finding.lineStart
                                        ]
                                      }
                                    ),
                                    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { className: "cr-meta", children: [
                                      finding.confidence,
                                      " confidence"
                                    ] })
                                  ]
                                }
                              ),
                              /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h3", { className: "cr-finding-title", children: finding.title }),
                              expanded ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-finding-body", id: bodyId, children: [
                                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "cr-finding-copy", children: finding.rationale }),
                                finding.evidence !== "" ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("pre", { className: "cr-evidence", "aria-label": "Evidence", children: finding.evidence }) : null,
                                finding.suggestion !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                                  "div",
                                  {
                                    className: "cr-suggestion",
                                    "aria-label": "Finding suggestion",
                                    children: [
                                      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-suggestion-head", children: [
                                        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-suggestion-label", children: "Suggested change" }),
                                        finding.unanchored === true ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(Badge, { tone: "warning", children: "unanchored" }) : null
                                      ] }),
                                      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-suggestion-block cr-suggestion-old", children: [
                                        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-suggestion-caption", children: "Before" }),
                                        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("pre", { children: finding.suggestion.original })
                                      ] }),
                                      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "cr-suggestion-block cr-suggestion-new", children: [
                                        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-suggestion-caption", children: "After" }),
                                        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("pre", { children: finding.suggestion.replacement })
                                      ] })
                                    ]
                                  }
                                ) : null,
                                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                                  FindingDecisionControls,
                                  {
                                    finding,
                                    decision,
                                    showStatus: false,
                                    readOnly: !canDecide || onDecide === void 0,
                                    pending: decidingFindingId === finding.id,
                                    error: findingDecisionError?.findingId === finding.id ? findingDecisionError.message : null,
                                    onDecide: onDecide ?? (async () => false)
                                  }
                                )
                              ] }) : null
                            ]
                          }
                        ),
                        expanded ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                          ThreadConversation,
                          {
                            comments: commentsFor(finding.file, finding.lineStart),
                            action: "comment",
                            readOnly,
                            activeCommentId,
                            pendingCommentId,
                            onReply,
                            onState: onCommentState,
                            onEdit: onCommentEdit,
                            onDelete: onCommentDelete,
                            onJump: onCommentJump,
                            onFocus: onCommentFocus,
                            ...onAddComment === void 0 || finding.unanchored === true ? {} : {
                              onAdd: (body) => onAddComment(
                                {
                                  file: finding.file,
                                  lineStart: finding.lineStart,
                                  lineEnd: finding.lineEnd
                                },
                                body
                              )
                            }
                          }
                        ) : null
                      ]
                    },
                    finding.id
                  );
                }) }) }),
                findings.length > PAGE_SIZE ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                  PaginationBar,
                  {
                    kind: "report",
                    placement: "bottom",
                    page: currentPage,
                    pageCount,
                    pageStart,
                    pageEnd,
                    total: findings.length,
                    onPageChange: setPage
                  }
                ) : null
              ] })
            ] })
          },
          {
            id: "questions",
            label: /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
              "Questions",
              /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-tab-count", children: report.questions.length })
            ] }),
            content: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "cr-report-questions", children: questions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
              EmptyState,
              {
                title: "No open questions",
                description: "The reviewer did not ask any questions for this round."
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
              questions.length > PAGE_SIZE ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                PaginationBar,
                {
                  kind: "question",
                  placement: "top",
                  page: currentQuestionPage,
                  pageCount: questionPageCount,
                  pageStart: questionPageStart,
                  pageEnd: questionPageEnd,
                  total: questions.length,
                  onPageChange: setQuestionPage
                }
              ) : null,
              /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "cr-report-scroll", ref: questionListRef, children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { className: "cr-question-list", "aria-label": "Open questions", children: visibleQuestions.map((question) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: "cr-link-button",
                    onClick: () => onJump({
                      file: question.file,
                      lineStart: question.line,
                      lineEnd: question.line
                    }),
                    children: [
                      question.file,
                      ":",
                      question.line
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("strong", { children: question.question }),
                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "cr-meta", children: question.why }),
                /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                  ThreadConversation,
                  {
                    comments: commentsFor(question.file, question.line),
                    action: "answer",
                    readOnly,
                    activeCommentId,
                    pendingCommentId,
                    onReply,
                    onState: onCommentState,
                    onEdit: onCommentEdit,
                    onDelete: onCommentDelete,
                    onJump: onCommentJump,
                    onFocus: onCommentFocus,
                    ...onAddComment === void 0 ? {} : {
                      onAdd: (body) => onAddComment(
                        {
                          file: question.file,
                          lineStart: question.line,
                          lineEnd: question.line
                        },
                        body
                      )
                    }
                  }
                )
              ] }, question.id)) }) }),
              questions.length > PAGE_SIZE ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
                PaginationBar,
                {
                  kind: "question",
                  placement: "bottom",
                  page: currentQuestionPage,
                  pageCount: questionPageCount,
                  pageStart: questionPageStart,
                  pageEnd: questionPageEnd,
                  total: questions.length,
                  onPageChange: setQuestionPage
                }
              ) : null
            ] }) })
          }
        ],
        value: section,
        onChange: (id) => setSection(id),
        label: "Report sections",
        className: "cr-report-tabs"
      }
    ) }),
    report.verification.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("section", { className: "cr-report-section", "aria-label": "Reviewer verification", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h2", { className: "cr-card-title", children: "Verification" }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { className: "cr-verification-list", children: report.verification.map((item) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
          Badge,
          {
            tone: item.status === "fixed" ? "success" : item.status === "not-fixed" ? "danger" : "warning",
            children: item.status
          }
        ),
        onJumpComment !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
          "button",
          {
            type: "button",
            className: "cr-link-button",
            onClick: () => onJumpComment(item.commentId),
            children: item.commentId
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-mono", children: item.commentId }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-meta", children: item.evidence })
      ] }, item.commentId)) })
    ] }) : null,
    report.tests.commands.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("section", { className: "cr-report-section", "aria-label": "Reviewer test commands", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h2", { className: "cr-card-title", children: "Tests" }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { className: "cr-test-list", children: report.tests.commands.map((command) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
          Badge,
          {
            tone: command.result === "pass" ? "success" : command.result === "fail" ? "danger" : "warning",
            children: command.result
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-mono", children: command.command }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "cr-meta", children: command.summary })
      ] }, command.command)) })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
      Dialog,
      {
        open: bulkState !== null,
        title: bulkTitle,
        description: `This will ${bulkAction.toLowerCase()} ${bulkCount} selected ${bulkFindingNoun} in the current report. Existing decisions and notes stay unchanged.`,
        closeDisabled: bulkPending,
        onClose: closeBulkDialog,
        actions: /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
            Button,
            {
              size: "small",
              variant: "secondary",
              disabled: bulkPending,
              onClick: closeBulkDialog,
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
            Button,
            {
              size: "small",
              variant: bulkState === "accepted" ? "primary" : "danger",
              loading: bulkPending,
              onClick: () => void submitBulkDecision(),
              children: [
                bulkAction,
                " ",
                bulkCount,
                " ",
                bulkFindingNoun
              ]
            }
          )
        ] }),
        children: bulkAttempted && bulkError !== null && bulkError !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "cr-error", role: "alert", children: bulkError }) : null
      }
    )
  ] });
}

// packages/ui/src/review/SignalsPanel.tsx
var import_jsx_runtime22 = require("react/jsx-runtime");
function toneLabel(tone) {
  if (tone === "danger") return "high";
  if (tone === "warning") return "medium";
  return "info";
}
function SignalsPanel({ signals, onJump }) {
  if (signals.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(
      EmptyState,
      {
        title: "No signals",
        description: "No deterministic risk patterns were found in this diff: tests, migrations, secrets, lockfiles and binary changes are checked."
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "cr-signals", children: [
    /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "cr-signals-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "cr-card-title", children: "Deterministic signals" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("span", { className: "cr-meta", children: [
        signals.length,
        " patterns found"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "cr-meta cr-signals-note", children: "Signals are heuristics, not verdicts. Use them to decide where to look first." }),
    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("ul", { className: "cr-signal-list", "aria-label": "Review signals", children: signals.map((signal) => /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("li", { className: "cr-signal", "data-tone": signal.tone, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "cr-signal-mark", "aria-hidden": "true", children: signal.tone === "danger" ? "!" : signal.tone === "warning" ? "\u25B2" : "\u2022" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "cr-signal-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "cr-signal-title-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: signal.label }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(
            Badge,
            {
              tone: signal.tone === "danger" ? "danger" : signal.tone === "warning" ? "warning" : "info",
              children: toneLabel(signal.tone)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "cr-meta", children: signal.detail })
      ] }),
      signal.file !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("button", { type: "button", className: "cr-link-button", onClick: () => onJump(signal), children: [
        signal.file,
        signal.line !== void 0 ? `:${signal.line}` : ""
      ] }) : null
    ] }, signal.id)) })
  ] });
}

// packages/ui/src/review/SubmitDialog.tsx
var import_react19 = require("react");
var import_jsx_runtime23 = require("react/jsx-runtime");
var VERDICTS = [
  { value: "approve", label: "Approve", description: "Close the review as approved." },
  {
    value: "request-changes",
    label: "Request changes",
    description: "Send feedback back to the agent session."
  },
  { value: "comment", label: "Comment only", description: "Send feedback without a verdict." }
];
function SubmitDialog({
  open,
  review,
  submitting = false,
  error,
  onClose,
  onSubmit,
  onJumpComment
}) {
  const [verdict, setVerdict] = (0, import_react19.useState)("request-changes");
  const [summary, setSummary] = (0, import_react19.useState)("");
  const [includeResolved, setIncludeResolved] = (0, import_react19.useState)(false);
  const previous = (review.submissions?.length ?? 0) > 0;
  const pending = review.comments.filter(
    (comment) => comment.deletedAt === void 0 && comment.state === "open"
  );
  const unresolved = pending.length;
  const resolved = review.comments.filter(
    (comment) => comment.deletedAt === void 0 && comment.state === "resolved"
  ).length;
  (0, import_react19.useEffect)(() => {
    if (!open) return;
    setVerdict("request-changes");
    setSummary("");
    setIncludeResolved(false);
  }, [open]);
  return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
    Dialog,
    {
      open,
      title: "Submit review",
      description: "The feedback package is delivered to the agent session that opened this review.",
      onClose,
      actions: /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)(import_jsx_runtime23.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(Button, { variant: "ghost", onClick: onClose, disabled: submitting, children: "Cancel" }),
        /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
          Button,
          {
            loading: submitting,
            onClick: () => onSubmit({
              verdict,
              ...summary.trim() === "" ? {} : { summary },
              includeResolved
            }),
            children: "Submit feedback"
          }
        )
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "cr-submit", children: [
        /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "cr-recipient-warning", role: "note", children: [
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("strong", { children: "Recipient session" }),
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { children: "Sending feedback resumes the agent session that initiated this review. The package includes unresolved comments, findings and verification. Resolved comments are included only when selected below." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("fieldset", { className: "cr-verdict-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("legend", { className: "cr-label", children: "Verdict" }),
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("div", { className: "cr-verdict-options", children: VERDICTS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("label", { className: "cr-verdict-option", children: [
            /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
              "input",
              {
                type: "radio",
                name: "verdict",
                value: option.value,
                checked: verdict === option.value,
                onChange: () => setVerdict(option.value)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("span", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("strong", { children: option.label }),
              /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "cr-meta", children: option.description })
            ] })
          ] }, option.value)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
          Textarea,
          {
            label: "Summary",
            value: summary,
            onChange: (event) => setSummary(event.target.value),
            rows: 4,
            placeholder: "What should the agent do next? Context for the feedback package."
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "cr-submit-counts", children: [
          /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)(Badge, { tone: unresolved > 0 ? "warning" : "success", children: [
            unresolved,
            " unresolved"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)(Badge, { tone: "neutral", children: [
            resolved,
            " resolved"
          ] }),
          previous ? /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(Badge, { tone: "info", children: "follow-up submission" }) : null
        ] }),
        pending.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("section", { className: "cr-submit-pending", "aria-label": "Pending comments in this submission", children: [
          /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "cr-submit-pending-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("h3", { children: "Pending comments" }),
            /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { children: pending.length })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { className: "cr-meta", children: "These unresolved threads will be sent to the agent. Double-check them before submitting." }),
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("ol", { className: "cr-submit-pending-list", children: pending.map((comment) => {
            const anchor = latestAnchor(comment);
            const body = comment.body.replace(/\s+/g, " ").trim();
            const source = actorSource(comment.author.kind);
            return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)(
              "button",
              {
                type: "button",
                className: "cr-submit-pending-item",
                disabled: onJumpComment === void 0,
                onClick: () => onJumpComment?.(comment.id),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "cr-submit-pending-path cr-mono", children: anchor === void 0 ? "unanchored" : `${anchor.path}:${anchor.lineStart}` }),
                  /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(Badge, { tone: source.tone, children: source.label }),
                  /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "cr-submit-pending-body", children: body })
                ]
              }
            ) }, comment.id);
          }) })
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("label", { className: "cr-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
            "input",
            {
              type: "checkbox",
              checked: includeResolved,
              onChange: (event) => setIncludeResolved(event.target.checked)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { children: "Include resolved comments in the package" })
        ] }),
        previous ? /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { className: "cr-meta", children: "This review was submitted before. Unresolved comments are sent again; select the option above to include resolved comments as well." }) : null,
        error !== null && error !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { className: "cr-error", role: "alert", children: error }) : null
      ] })
    }
  );
}

// packages/ui/src/review/ReviewDetail.tsx
var import_jsx_runtime24 = require("react/jsx-runtime");
function eventInNativeScope(event) {
  const scope = typeof document === "undefined" ? null : document.querySelector(".cr-native-scope");
  if (scope === null) return true;
  return event.target instanceof Node && scope.contains(event.target);
}
var TABS = [
  { id: "conversation", label: "Conversation" },
  { id: "files", label: "Files changed" },
  { id: "report", label: "Report" },
  { id: "signals", label: "Signals" }
];
function coverageLabel(coverage) {
  const byStatus = coverage.totals.byStatus;
  const reviewed = byStatus["deep-reviewed"] + byStatus["light-reviewed"];
  const counts = [
    ["pending", byStatus.pending],
    ["deferred", byStatus.deferred],
    ["failed", byStatus.failed],
    ["no-hunks", byStatus["no-hunks"]],
    ["skipped", byStatus.skipped],
    ["manifest-only", byStatus["manifest-only"]]
  ];
  const parts = [`Reviewed ${reviewed}/${coverage.totals.files} files`];
  for (const [label, count] of counts) {
    if (count > 0) parts.push(`${count} ${label}`);
  }
  if (coverage.incomplete === true) parts.push("manifest incomplete");
  return parts.join(" \xB7 ");
}
var SHORTCUTS = [
  ["c", "Comment on the selected line"],
  ["r", "Resolve the selected comment"],
  ["j / k", "Next / previous file"],
  ["[ / ]", "Previous / next round"],
  ["?", "Show this help"],
  ["g l", "Go to the review list"],
  ["Esc", "Close the composer or dialog"]
];
function useLiveLocation(provided) {
  const [live, setLive] = (0, import_react20.useState)(
    () => typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  (0, import_react20.useEffect)(() => {
    if (provided !== void 0) return;
    const update = () => setLive(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, [provided]);
  return provided ?? live;
}
function actionErrorFor(error) {
  if (error instanceof ApiError) {
    if (error.code === "stale-review") {
      return {
        title: "The branch moved",
        message: "The snapshot is stale. Create a new round to review the latest commits.",
        code: error.code,
        retry: "refresh"
      };
    }
    if (error.code === "agent-busy") {
      return {
        title: "Reviewer is running",
        message: "Wait for the current reviewer run to finish before changing the review.",
        code: error.code
      };
    }
    if (error.code === "conflict") {
      return {
        title: "Apply conflict",
        message: error.message.includes("suggest") || error.message.includes("apply") ? "The suggestion no longer matches the file. Send the thread to the agent instead of applying it automatically." : "This change conflicts with another update. Reload and try again.",
        code: error.code
      };
    }
    return { title: "Request failed", message: error.message, code: error.code };
  }
  return {
    title: "Something went wrong",
    message: error instanceof Error ? error.message : "Unexpected error."
  };
}
function ReviewDetail({ client, id, location, navigate }) {
  const { toast } = useToast();
  const liveLocation = useLiveLocation(location);
  const deep = (0, import_react20.useMemo)(() => parseReviewLocation(liveLocation), [liveLocation]);
  const restoredDraft = (0, import_react20.useMemo)(() => readDraft(id), [id]);
  const [view, setView] = (0, import_react20.useState)(null);
  const [loading, setLoading] = (0, import_react20.useState)(true);
  const [reviewError, setReviewError] = (0, import_react20.useState)(null);
  const [notFound, setNotFound] = (0, import_react20.useState)(false);
  const [reloadKey, setReloadKey] = (0, import_react20.useState)(0);
  const [round, setRound] = (0, import_react20.useState)(null);
  const [snapshot, setSnapshot] = (0, import_react20.useState)(null);
  const [previousSnapshot, setPreviousSnapshot] = (0, import_react20.useState)(null);
  const [snapshotLoading, setSnapshotLoading] = (0, import_react20.useState)(false);
  const [snapshotError, setSnapshotError] = (0, import_react20.useState)(null);
  const [tab, setTab] = (0, import_react20.useState)(() => {
    const explicit = new URL(liveLocation, "http://local").searchParams.get("tab");
    return explicit === null ? "files" : parseTab(explicit);
  });
  const explicitTabRef = (0, import_react20.useRef)(
    new URL(liveLocation, "http://local").searchParams.get("tab") !== null
  );
  const [delta, setDelta] = (0, import_react20.useState)(false);
  const [fixFilter, setFixFilter] = (0, import_react20.useState)("all");
  const [activeFile, setActiveFile] = (0, import_react20.useState)(deep.file);
  const [activeLine, setActiveLine] = (0, import_react20.useState)(deep.line);
  const [activeCommentId, setActiveCommentId] = (0, import_react20.useState)();
  const [fullFileJump, setFullFileJump] = (0, import_react20.useState)(null);
  const [selection, setSelection] = (0, import_react20.useState)(null);
  const [composer, setComposer] = (0, import_react20.useState)(
    () => restoredDraft === null ? null : {
      path: restoredDraft.path,
      side: restoredDraft.side,
      lineStart: restoredDraft.lineStart,
      lineEnd: restoredDraft.lineEnd,
      surface: "diff"
    }
  );
  const [draftSeed, setDraftSeed] = (0, import_react20.useState)(restoredDraft);
  const [commentSubmitting, setCommentSubmitting] = (0, import_react20.useState)(false);
  const [commentError, setCommentError] = (0, import_react20.useState)(null);
  const [pendingCommentId, setPendingCommentId] = (0, import_react20.useState)();
  const [decidingFindingId, setDecidingFindingId] = (0, import_react20.useState)(void 0);
  const [findingDecisionError, setFindingDecisionError] = (0, import_react20.useState)(
    null
  );
  const [bulkDecisionPending, setBulkDecisionPending] = (0, import_react20.useState)(false);
  const [bulkDecisionError, setBulkDecisionError] = (0, import_react20.useState)(null);
  const [submitOpen, setSubmitOpen] = (0, import_react20.useState)(false);
  const [submitError, setSubmitError] = (0, import_react20.useState)(null);
  const [submitting, setSubmitting] = (0, import_react20.useState)(false);
  const [refreshOpen, setRefreshOpen] = (0, import_react20.useState)(false);
  const [refreshing, setRefreshing] = (0, import_react20.useState)(false);
  const [helpOpen, setHelpOpen] = (0, import_react20.useState)(false);
  const [actionError, setActionError] = (0, import_react20.useState)(null);
  const [banner, setBanner] = (0, import_react20.useState)(null);
  const [feedback, setFeedback] = (0, import_react20.useState)(null);
  const [delivery, setDelivery] = (0, import_react20.useState)(null);
  const [cancelPending, setCancelPending] = (0, import_react20.useState)(false);
  const [retryPending, setRetryPending] = (0, import_react20.useState)(false);
  const [deleteOpen, setDeleteOpen] = (0, import_react20.useState)(false);
  const [deletePending, setDeletePending] = (0, import_react20.useState)(false);
  const [deleteError, setDeleteError] = (0, import_react20.useState)(null);
  const [scrollRestore, setScrollRestore] = (0, import_react20.useState)(null);
  const pendingJump = (0, import_react20.useRef)(null);
  const goRef = (0, import_react20.useRef)(0);
  const fullFileControllerRef = (0, import_react20.useRef)(null);
  const go = (0, import_react20.useCallback)(
    (to, options = {}) => {
      if (navigate !== void 0) {
        navigate(to, options);
        return;
      }
      if (typeof window === "undefined") return;
      if (options.replace === true) window.history.replaceState({}, "", to);
      else window.history.pushState({}, "", to);
      window.dispatchEvent(new Event("popstate"));
    },
    [navigate]
  );
  const reloadReview = (0, import_react20.useCallback)(() => setReloadKey((value) => value + 1), []);
  const refreshView = (0, import_react20.useCallback)(async () => {
    try {
      setView(await client.getReview(id));
    } catch {
      reloadReview();
    }
  }, [client, id, reloadReview]);
  (0, import_react20.useEffect)(() => {
    setDraftSeed(restoredDraft);
    if (restoredDraft === null) return;
    setComposer({
      path: restoredDraft.path,
      side: restoredDraft.side,
      lineStart: restoredDraft.lineStart,
      lineEnd: restoredDraft.lineEnd,
      surface: "diff"
    });
    setSelection({
      path: restoredDraft.path,
      side: restoredDraft.side,
      lineStart: restoredDraft.lineStart,
      lineEnd: restoredDraft.lineEnd
    });
    setActiveFile(restoredDraft.path);
    setActiveLine(restoredDraft.lineStart);
    setTab("files");
    setBanner("Draft restored from this browser. Post it or cancel to remove it.");
  }, [restoredDraft]);
  (0, import_react20.useEffect)(() => {
    if (draftSeed === null || snapshot === null) return;
    const file = snapshot.files.find((item) => item.path === draftSeed.path);
    const maxLine = file === void 0 ? 0 : fileLineCount(file, draftSeed.side);
    if (file === void 0 || draftSeed.lineStart < 1 || draftSeed.lineEnd > maxLine) {
      clearDraft(id);
      setDraftSeed(null);
      setComposer(null);
      setSelection(null);
      setBanner("A saved draft no longer fits this round and was discarded.");
    }
  }, [snapshot, draftSeed, id]);
  const persistDraft = (0, import_react20.useCallback)(
    (draft) => {
      if (composer === null) return;
      if (draft.body.trim() === "" && !draft.suggestionEnabled) {
        clearDraft(id);
        return;
      }
      writeDraft(id, {
        path: composer.path,
        side: composer.side,
        ...draft
      });
    },
    [composer, id]
  );
  (0, import_react20.useEffect)(() => {
    const controller = new AbortController();
    setLoading(true);
    setReviewError(null);
    setNotFound(false);
    client.getReview(id).then((next) => {
      if (controller.signal.aborted) return;
      setView(next);
      setLoading(false);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (error instanceof ApiError && error.code === "not-found") {
        setNotFound(true);
        return;
      }
      setReviewError(error instanceof Error ? error.message : "Failed to load the review.");
    });
    return () => controller.abort();
  }, [client, id, reloadKey]);
  (0, import_react20.useEffect)(() => {
    if (view === null) return;
    const latest = view.review.rounds.at(-1)?.no ?? null;
    const requested = deep.round;
    setRound((current) => {
      if (current !== null && view.review.rounds.some((item) => item.no === current)) {
        if (requested !== void 0 && requested !== current && view.review.rounds.some((item) => item.no === requested)) {
          return requested;
        }
        return current;
      }
      if (requested !== void 0 && view.review.rounds.some((item) => item.no === requested)) {
        return requested;
      }
      return latest;
    });
  }, [view, deep.round]);
  (0, import_react20.useEffect)(() => {
    const explicit = new URL(liveLocation, "http://local").searchParams.get("tab");
    if (explicit !== null) {
      explicitTabRef.current = true;
      setTab(parseTab(explicit));
    } else if (explicitTabRef.current) {
      explicitTabRef.current = false;
      setTab("files");
    }
  }, [liveLocation]);
  (0, import_react20.useEffect)(() => {
    if (view === null) return;
    let alive = true;
    client.latestFeedback(id).then((next) => {
      if (alive) setFeedback(next);
    }).catch(() => {
      if (alive) setFeedback(null);
    });
    return () => {
      alive = false;
    };
  }, [client, id, reloadKey, view]);
  (0, import_react20.useEffect)(() => {
    if (view === null || round === null) {
      setSnapshot(null);
      setPreviousSnapshot(null);
      return;
    }
    const controller = new AbortController();
    setSnapshotLoading(true);
    setSnapshotError(null);
    const current = client.getSnapshot(id, round);
    const previous = round > 1 ? client.getSnapshot(id, round - 1).catch(() => null) : Promise.resolve(null);
    Promise.all([current, previous]).then(([next, prev]) => {
      if (controller.signal.aborted) return;
      setSnapshot(next.snapshot);
      setPreviousSnapshot(prev?.snapshot ?? null);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setSnapshotError(error instanceof Error ? error.message : "Failed to load the snapshot.");
    }).finally(() => {
      if (!controller.signal.aborted) setSnapshotLoading(false);
    });
    return () => controller.abort();
  }, [client, id, round]);
  (0, import_react20.useEffect)(() => {
    if (round === null) return;
    setDelta(round > 1);
  }, [round]);
  (0, import_react20.useEffect)(() => {
    if (snapshot === null) return;
    const pending = pendingJump.current;
    const target = pending ?? (deep.file !== void 0 ? { path: deep.file, line: deep.line } : null);
    if (target === null) {
      if (scrollRestore !== null) {
        const value = scrollRestore;
        setScrollRestore(null);
        requestAnimationFrame(() => window.scrollTo(0, value));
      }
      return;
    }
    if (!snapshot.files.some((file2) => file2.path === target.path)) {
      pendingJump.current = null;
      return;
    }
    const file = target.path;
    const line = target.line;
    const side = pending?.side;
    const timer = window.setTimeout(() => {
      const fileNode = document.getElementById(diffFileId(file));
      if (typeof fileNode?.scrollIntoView === "function")
        fileNode.scrollIntoView({ block: "start" });
      if (line !== void 0) {
        const row = side === void 0 ? document.getElementById(diffLineId(file, "new", line)) ?? document.getElementById(diffLineId(file, "old", line)) : document.getElementById(diffLineId(file, side, line));
        if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "center" });
        if (row === null && side !== void 0) setFullFileJump({ path: file, side, line });
        row?.focus({ preventScroll: true });
      }
      pendingJump.current = null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [snapshot, deep.file, deep.line, scrollRestore, tab]);
  (0, import_react20.useEffect)(() => {
    setActiveFile(deep.file);
    setActiveLine(deep.line);
    if (deep.file !== void 0) setTab("files");
  }, [deep.file, deep.line]);
  const selectedRound = round;
  const loadFileDiff = (0, import_react20.useCallback)(
    async (path) => {
      if (selectedRound === null) throw new Error("No snapshot round is selected.");
      const result = await client.getFileDiff(id, selectedRound, path);
      return result.file;
    },
    [client, id, selectedRound]
  );
  const canDelta = selectedRound !== null && selectedRound > 1 && previousSnapshot !== null;
  const deltaHint = selectedRound === null ? void 0 : selectedRound > 1 ? snapshotLoading ? "Loading the previous round\u2026" : previousSnapshot === null ? "The previous round snapshot is unavailable." : void 0 : "Delta compares this round with the previous one.";
  const changed = (0, import_react20.useMemo)(
    () => snapshot === null ? /* @__PURE__ */ new Set() : deltaPaths(snapshot, previousSnapshot),
    [snapshot, previousSnapshot]
  );
  const effectiveDelta = delta && canDelta && (deep.file === void 0 || changed.has(deep.file));
  (0, import_react20.useEffect)(() => {
    if (!delta || deep.file === void 0) return;
    if (!changed.has(deep.file)) setDelta(false);
  }, [changed, deep.file, delta]);
  const counts = (0, import_react20.useMemo)(
    () => view === null ? { addressed: 0, "not-fixed": 0, outdated: 0, "needs-decision": 0 } : fixCounts(view.review),
    [view]
  );
  const filteredComments = (0, import_react20.useMemo)(
    () => view === null ? [] : filterComments(view.review, fixFilter),
    [view, fixFilter]
  );
  const reportComments = (0, import_react20.useMemo)(
    () => view === null ? [] : view.review.comments.filter((comment) => comment.deletedAt === void 0),
    [view]
  );
  const signals = (0, import_react20.useMemo)(() => snapshot === null ? [] : deriveSignals(snapshot), [snapshot]);
  const fileCount = (0, import_react20.useMemo)(
    () => snapshot === null ? 0 : filesForSnapshot(snapshot).length,
    [snapshot]
  );
  const finalReport = view?.report ?? null;
  const finalReportForRound = finalReport !== null && finalReport.round === selectedRound ? finalReport : null;
  const liveReport = (0, import_react20.useMemo)(
    () => view === null ? null : liveReportFor(view.review.agent, view.review.id, selectedRound),
    [view?.review.agent, view?.review.id, selectedRound]
  );
  const report = finalReportForRound ?? liveReport?.report ?? null;
  const transferredFindingIds = (0, import_react20.useMemo)(() => {
    const round2 = report?.round;
    if (view === null || round2 === void 0) return /* @__PURE__ */ new Set();
    return new Set(
      view.review.comments.filter(
        (comment) => comment.deletedAt === void 0 && comment.sourceFindingId !== void 0 && comment.anchors.some((anchor) => anchor.round === round2)
      ).map((comment) => comment.sourceFindingId)
    );
  }, [view, report?.round]);
  const visibleReportFindings = (0, import_react20.useMemo)(
    () => report === null ? [] : report.findings.filter((finding) => !transferredFindingIds.has(finding.id)),
    [report, transferredFindingIds]
  );
  const reportAgentPartial = view?.review.agent?.status === "partial";
  const reportIsPartial = finalReportForRound === null && liveReport !== null || finalReportForRound !== null && reportAgentPartial;
  const readOnly = view?.review.status === "closed";
  const findingDecisions = (0, import_react20.useMemo)(() => {
    const decisions = /* @__PURE__ */ new Map();
    if (finalReportForRound === null) return decisions;
    for (const decision of view?.review.findingDecisions ?? []) {
      if (decision.round === finalReportForRound.round) {
        decisions.set(decision.findingId, decision);
      }
    }
    return decisions;
  }, [view, finalReportForRound]);
  const canDecideFinding = !readOnly && finalReportForRound !== null && view !== null && isFinalReviewReport(view.review, finalReportForRound);
  const agentActive = view?.review.agent?.status === "running" || view?.review.agent?.status === "queued";
  const canRetryReviewer = view?.review.reviewer?.backend === "worker";
  const scope = snapshot?.scope;
  const liveCursor = (0, import_react20.useRef)(null);
  (0, import_react20.useEffect)(() => {
    liveCursor.current = view?.review.version ?? null;
  }, [view]);
  (0, import_react20.useEffect)(() => {
    if (!agentActive || liveCursor.current === null) return;
    const controller = new AbortController();
    let stopped = false;
    let after = liveCursor.current;
    const applyEvents = (current, events) => {
      let next = current;
      for (const event of events) {
        if (event.reviewId !== next.review.id) continue;
        if (event.seq !== void 0 && event.seq <= next.review.version) continue;
        next = {
          ...next,
          review: fold(next.review, event),
          ...event.type === "agent/report" ? { report: event.data.report } : {}
        };
      }
      return next;
    };
    const run = async () => {
      while (!stopped) {
        if (liveCursor.current !== null && liveCursor.current > after) {
          after = liveCursor.current;
        }
        try {
          const response = await client.events(id, { after, signal: controller.signal });
          if (stopped) return;
          after = Math.max(after, response.latestSeq);
          if (response.events.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          let failed = false;
          setView((current) => {
            if (current === null) return current;
            try {
              return applyEvents(current, response.events);
            } catch {
              failed = true;
              return current;
            }
          });
          if (failed) {
            reloadReview();
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      }
    };
    void run();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [agentActive, client, id, reloadReview]);
  const roundLabel = selectedRound === null ? "No rounds" : `r${selectedRound}`;
  function changeRound(next) {
    if (next === selectedRound) return;
    setScrollRestore(window.scrollY);
    setRound(next);
    go(buildReviewLocation(id, { ...deep, round: next }, { tab }), { replace: false });
  }
  function jumpTo(path, line, side = "new") {
    if (delta && canDelta && !changed.has(path)) setDelta(false);
    setTab("files");
    setActiveFile(path);
    setActiveLine(line);
    pendingJump.current = { path, ...line === void 0 ? {} : { line }, side };
    go(
      buildReviewLocation(
        id,
        {
          ...deep,
          round: selectedRound ?? void 0,
          file: path,
          ...line === void 0 ? {} : { line }
        },
        { tab: "files" }
      )
    );
    const file = snapshot?.files.find((item) => item.path === path);
    if (file !== void 0) {
      const fileNode = document.getElementById(diffFileId(path));
      if (typeof fileNode?.scrollIntoView === "function")
        fileNode.scrollIntoView({ block: "start" });
      if (line !== void 0) {
        const row = document.getElementById(diffLineId(path, side, line));
        if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "center" });
        if (row === null && tab === "files") setFullFileJump({ path, side, line });
        row?.focus({ preventScroll: true });
      }
    }
  }
  function onSelectLine(file, side, line, shift) {
    setActiveFile(file.path);
    setActiveLine(line);
    setSelection((current) => {
      if (shift && current !== null && current.path === file.path && current.side === side) {
        return {
          ...current,
          lineStart: Math.min(current.lineStart, line),
          lineEnd: Math.max(current.lineEnd, line)
        };
      }
      return { path: file.path, side, lineStart: line, lineEnd: line };
    });
    go(
      buildReviewLocation(
        id,
        { ...deep, round: selectedRound ?? void 0, file: file.path, line },
        { tab: "files" }
      ),
      { replace: true }
    );
  }
  function onSelectRange(file, side, start, end) {
    setActiveFile(file.path);
    setActiveLine(end);
    setSelection({
      path: file.path,
      side,
      lineStart: Math.min(start, end),
      lineEnd: Math.max(start, end)
    });
  }
  function openFinding(finding) {
    setTab("report");
    go(buildReviewLocation(id, { ...deep, round: selectedRound ?? void 0 }, { tab: "report" }), {
      replace: false
    });
    window.setTimeout(() => {
      const node = document.getElementById(`finding-${finding.id}`);
      if (typeof node?.focus === "function") node.focus({ preventScroll: true });
      if (typeof node?.scrollIntoView === "function") {
        node.scrollIntoView({ block: "center" });
      }
    }, 0);
  }
  function openComposer(file, side, lineStart, lineEnd = lineStart, surface = "diff") {
    clearDraft(id);
    setDraftSeed(null);
    setTab("files");
    setComposer({ path: file.path, side, lineStart, lineEnd, surface });
    setSelection({ path: file.path, side, lineStart, lineEnd });
    setCommentError(null);
    setActiveFile(file.path);
    setActiveLine(lineStart);
  }
  function cancelComposer() {
    clearDraft(id);
    setDraftSeed(null);
    setComposer(null);
    setCommentError(null);
  }
  function openComposerAtSelection() {
    const fullFileController = fullFileControllerRef.current;
    if (fullFileController !== null) {
      fullFileController.commentAtSelection();
      return;
    }
    if (snapshot === null) return;
    if (selection !== null) {
      const file2 = snapshot.files.find((item) => item.path === selection.path);
      if (file2 !== void 0) {
        openComposer(file2, selection.side, selection.lineStart, selection.lineEnd);
        return;
      }
    }
    if (activeFile !== void 0) {
      const file2 = snapshot.files.find((item) => item.path === activeFile);
      const first2 = file2 === void 0 ? void 0 : firstChangedLine(file2);
      if (file2 !== void 0 && first2 !== null && first2 !== void 0) {
        openComposer(file2, first2.side, first2.line);
        return;
      }
    }
    const file = snapshot.files[0];
    if (file === void 0) return;
    const first = firstChangedLine(file);
    openComposer(file, first?.side ?? "new", first?.line ?? 1);
  }
  async function submitComment(file, side, draft) {
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const result = await client.addComment(id, {
        body: draft.body,
        path: file.path,
        side,
        lineStart: draft.lineStart,
        lineEnd: draft.lineEnd,
        ...draft.suggestionEnabled ? { suggestion: { original: draft.original, replacement: draft.replacement } } : {}
      });
      clearDraft(id);
      setDraftSeed(null);
      setComposer(null);
      setSelection(null);
      setPendingCommentId(result.comment.id);
      setActiveCommentId(result.comment.id);
      toast("Comment posted");
      void refreshView();
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "Could not post the comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }
  async function submitReportComment(target, body) {
    try {
      const result = await client.addComment(id, {
        body,
        path: target.file,
        side: "new",
        lineStart: target.lineStart,
        lineEnd: target.lineEnd
      });
      setPendingCommentId(result.comment.id);
      setActiveCommentId(result.comment.id);
      toast("Comment posted");
      void refreshView();
    } catch (error) {
      throw error instanceof Error ? error : new Error("Could not post the comment.");
    }
  }
  async function reply(comment, body) {
    setPendingCommentId(comment.id);
    try {
      await client.reply(id, comment.id, body);
      toast("Reply sent");
      void refreshView();
    } finally {
      setPendingCommentId(void 0);
    }
  }
  async function setCommentState(comment, state) {
    setPendingCommentId(comment.id);
    try {
      await client.setCommentState(id, comment.id, state);
      toast(
        state === "resolved" ? "Comment resolved" : state === "dismissed" ? "Comment dismissed" : "Comment reopened"
      );
      void refreshView();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setPendingCommentId(void 0);
    }
  }
  async function editComment(comment, body) {
    setPendingCommentId(comment.id);
    try {
      await client.editComment(id, comment.id, body);
      toast("Comment updated");
      void refreshView();
    } finally {
      setPendingCommentId(void 0);
    }
  }
  async function deleteComment(comment) {
    setPendingCommentId(comment.id);
    try {
      await client.deleteComment(id, comment.id);
      toast("Comment deleted");
      void refreshView();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setPendingCommentId(void 0);
    }
  }
  async function deleteReview() {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await client.deleteReview(id);
      toast("Review deleted");
      setDeleteOpen(false);
      go("/");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete the review.");
    } finally {
      setDeletePending(false);
    }
  }
  async function submitFindingDecision(finding, state, note) {
    if (view === null || finalReportForRound === null) return false;
    setDecidingFindingId(finding.id);
    setFindingDecisionError(null);
    try {
      await client.decideFinding(id, finding.id, {
        state,
        ...note === void 0 || note === "" ? {} : { note }
      });
      toast(state === "accepted" ? "Finding accepted" : "Finding dismissed");
      reloadReview();
      return true;
    } catch (error) {
      setFindingDecisionError({
        findingId: finding.id,
        message: error instanceof Error ? error.message : "Could not save the finding decision."
      });
      return false;
    } finally {
      setDecidingFindingId(void 0);
    }
  }
  async function submitSelectedFindingDecisions(state, findingIds) {
    if (view === null || finalReportForRound === null) {
      setBulkDecisionError("The report is no longer available.");
      return false;
    }
    setBulkDecisionPending(true);
    setBulkDecisionError(null);
    try {
      const result = await client.decideFindings(id, state, findingIds);
      const count = result.decisions.length;
      if (count === 0) {
        toast("No selected findings left to decide");
      } else {
        toast(
          `${state === "accepted" ? "Accepted" : "Dismissed"} ${count} ${count === 1 ? "finding" : "findings"}`
        );
      }
      reloadReview();
      return true;
    } catch (error) {
      setBulkDecisionError(
        error instanceof Error ? error.message : "Could not save the finding decisions."
      );
      reloadReview();
      return false;
    } finally {
      setBulkDecisionPending(false);
    }
  }
  function jumpToComment(comment) {
    const anchor = latestAnchor(comment);
    if (anchor === void 0) return;
    setActiveCommentId(comment.id);
    if (anchor.round !== selectedRound) {
      setRound(anchor.round);
      go(
        buildReviewLocation(
          id,
          { round: anchor.round, file: anchor.path, line: anchor.lineStart },
          { tab: "files" }
        )
      );
    }
    jumpTo(anchor.path, anchor.lineStart, anchor.side);
  }
  function jumpToLocation(location2) {
    jumpTo(location2.file, location2.lineStart);
  }
  async function submitReview(input) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await client.submit(id, input);
      setDelivery(result.delivery);
      setSubmitOpen(false);
      setBanner(`Feedback submitted for round ${result.submission.round}. Delivery is pending.`);
      toast("Feedback submitted");
      reloadReview();
    } catch (error) {
      if (error instanceof ApiError && (error.code === "stale-review" || error.code === "agent-busy" || error.code === "conflict")) {
        setSubmitOpen(false);
        setActionError(actionErrorFor(error));
      } else {
        setSubmitError(error instanceof Error ? error.message : "Could not submit the review.");
      }
    } finally {
      setSubmitting(false);
    }
  }
  async function refreshReview() {
    setRefreshing(true);
    setActionError(null);
    try {
      const next = await client.refresh(id);
      setView(next);
      const nextRound = next.review.rounds.at(-1)?.no ?? null;
      if (nextRound !== null) setRound(nextRound);
      const statuses = next.review.comments.map((comment) => {
        const anchor = anchorForRound(comment, nextRound ?? 0);
        return anchor?.state ?? "active";
      });
      const outdated = statuses.filter((status) => status === "outdated").length;
      setRefreshOpen(false);
      setBanner(
        `Round ${nextRound ?? "\u2014"} created. ${next.review.comments.length} comments re-anchored${outdated > 0 ? `, ${outdated} now outdated` : ""}.`
      );
      toast("New round created");
    } catch (error) {
      setActionError(actionErrorFor(error));
      setRefreshOpen(false);
    } finally {
      setRefreshing(false);
    }
  }
  async function cancelReviewer() {
    setCancelPending(true);
    try {
      await client.cancelAgent(id);
      toast("Reviewer cancellation requested");
      reloadReview();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setCancelPending(false);
    }
  }
  async function retryReviewer() {
    setRetryPending(true);
    try {
      const next = await client.retryAgent(id);
      setView(next);
      toast("Retrying failed files; completed findings stay in the report");
      reloadReview();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setRetryPending(false);
    }
  }
  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied`);
    } catch {
      toast(`Could not copy ${label.toLowerCase()}`, "danger");
    }
  }
  (0, import_react20.useEffect)(() => {
    function eventTargetInField(target) {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
    }
    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.documentElement.hasAttribute("data-shortcuts-off")) return;
      if (!eventInNativeScope(event)) return;
      if (event.key === "Escape" && helpOpen) {
        event.preventDefault();
        setHelpOpen(false);
        return;
      }
      if (submitOpen || refreshOpen || helpOpen) return;
      if (event.key === "Escape") {
        if (composer !== null) {
          event.preventDefault();
          setComposer(null);
          setCommentError(null);
        }
        return;
      }
      if (eventTargetInField(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key === "c") {
        event.preventDefault();
        openComposerAtSelection();
        return;
      }
      if (event.key === "r" && activeCommentId !== void 0 && view !== null) {
        const comment = view.review.comments.find((item) => item.id === activeCommentId);
        if (comment !== void 0 && comment.state === "open") {
          event.preventDefault();
          void setCommentState(comment, "resolved");
        }
        return;
      }
      if (event.key === "[" || event.key === "]") {
        const rounds = view?.review.rounds ?? [];
        const index = rounds.findIndex((item) => item.no === selectedRound);
        if (index < 0) return;
        const next = event.key === "]" ? rounds[index + 1] : rounds[index - 1];
        if (next !== void 0) {
          event.preventDefault();
          changeRound(next.no);
        }
        return;
      }
      if (event.key === "j" || event.key === "k") {
        if (snapshot === null) return;
        const files = effectiveDelta ? snapshot.files.filter((file2) => changed.has(file2.path)) : snapshot.files;
        if (files.length === 0) return;
        event.preventDefault();
        const index = files.findIndex((file2) => file2.path === activeFile);
        const nextIndex = event.key === "j" ? Math.min(files.length - 1, (index < 0 ? -1 : index) + 1) : Math.max(0, (index < 0 ? files.length : index) - 1);
        const file = files[nextIndex];
        if (file !== void 0) {
          const first = firstChangedLine(file);
          jumpTo(file.path, first?.line, first?.side ?? "new");
        }
        return;
      }
      if (event.key === "g") {
        goRef.current = Date.now();
        window.setTimeout(() => {
          goRef.current = 0;
        }, 800);
        return;
      }
      if (event.key === "l" && Date.now() - goRef.current < 800) {
        event.preventDefault();
        go("/");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  if (loading && view === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail-loading", "data-testid": "review-detail-loading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Skeleton, { width: "38%", height: 28 }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { style: { height: 12 } }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Skeleton, { width: "58%", height: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { style: { height: 24 } }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { className: "cr-card", children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Skeleton, { width: "100%", height: 160 }) })
    ] });
  }
  if (notFound || reviewError !== null && view === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
        "a",
        {
          className: "cr-back",
          href: "/",
          onClick: (event) => {
            event.preventDefault();
            go("/");
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(ArrowLeftIcon, { size: 16 }),
            " All reviews"
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-error-panel", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("strong", { children: notFound ? "Review not found" : "Could not load the review" }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { children: notFound ? `No review exists for ${id}.` : reviewError })
        ] }),
        !notFound ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "secondary", onClick: reloadReview, children: "Retry" }) : null
      ] })
    ] });
  }
  if (view === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { className: "cr-detail-loading" });
  }
  const review = view.review;
  const selectedTabLabel = TABS.find((item) => item.id === tab)?.label ?? "Conversation";
  const showSnapshot = snapshotLoading ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-card cr-diff-loading", "data-testid": "snapshot-loading", children: [
    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Skeleton, { width: "42%", height: 14 }),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { style: { height: 10 } }),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Skeleton, { width: "100%", height: 220 })
  ] }) : snapshotError !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-error-panel", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("strong", { children: "Could not load this round" }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { children: snapshotError })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "secondary", onClick: reloadReview, children: "Retry" })
  ] }) : snapshot === null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(EmptyState, { title: "No snapshot", description: "This review has no rounds yet." }) : /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
    DiffViewer,
    {
      snapshot,
      comments: filteredComments.filter((comment) => comment.deletedAt === void 0),
      allComments: (view?.review.comments ?? []).filter(
        (comment) => comment.deletedAt === void 0
      ),
      round: selectedRound ?? 1,
      delta: effectiveDelta,
      canDelta,
      deltaHint,
      onRequestNextRound: () => setRefreshOpen(true),
      changedPaths: changed,
      findings: visibleReportFindings,
      questions: report !== null ? report.questions : [],
      findingDecisions: finalReportForRound !== null ? findingDecisions : void 0,
      onDecideFinding: canDecideFinding ? submitFindingDecision : void 0,
      decidingFindingId,
      findingDecisionError,
      activeFile,
      activeLine,
      activeCommentId,
      composer: composer?.surface === "diff" ? composer : null,
      fullFileComposer: composer?.surface === "full" ? composer : null,
      fullFileJump,
      onFullFileJumpHandled: () => setFullFileJump(null),
      fullFileControllerRef,
      onCancelComposer: cancelComposer,
      onDeltaChange: setDelta,
      onJump: jumpTo,
      onLoadDiff: loadFileDiff,
      onSelectLine,
      onSelectRange,
      onOpenComposer: openComposer,
      onOpenFinding: openFinding,
      renderComposer: (file, side, lineStart, lineEnd) => {
        const maxLine = fileLineCount(file, side);
        return /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
          CommentComposer,
          {
            file,
            side,
            lineStart,
            lineEnd,
            maxLine,
            submitting: commentSubmitting,
            serverError: commentError,
            initialDraft: draftSeed ?? void 0,
            onDraftChange: persistDraft,
            onCancel: cancelComposer,
            onSubmit: (draft) => void submitComment(file, side, draft)
          }
        );
      },
      onReply: reply,
      onCommentState: setCommentState,
      onCommentJump: jumpToComment,
      onCommentFocus: (comment) => setActiveCommentId(comment.id),
      onAnswerQuestion: (question, body) => submitReportComment(
        { file: question.file, lineStart: question.line, lineEnd: question.line },
        body
      ),
      readOnly
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail", "data-testid": "review-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
      "a",
      {
        className: "cr-back",
        href: "/",
        onClick: (event) => {
          event.preventDefault();
          go("/");
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(ArrowLeftIcon, { size: 16 }),
          " All reviews"
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("header", { className: "cr-detail-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail-eyebrow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-mono", children: review.id }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-eyebrow-dot", "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { children: [
            "opened ",
            formatAge(review.createdAt)
          ] }),
          review.createdBy !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { children: [
            "by ",
            review.createdBy.name
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Badge, { tone: review.status === "open" ? "success" : "neutral", children: review.status })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("h1", { className: "cr-page-title cr-detail-title", children: review.title }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail-scope", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(GitBranchIcon, { size: 16 }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-mono", children: scope?.label ?? roundLabel }),
          scope !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-scope-separator", "aria-hidden": "true", children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
              "button",
              {
                type: "button",
                className: "cr-link-button",
                "aria-label": `base ${shortSha(scope.baseSha)} (copy full commit)`,
                title: `Copy base commit ${scope.baseSha}`,
                onClick: () => void copyText(scope.baseSha, "Base SHA"),
                children: [
                  "base ",
                  shortSha(scope.baseSha)
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { "aria-hidden": "true", children: "\u2192" }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
              "button",
              {
                type: "button",
                className: "cr-link-button",
                "aria-label": `head ${shortSha(scope.headSha)} (copy full commit)`,
                title: `Copy head commit ${scope.headSha ?? "worktree"}`,
                onClick: () => void copyText(scope.headSha ?? "worktree", "Head SHA"),
                children: [
                  "head ",
                  shortSha(scope.headSha)
                ]
              }
            )
          ] }) : null,
          scope?.worktreeDigestTruncated === true ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Badge, { tone: "warning", children: "digest truncated" }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { className: "cr-round-pills", role: "group", "aria-label": "Review rounds", children: review.rounds.map((item) => /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
          "button",
          {
            type: "button",
            className: "cr-round-pill",
            "aria-pressed": item.no === selectedRound,
            title: `Round ${item.no}, ${roundCommentCount(review, item.no)} comments`,
            onClick: () => changeRound(item.no),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { children: [
                "r",
                item.no
              ] }),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-round-count", children: roundCommentCount(review, item.no) }),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { className: "cr-visually-hidden", children: [
                "Round ",
                item.no,
                ", ",
                roundCommentCount(review, item.no),
                " comments"
              ] })
            ]
          },
          item.no
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
          Badge,
          {
            tone: latestVerdict(review) === "approve" ? "success" : latestVerdict(review) === "request-changes" ? "danger" : "info",
            children: latestVerdict(review)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
          Button,
          {
            variant: "secondary",
            onClick: () => setRefreshOpen(true),
            disabled: readOnly || agentActive,
            title: agentActive ? "Wait for the reviewer to finish" : void 0,
            children: "Refresh"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
          Button,
          {
            variant: "secondary",
            onClick: () => go(`/review/${encodeURIComponent(id)}/edit`),
            disabled: readOnly,
            title: readOnly ? "Closed reviews cannot be edited" : void 0,
            children: "Edit"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "ghost", onClick: () => setDeleteOpen(true), disabled: deletePending, children: "Delete" }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { onClick: () => setSubmitOpen(true), disabled: readOnly, children: "Submit" })
      ] })
    ] }),
    banner !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-banner", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { children: banner }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("button", { type: "button", className: "cr-link-button", onClick: () => setBanner(null), children: "Dismiss" })
    ] }) : null,
    actionError !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-error-panel", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("strong", { children: actionError.title }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { children: actionError.message })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-inline-actions", children: [
        actionError.retry === "refresh" && !readOnly ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "secondary", onClick: () => setRefreshOpen(true), children: "Create a new round" }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "ghost", onClick: () => setActionError(null), children: "Dismiss" })
      ] })
    ] }) : null,
    review.agent?.status === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-error-panel", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("strong", { children: "Reviewer failed" }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { children: review.agent.error ?? "The reviewer did not produce a report." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-inline-actions", children: [
        canRetryReviewer ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
          Button,
          {
            variant: "secondary",
            loading: retryPending,
            disabled: readOnly || agentActive,
            onClick: () => void retryReviewer(),
            children: "Retry reviewer"
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "ghost", onClick: () => setTab("report"), children: "Open report" })
      ] })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: tab === "files" ? "cr-detail-grid cr-detail-grid-wide" : "cr-detail-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-detail-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { className: "cr-detail-tabs", role: "tablist", "aria-label": "Review sections", children: TABS.map((item) => {
          const count = item.id === "conversation" ? filteredComments.length : item.id === "files" ? fileCount : item.id === "report" ? report?.findings.length ?? 0 : signals.length;
          return /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
            "button",
            {
              type: "button",
              role: "tab",
              id: `review-tab-${item.id}`,
              className: "cr-tab",
              "aria-selected": tab === item.id,
              "aria-controls": `review-panel-${item.id}`,
              tabIndex: tab === item.id ? 0 : -1,
              onClick: () => setTab(item.id),
              onKeyDown: (event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                event.preventDefault();
                const index = TABS.findIndex((entry) => entry.id === tab);
                const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                if (next !== void 0) setTab(next.id);
              },
              children: [
                item.label,
                /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-tab-count", children: count })
              ]
            },
            item.id
          );
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
          "section",
          {
            className: "cr-tab-panel",
            role: "tabpanel",
            id: `review-panel-${tab}`,
            "aria-labelledby": `review-tab-${tab}`,
            tabIndex: 0,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { className: "cr-visually-hidden", "aria-live": "polite", children: [
                selectedTabLabel,
                " tab"
              ] }),
              tab === "conversation" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-conversation", children: [
                /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-section-head", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("h2", { className: "cr-card-title", children: "Conversation" }),
                    /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("p", { className: "cr-meta", children: [
                      filteredComments.length,
                      " thread",
                      filteredComments.length === 1 ? "" : "s",
                      fixFilter === "all" ? "" : ` \xB7 ${fixFilter.replace("-", " ")}`
                    ] })
                  ] }),
                  fixFilter !== "all" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { size: "small", variant: "ghost", onClick: () => setFixFilter("all"), children: "Clear filter" }) : null
                ] }),
                filteredComments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
                  EmptyState,
                  {
                    icon: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { "aria-hidden": "true", children: "#" }),
                    title: fixFilter === "all" ? "No comments yet" : "No comments in this group",
                    description: fixFilter === "all" ? "Select a line in Files changed and press c, or click the + next to a diff line." : "Switch the fix-status filter to see the other threads.",
                    action: fixFilter === "all" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "secondary", onClick: () => setTab("files"), children: "Open the diff" }) : /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "secondary", onClick: () => setFixFilter("all"), children: "Show all threads" })
                  }
                ) : /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("ol", { className: "cr-thread-list", "aria-label": "Comment threads", children: filteredComments.map((comment) => /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
                  CommentThread,
                  {
                    comment,
                    active: activeCommentId === comment.id,
                    pending: pendingCommentId === comment.id,
                    onReply: reply,
                    onState: setCommentState,
                    onEdit: editComment,
                    onDelete: deleteComment,
                    onJump: jumpToComment,
                    onFocus: (item) => setActiveCommentId(item.id)
                  }
                ) }, comment.id)) })
              ] }) : null,
              tab === "files" ? showSnapshot : null,
              tab === "report" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
                ReportPanel,
                {
                  report,
                  partial: reportIsPartial,
                  liveProgress: liveReport === null ? void 0 : {
                    completedShards: liveReport.completedShards,
                    totalShards: liveReport.totalShards
                  },
                  live: agentActive,
                  pending: agentActive && report === null,
                  decisions: finalReportForRound !== null ? findingDecisions : void 0,
                  canDecide: canDecideFinding,
                  onDecide: canDecideFinding ? submitFindingDecision : void 0,
                  decidingFindingId,
                  findingDecisionError,
                  onDecideSelected: canDecideFinding ? submitSelectedFindingDecisions : void 0,
                  bulkPending: bulkDecisionPending,
                  bulkError: bulkDecisionError,
                  onJump: jumpToLocation,
                  comments: reportComments,
                  transferredFindingIds,
                  onOpenConversation: () => setTab("conversation"),
                  round: selectedRound ?? 1,
                  readOnly,
                  activeCommentId,
                  pendingCommentId,
                  onReply: reply,
                  onCommentState: setCommentState,
                  onCommentEdit: editComment,
                  onCommentDelete: deleteComment,
                  onCommentJump: jumpToComment,
                  onCommentFocus: (comment) => setActiveCommentId(comment.id),
                  onAddComment: submitReportComment,
                  onJumpComment: (commentId) => {
                    const comment = review.comments.find((item) => item.id === commentId);
                    if (comment !== void 0) jumpToComment(comment);
                  }
                }
              ) : null,
              tab === "signals" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
                SignalsPanel,
                {
                  signals,
                  onJump: (signal) => {
                    if (signal.file !== void 0) jumpTo(signal.file, signal.line);
                  }
                }
              ) : null
            ]
          }
        )
      ] }),
      tab === "files" ? null : /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("aside", { className: "cr-rail", "aria-label": "Review context", children: [
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("section", { className: "cr-card cr-rail-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-card-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-card-title", children: "Summary" }),
            report !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
              Badge,
              {
                tone: report.riskLevel === "critical" || report.riskLevel === "high" ? "danger" : "neutral",
                children: report.riskLevel
              }
            ) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-rail-copy", tabIndex: 0, children: report?.summary ?? "The reviewer has not produced a summary for this round yet." }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-rail-meta", children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { children: [
              review.comments.filter((comment) => comment.deletedAt === void 0).length,
              " ",
              "comments"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { children: [
              unresolvedComments(review).length,
              " open"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { children: [
              review.rounds.length,
              " rounds"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("section", { className: "cr-card cr-rail-card", children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
          FixStatusBoard,
          {
            counts,
            active: fixFilter,
            onFilter: (filter) => {
              setFixFilter(filter);
              if (filter !== "all") setTab("conversation");
            },
            compact: true
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("section", { className: "cr-card cr-rail-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { className: "cr-card-head", children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-card-title", children: "Diff range" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("label", { className: "cr-switch-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
              "input",
              {
                type: "checkbox",
                checked: effectiveDelta,
                disabled: !canDelta,
                onChange: (event) => setDelta(event.target.checked)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("span", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("strong", { children: "Delta only" }),
              /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-meta", children: selectedRound !== null && selectedRound > 1 ? `r${selectedRound} vs r${selectedRound - 1}` : "Available from round 2" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("section", { className: "cr-card cr-rail-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-card-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-card-title", children: "Reviewer" }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
              Badge,
              {
                tone: review.agent?.status === "failed" ? "danger" : review.agent?.status === "running" || review.agent?.status === "partial" ? "warning" : review.agent?.status === "done" ? "success" : "neutral",
                children: review.agent?.status ?? "not run"
              }
            )
          ] }),
          review.agent?.coverage !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: coverageLabel(review.agent.coverage) }) : null,
          review.agent?.status === "partial" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-notice cr-notice-warning", children: "Coverage is incomplete: the reviewer did not inspect every changed file." }),
            canRetryReviewer ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
              Button,
              {
                size: "small",
                variant: "secondary",
                loading: retryPending,
                disabled: readOnly || agentActive,
                onClick: () => void retryReviewer(),
                children: "Retry reviewer"
              }
            ) : null
          ] }) : null,
          review.agent?.status === "running" || review.agent?.status === "queued" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("p", { className: "cr-meta", children: [
              review.agent.status === "queued" ? "Waiting for a worker" : "Working",
              " on round",
              " ",
              review.agent.round ?? selectedRound ?? "\u2014",
              "."
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
              Button,
              {
                size: "small",
                variant: "secondary",
                loading: cancelPending,
                onClick: () => void cancelReviewer(),
                children: "Cancel reviewer"
              }
            )
          ] }) : review.agent?.status === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: review.agent.error ?? "Reviewer failed." }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: canRetryReviewer ? "Retry unfinished shards from the alert above, or create a new round." : "This reviewer backend cannot be retried in place. Create a new round." }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
              Button,
              {
                size: "small",
                variant: "ghost",
                disabled: agentActive,
                onClick: () => setRefreshOpen(true),
                children: "Create a new round"
              }
            )
          ] }) : report !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("p", { className: "cr-meta", children: [
            report.findings.length,
            " findings \xB7 ",
            report.backend,
            " backend \xB7 round",
            " ",
            report.round,
            reportIsPartial ? " \xB7 partial" : ""
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: "No reviewer report yet." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("section", { className: "cr-card cr-rail-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-card-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-card-title", children: "Delivery" }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Badge, { tone: feedback !== null || delivery !== null ? "info" : "neutral", children: feedback !== null || delivery !== null ? "pending" : "not sent" })
          ] }),
          feedback !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("p", { className: "cr-meta", children: [
              "Submitted r",
              feedback.submission.round,
              " \xB7 ",
              feedback.submission.verdict
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: "Waiting for the agent session to acknowledge the feedback package." }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-inline-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
                Button,
                {
                  size: "small",
                  variant: "secondary",
                  onClick: () => void copyText(feedback.feedback.markdown, "Feedback package"),
                  children: "Copy package"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("details", { className: "cr-delivery-details", children: [
                /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("summary", { children: "Preview" }),
                /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("pre", { className: "cr-code-block", children: feedback.feedback.markdown })
              ] })
            ] })
          ] }) : delivery !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("p", { className: "cr-meta", children: [
              "Round ",
              delivery.round,
              " \xB7 harness ",
              delivery.harness
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: "Delivery is queued. The session will be resumed by the bridge." }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
              Button,
              {
                size: "small",
                variant: "secondary",
                onClick: () => void copyText(delivery.deliveryKey, "Delivery key"),
                children: "Copy delivery key"
              }
            )
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: "No feedback submitted. Submit a verdict to send unresolved comments back to the agent." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("section", { className: "cr-card cr-rail-card cr-shortcut-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-card-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "cr-card-title", children: "Shortcuts" }),
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("button", { type: "button", className: "cr-link-button", onClick: () => setHelpOpen(true), children: "?" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: "c comment \xB7 r resolve \xB7 j/k files \xB7 [ ] rounds" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
      SubmitDialog,
      {
        open: submitOpen,
        review,
        submitting,
        error: submitError,
        onClose: () => {
          if (!submitting) setSubmitOpen(false);
        },
        onSubmit: (input) => void submitReview(input),
        onJumpComment: (commentId) => {
          const comment = review.comments.find((item) => item.id === commentId);
          if (comment === void 0) return;
          setSubmitOpen(false);
          jumpToComment(comment);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
      Dialog,
      {
        open: refreshOpen,
        title: "Re-review this branch",
        description: "A new immutable round re-anchors every comment against the current diff.",
        onClose: () => {
          if (!refreshing) setRefreshOpen(false);
        },
        actions: /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "ghost", onClick: () => setRefreshOpen(false), disabled: refreshing, children: "Cancel" }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { loading: refreshing, onClick: () => void refreshReview(), children: "Create round" })
        ] }),
        children: /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "cr-refresh", children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { children: "This captures a fresh snapshot and re-anchors comments. Outdated quotes stay visible in the Outdated group; nothing is deleted." }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-meta", children: agentActive ? "The reviewer is active; wait for it to finish or cancel it before creating the next round." : "Refresh is available when the branch has new commits or the worktree changed." }),
          review.reviewer?.backend === "none" ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-notice cr-notice-warning", children: "This review has no reviewer backend. The new round re-anchors comments but does not run an agent." }) : null
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
      Dialog,
      {
        open: deleteOpen,
        title: "Delete this review?",
        description: "The review disappears from the list and its active reviewer is cancelled. Events stay in the audit log.",
        onClose: () => {
          if (!deletePending) setDeleteOpen(false);
        },
        actions: /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(import_jsx_runtime24.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "ghost", onClick: () => setDeleteOpen(false), disabled: deletePending, children: "Cancel" }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { variant: "danger", loading: deletePending, onClick: () => void deleteReview(), children: "Delete review" })
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("p", { children: [
            "Delete ",
            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("strong", { children: review.title }),
            " (",
            review.id,
            ")? This removes it from the review list, but the append-only event log keeps the audit trail."
          ] }),
          deleteError !== null ? /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("p", { className: "cr-error", role: "alert", children: deleteError }) : null
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
      Dialog,
      {
        open: helpOpen,
        title: "Keyboard shortcuts",
        description: "Shortcuts are disabled while typing and can be turned off with data-shortcuts-off.",
        onClose: () => setHelpOpen(false),
        actions: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(Button, { onClick: () => setHelpOpen(false), children: "Close" }),
        children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("dl", { className: "cr-shortcut-list", children: SHORTCUTS.map(([key, description]) => /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("dt", { children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("kbd", { children: key }) }),
          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("dd", { children: description })
        ] }, key)) })
      }
    )
  ] });
}

// packages/web/src/router.tsx
var import_react21 = require("react");

// packages/web/src/base.ts
function normalizeBase2(value) {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
function resolveAuthMode(value) {
  return value === "dsh" ? "dsh" : "token";
}
var BASE_PATH = normalizeBase2("/");
var AUTH_MODE = resolveAuthMode("dsh");
function withBase(path, base = BASE_PATH) {
  const normalized = normalizeBase2(base);
  if (normalized === "") return path;
  if (path === normalized || path.startsWith(`${normalized}/`)) return path;
  return `${normalized}${path.startsWith("/") ? path : `/${path}`}`;
}

// packages/web/src/router.tsx
var import_jsx_runtime25 = require("react/jsx-runtime");
var RouterContext = (0, import_react21.createContext)(null);
function createBrowserRouter(base = BASE_PATH) {
  const listeners = /* @__PURE__ */ new Set();
  const read = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const emit = () => {
    for (const listener of listeners) listener();
  };
  window.addEventListener("popstate", emit);
  return {
    location: read,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate: (to, options = {}) => {
      const target = withBase(to, base);
      if (options.replace === true) window.history.replaceState({}, "", target);
      else window.history.pushState({}, "", target);
      emit();
    },
    href: (to) => withBase(to, base)
  };
}
function createMemoryRouter(initial = "/", options = {}) {
  const key = options.storageKey;
  const stored = key === void 0 ? null : options.storage?.getItem(key) ?? null;
  let current = stored ?? initial;
  const listeners = /* @__PURE__ */ new Set();
  const persist = (value) => {
    if (key !== void 0) options.storage?.setItem(key, value);
  };
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    location: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate: (to, navigateOptions = {}) => {
      current = to;
      persist(to);
      emit();
      void navigateOptions;
    },
    href: (to) => withBase(to, options.hrefBase ?? "")
  };
}
var browserRouter = typeof window === "undefined" ? null : createBrowserRouter();
function getBrowserRouter() {
  if (browserRouter === null) {
    throw new Error("The browser router is unavailable outside a DOM environment.");
  }
  return browserRouter;
}
function RouterProvider({
  router,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime25.jsx)(RouterContext.Provider, { value: router, children });
}
function useRouter() {
  const router = (0, import_react21.useContext)(RouterContext) ?? getBrowserRouter();
  return router;
}
function useLocation() {
  const router = useRouter();
  return (0, import_react21.useSyncExternalStore)(router.subscribe, router.location, router.location);
}
function useNavigate() {
  return useRouter().navigate;
}
function parseRoute(location, base = BASE_PATH) {
  const url = new URL(location, "http://local");
  const normalizedBase = normalizeBase2(base);
  let pathname = url.pathname;
  if (normalizedBase !== "") {
    if (pathname === normalizedBase) pathname = "/";
    else if (pathname.startsWith(`${normalizedBase}/`)) {
      pathname = pathname.slice(normalizedBase.length);
    }
  }
  pathname = pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") return { name: "list" };
  if (pathname === "/new") return { name: "new" };
  if (pathname === "/auth") return { name: "auth" };
  if (pathname === "/health") return { name: "health" };
  if (pathname === "/settings") return { name: "settings" };
  const editMatch = /^\/review\/([^/]+)\/edit$/.exec(pathname);
  if (editMatch?.[1] !== void 0) {
    let id = editMatch[1];
    try {
      id = decodeURIComponent(editMatch[1]);
    } catch {
    }
    return { name: "edit-review", id };
  }
  const match = /^\/review\/([^/]+)$/.exec(pathname);
  if (match?.[1] !== void 0) {
    let id = match[1];
    try {
      id = decodeURIComponent(match[1]);
    } catch {
    }
    return { name: "review", id };
  }
  return { name: "not-found", path: pathname };
}
function Link({ to, children, onClick, ...rest }) {
  const router = useRouter();
  function handleClick(event) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (rest.target === "_blank" || rest.download !== void 0) return;
    event.preventDefault();
    router.navigate(to);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("a", { ...rest, href: router.href(to), onClick: handleClick, children });
}

// packages/web/src/App.tsx
var import_react31 = require("react");

// packages/web/src/Shell.tsx
var import_react22 = require("react");
var import_jsx_runtime26 = require("react/jsx-runtime");

// packages/web/src/pages/ReviewListPage.tsx
var import_react23 = require("react");

// packages/web/src/components.tsx
var import_jsx_runtime27 = require("react/jsx-runtime");
function PageHeader({ eyebrow, title, description, actions }) {
  return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("header", { className: "cr-page-head", children: [
    /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "cr-eyebrow", children: eyebrow }),
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("h1", { className: "cr-page-title", children: title }),
      description !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "cr-page-sub", children: description }) : null
    ] }),
    actions !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "cr-page-actions", children: actions }) : null
  ] });
}
function ErrorPanel({
  title,
  message,
  onRetry,
  retryLabel = "Retry"
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "cr-error-panel", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("strong", { children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { children: message })
    ] }),
    onRetry !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("button", { type: "button", className: "cr-button", "data-variant": "secondary", onClick: onRetry, children: retryLabel }) : null
  ] });
}

// packages/web/src/pages/ReviewListPage.tsx
var import_jsx_runtime28 = require("react/jsx-runtime");
var STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" }
];
function ListSkeleton() {
  return /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("div", { className: "cr-list", "aria-hidden": "true", "data-testid": "review-list-loading", children: [0, 1, 2, 3].map((index) => /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "cr-review-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "cr-review-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Skeleton, { width: `${46 + index * 9}%`, height: 16 }),
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("div", { style: { height: 7 } }),
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Skeleton, { width: "30%", height: 10 })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Skeleton, { width: "80%", height: 22, radius: 999 }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Skeleton, { width: "65%", height: 12 }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Skeleton, { width: 52, height: 12 }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Skeleton, { width: 62, height: 22, radius: 999 }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Skeleton, { width: 56, height: 12 })
  ] }, index)) });
}
function ReviewRow({ review }) {
  const notFixed = review.notFixedCount ?? 0;
  return /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(Link, { className: "cr-review-row", to: `/review/${encodeURIComponent(review.id)}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "cr-review-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-review-title", children: review.title }),
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-review-id", children: review.id })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-scope", title: review.scope, children: review.scope ?? "\u2014" }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-author", children: review.author ?? "unknown" }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("time", { className: "cr-age", dateTime: review.createdAt, children: formatAge(review.createdAt) }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Badge, { tone: review.status === "open" ? "success" : "neutral", children: review.status }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("span", { className: "cr-not-fixed", "data-zero": notFixed === 0, children: [
      notFixed,
      " not fixed"
    ] })
  ] });
}
function repoName(repoRoot) {
  const trimmed = repoRoot.replace(/[\\/]+$/, "");
  if (trimmed === "" || /^[A-Za-z]:$/.test(trimmed)) return repoRoot;
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return trimmed.slice(separator + 1) || repoRoot;
}
function matchesQuery(review, query) {
  const value = query.trim().toLowerCase();
  if (value === "") return true;
  return review.title.toLowerCase().includes(value) || review.id.toLowerCase().includes(value);
}
function ReviewGroup({ repoRoot, reviews, collapsed, onToggle }) {
  const id = (0, import_react23.useId)();
  const headingId = `${id}-heading`;
  const rowsId = `${id}-rows`;
  const count = reviews.length === 1 ? "1 review" : `${reviews.length} reviews`;
  return /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("section", { className: "cr-review-group", "aria-labelledby": headingId, children: [
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("h2", { className: "cr-review-group-heading", id: headingId, children: /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(
      "button",
      {
        type: "button",
        className: "cr-review-group-toggle",
        "aria-expanded": !collapsed,
        "aria-controls": rowsId,
        onClick: () => onToggle(repoRoot),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-review-group-chevron", "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-review-group-name", children: repoName(repoRoot) }),
          /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-review-group-path", title: repoRoot, children: repoRoot }),
          /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-review-group-count", children: count })
        ]
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("div", { className: "cr-review-group-rows", id: rowsId, hidden: collapsed, children: reviews.map((review) => /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(ReviewRow, { review }, review.id)) })
  ] });
}
function ReviewListPage({ client }) {
  const navigate = useNavigate();
  const [status, setStatus] = (0, import_react23.useState)("all");
  const [query, setQuery] = (0, import_react23.useState)("");
  const [reviews, setReviews] = (0, import_react23.useState)(null);
  const [total, setTotal] = (0, import_react23.useState)(0);
  const [loading, setLoading] = (0, import_react23.useState)(true);
  const [error, setError] = (0, import_react23.useState)(null);
  const [reloadKey, setReloadKey] = (0, import_react23.useState)(0);
  const [collapsedGroups, setCollapsedGroups] = (0, import_react23.useState)(() => /* @__PURE__ */ new Set());
  const load = (0, import_react23.useCallback)(
    async (signal) => {
      setLoading(true);
      setError(null);
      try {
        const page = await client.listReviews({
          limit: 50,
          ...status === "all" ? {} : { status }
        });
        if (signal.aborted) return;
        setReviews(page.items);
        setTotal(page.total);
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load reviews");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [client, status]
  );
  (0, import_react23.useEffect)(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);
  const filtered = (0, import_react23.useMemo)(
    () => (reviews ?? []).filter((review) => matchesQuery(review, query)),
    [query, reviews]
  );
  const groups = (0, import_react23.useMemo)(() => {
    const byRepo = /* @__PURE__ */ new Map();
    for (const review of filtered) {
      const rows = byRepo.get(review.repoRoot);
      if (rows === void 0) byRepo.set(review.repoRoot, [review]);
      else rows.push(review);
    }
    return [...byRepo.entries()];
  }, [filtered]);
  const toggleGroup = (0, import_react23.useCallback)((repoRoot) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(repoRoot)) next.delete(repoRoot);
      else next.add(repoRoot);
      return next;
    });
  }, []);
  if (error !== null && reviews === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(import_jsx_runtime28.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
        PageHeader,
        {
          eyebrow: "Workspace",
          title: "Reviews",
          description: "Review changes before they merge. Every note stays attached to the line it was written on.",
          actions: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Button, { onClick: () => navigate("/new"), icon: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { "aria-hidden": "true", children: "+" }), children: "New review" })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
        ErrorPanel,
        {
          title: "The review daemon is unreachable",
          message: error,
          onRetry: () => setReloadKey((value) => value + 1)
        }
      )
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(import_jsx_runtime28.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
      PageHeader,
      {
        eyebrow: "Workspace",
        title: "Reviews",
        description: "Review changes before they merge. Every note stays attached to the line it was written on.",
        actions: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Button, { onClick: () => navigate("/new"), icon: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { "aria-hidden": "true", children: "+" }), children: "New review" })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "cr-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "cr-search", children: [
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-search-icon", children: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(SearchIcon, { size: 16 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
          Input,
          {
            label: "Search reviews",
            hideLabel: true,
            type: "search",
            placeholder: "Search by title or review id",
            value: query,
            onChange: (event) => setQuery(event.target.value),
            autoComplete: "off",
            spellCheck: false
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("div", { className: "cr-field cr-field-select", children: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
        Select,
        {
          label: "Filter by status",
          hideLabel: true,
          options: STATUS_OPTIONS,
          value: status,
          onChange: (event) => setStatus(event.target.value)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "cr-meta", "aria-live": "polite", children: loading ? "Loading\u2026" : `${filtered.length} of ${total}` })
    ] }),
    loading && reviews === null ? /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(ListSkeleton, {}) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("div", { className: "cr-list", children: query.trim() !== "" || status !== "all" ? /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
      EmptyState,
      {
        icon: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(SearchIcon, { size: 20 }),
        title: "No matching reviews",
        description: "Try a different search term or clear the status filter.",
        action: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
          Button,
          {
            variant: "secondary",
            onClick: () => {
              setQuery("");
              setStatus("all");
            },
            children: "Clear filters"
          }
        )
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
      EmptyState,
      {
        icon: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(ReviewsIcon, { size: 22 }),
        title: "No reviews yet",
        description: "Start a review when a branch is ready, or ask your agent to create one for the current worktree.",
        action: /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(Button, { onClick: () => navigate("/new"), children: "Create the first review" })
      }
    ) }) : /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "cr-list", children: [
      /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "cr-list-head", "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { children: "Review" }),
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { children: "Scope" }),
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { children: "Author" }),
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { children: "Age" }),
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { children: "Status" }),
        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { children: "Not fixed" })
      ] }),
      groups.map(([repoRoot, groupReviews]) => /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
        ReviewGroup,
        {
          repoRoot,
          reviews: groupReviews,
          collapsed: collapsedGroups.has(repoRoot),
          onToggle: toggleGroup
        },
        repoRoot
      ))
    ] })
  ] });
}

// packages/web/src/pages/NewReviewPage.tsx
var import_react24 = require("react");
var import_jsx_runtime29 = require("react/jsx-runtime");
var initialForm = {
  repoRoot: "",
  title: "",
  kind: "branch",
  targetRef: "main",
  sourceRef: "",
  commitsMode: "all",
  baseRef: "main",
  sha: "",
  reviewer: "none"
};
function selectedRange(commits, selected) {
  const selectedSet = new Set(selected);
  const indexes = commits.map((commit, index) => selectedSet.has(commit.sha) ? index : -1).filter((index) => index >= 0);
  if (indexes.length === 0) return [];
  const oldest = Math.min(...indexes);
  const newest = Math.max(...indexes);
  return commits.slice(oldest, newest + 1).map((commit) => commit.sha);
}
function validate(form, commits, selected) {
  const errors = {};
  if (form.repoRoot.trim() === "") errors.repoRoot = "Enter the repository path on the daemon.";
  if (form.title.trim() === "") errors.title = "Give this review a title.";
  if (form.kind === "branch") {
    if (form.targetRef.trim() === "") {
      errors.targetRef = "Choose the branch this merge request is merged into.";
    }
    if (form.sourceRef.trim() === "") {
      errors.sourceRef = "Choose the branch that contains the changes.";
    } else if (form.sourceRef.trim() === form.targetRef.trim()) {
      errors.sourceRef = "The source and target branch must be different.";
    }
    if (form.commitsMode === "selected" && selectedRange(commits, selected).length === 0) {
      errors.commits = "Select at least one commit.";
    }
  }
  if (form.kind === "worktree" && form.baseRef.trim() === "") {
    errors.baseRef = "A base ref is required.";
  }
  if (form.kind === "commit" && form.sha.trim() === "") {
    errors.sha = "A commit SHA is required.";
  }
  return errors;
}
function buildScope(form, commits, selected) {
  if (form.kind === "worktree") {
    return { kind: "worktree", baseRef: form.baseRef.trim() };
  }
  if (form.kind === "commit") {
    return { kind: "commit", sha: form.sha.trim() };
  }
  if (form.commitsMode === "selected") {
    return { kind: "commits", shas: selectedRange(commits, selected) };
  }
  return {
    kind: "range",
    baseRef: form.targetRef.trim(),
    headRef: form.sourceRef.trim()
  };
}
function NewReviewPage({
  client,
  onCreated,
  showSettingsLink = true
}) {
  const navigate = useNavigate();
  const [form, setForm] = (0, import_react24.useState)(initialForm);
  const [repositories, setRepositories] = (0, import_react24.useState)([]);
  const [branches, setBranches] = (0, import_react24.useState)([]);
  const [branchesLoading, setBranchesLoading] = (0, import_react24.useState)(false);
  const [branchesError, setBranchesError] = (0, import_react24.useState)(null);
  const [commits, setCommits] = (0, import_react24.useState)([]);
  const [selected, setSelected] = (0, import_react24.useState)([]);
  const [commitsLoading, setCommitsLoading] = (0, import_react24.useState)(false);
  const [commitsError, setCommitsError] = (0, import_react24.useState)(null);
  const [errors, setErrors] = (0, import_react24.useState)({});
  const [submitError, setSubmitError] = (0, import_react24.useState)(null);
  const [submitting, setSubmitting] = (0, import_react24.useState)(false);
  (0, import_react24.useEffect)(() => {
    let active = true;
    void client.listRepositories().then((result) => {
      if (!active) return;
      setRepositories(result.repositories);
      const first = result.repositories[0];
      if (first !== void 0) {
        setForm(
          (current) => current.repoRoot === "" ? {
            ...current,
            repoRoot: first.path,
            targetRef: first.defaultTarget ?? current.targetRef
          } : current
        );
      }
    }).catch(() => {
      if (active) setRepositories([]);
    });
    return () => {
      active = false;
    };
  }, [client]);
  (0, import_react24.useEffect)(() => {
    const root = form.repoRoot.trim();
    if (root === "") {
      setBranches([]);
      setBranchesError(null);
      return;
    }
    let active = true;
    setBranchesLoading(true);
    setBranchesError(null);
    void client.listBranches(root).then((result) => {
      if (!active) return;
      setBranches(result.branches);
      setForm((current) => {
        if (current.repoRoot !== root) return current;
        const configured = repositories.find((repository) => repository.path === root);
        const preferred = configured?.defaultTarget;
        const target = current.targetRef !== "" && result.branches.includes(current.targetRef) ? current.targetRef : preferred !== void 0 && result.branches.includes(preferred) ? preferred : result.branches.includes("main") ? "main" : result.branches[0] ?? current.targetRef;
        return { ...current, targetRef: target };
      });
    }).catch((error) => {
      if (!active) return;
      setBranches([]);
      setBranchesError(
        error instanceof Error ? error.message : "Could not list branches in this repository."
      );
    }).finally(() => {
      if (active) setBranchesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [client, form.repoRoot, repositories]);
  (0, import_react24.useEffect)(() => {
    if (form.kind !== "branch" || form.commitsMode !== "selected" || form.repoRoot.trim() === "" || form.targetRef.trim() === "" || form.sourceRef.trim() === "" || form.sourceRef.trim() === form.targetRef.trim()) {
      setCommits([]);
      setSelected([]);
      setCommitsError(null);
      return;
    }
    let active = true;
    setCommitsLoading(true);
    setCommitsError(null);
    setSelected([]);
    void client.listCommits(form.repoRoot.trim(), form.targetRef.trim(), form.sourceRef.trim()).then((result) => {
      if (!active) return;
      setCommits(result.commits);
    }).catch((error) => {
      if (!active) return;
      setCommits([]);
      setCommitsError(
        error instanceof Error ? error.message : "Could not list commits for this merge request."
      );
    }).finally(() => {
      if (active) setCommitsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [client, form.kind, form.commitsMode, form.repoRoot, form.targetRef, form.sourceRef]);
  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      if (key === "kind") {
        delete next.targetRef;
        delete next.sourceRef;
        delete next.commits;
        delete next.baseRef;
        delete next.sha;
      } else if (key === "commitsMode") {
        delete next.commits;
      } else if (key === "repoRoot" || key === "title" || key === "sourceRef" || key === "targetRef" || key === "baseRef" || key === "sha") {
        delete next[key];
        if (key === "repoRoot" || key === "sourceRef" || key === "targetRef") {
          delete next.commits;
        }
      }
      return next;
    });
    setSubmitError(null);
  }
  function toggleCommit(sha) {
    setSelected(
      (current) => current.includes(sha) ? current.filter((value) => value !== sha) : [...current, sha]
    );
    setErrors((current) => {
      const next = { ...current };
      delete next.commits;
      return next;
    });
  }
  async function onSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(form, commits, selected);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const result = await client.createReview({
        repoRoot: form.repoRoot.trim(),
        title: form.title.trim(),
        scope: buildScope(form, commits, selected),
        reviewer: { backend: form.reviewer }
      });
      const id = result.review.review.id;
      if (onCreated !== void 0) onCreated(id);
      else navigate(`/review/${encodeURIComponent(id)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not create the review");
    } finally {
      setSubmitting(false);
    }
  }
  const hasErrors = Object.keys(errors).length > 0;
  const chosenShas = selectedRange(commits, selected);
  return /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)(import_jsx_runtime29.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
      PageHeader,
      {
        eyebrow: "New review",
        title: "Set the boundary",
        description: "Choose a repository, the branch that carries the changes, and the branch it should merge into. reviewd records the merge-request boundary; it never merges or rewrites a branch."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("form", { className: "cr-form", onSubmit: (event) => void onSubmit(event), noValidate: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("datalist", { id: "branch-options", children: branches.map((branch) => /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("option", { value: branch }, branch)) }),
      submitError !== null ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(ErrorPanel, { title: "Could not create the review", message: submitError }) : null,
      hasErrors ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("p", { className: "cr-form-error-summary", role: "alert", children: "Check the highlighted fields before creating the review." }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-section-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("h2", { className: "cr-form-section-title", children: "Repository" }),
              /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("p", { className: "cr-form-section-copy", children: [
                "Paths are resolved on the daemon.",
                " ",
                showSettingsLink ? "Manage saved repositories in Settings." : "Manage saved repositories in DSH Settings \u2192 Code Review."
              ] })
            ] }),
            showSettingsLink ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(Link, { className: "cr-link-button", to: "/settings", children: "Manage repositories" }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-grid", children: [
            /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
              Select,
              {
                label: "Saved repository",
                id: "saved-repository",
                value: repositories.some((repository) => repository.path === form.repoRoot) ? form.repoRoot : "",
                onChange: (event) => {
                  const repository = repositories.find(
                    (item) => item.path === event.target.value
                  );
                  setForm((current) => ({
                    ...current,
                    repoRoot: event.target.value,
                    ...repository?.defaultTarget === void 0 ? {} : { targetRef: repository.defaultTarget }
                  }));
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.repoRoot;
                    return next;
                  });
                },
                options: [
                  { value: "", label: "Choose a saved repository" },
                  ...repositories.map((repository) => ({
                    value: repository.path,
                    label: repository.name
                  }))
                ]
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("label", { className: "cr-label", htmlFor: "repo-root", children: "Repository path" }),
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                "input",
                {
                  id: "repo-root",
                  className: "cr-input cr-mono",
                  value: form.repoRoot,
                  onChange: (event) => update("repoRoot", event.target.value),
                  placeholder: "/srv/repos/example",
                  autoComplete: "off",
                  spellCheck: false,
                  "aria-invalid": errors.repoRoot === void 0 ? void 0 : true,
                  "aria-describedby": errors.repoRoot === void 0 ? void 0 : "repo-root-error",
                  required: true
                }
              ),
              errors.repoRoot !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-error", id: "repo-root-error", role: "alert", children: errors.repoRoot }) : null
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("h2", { className: "cr-form-section-title", children: "Review" }),
          /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-grid", children: [
            /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-field", style: { gridColumn: "1 / -1" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("label", { className: "cr-label", htmlFor: "review-title", children: "Title" }),
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                "input",
                {
                  id: "review-title",
                  className: "cr-input",
                  value: form.title,
                  onChange: (event) => update("title", event.target.value),
                  placeholder: "Billing retry semantics",
                  "aria-invalid": errors.title === void 0 ? void 0 : true,
                  "aria-describedby": errors.title === void 0 ? void 0 : "review-title-error",
                  required: true
                }
              ),
              errors.title !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-error", id: "review-title-error", role: "alert", children: errors.title }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                Select,
                {
                  label: "Reviewer",
                  id: "reviewer",
                  value: form.reviewer,
                  onChange: (event) => update("reviewer", event.target.value),
                  options: [
                    { value: "none", label: "Manual review only" },
                    { value: "worker", label: "Agent worker" }
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-hint", children: "Manual reviews accept comments immediately. Agent worker queues a read-only reviewer job." })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
              Select,
              {
                label: "Diff scope",
                id: "scope-kind",
                value: form.kind,
                onChange: (event) => update("kind", event.target.value),
                options: [
                  { value: "branch", label: "Merge request (branches)" },
                  { value: "worktree", label: "Working tree" },
                  { value: "commit", label: "Single commit" }
                ]
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("h2", { className: "cr-form-section-title", children: "Changes" }),
          form.kind === "branch" ? /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)(import_jsx_runtime29.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-grid", children: [
              /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-field", children: [
                /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("label", { className: "cr-label", htmlFor: "source-ref", children: "Source branch" }),
                /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                  "input",
                  {
                    id: "source-ref",
                    className: "cr-input cr-mono",
                    value: form.sourceRef,
                    onChange: (event) => update("sourceRef", event.target.value),
                    placeholder: "feature/billing",
                    autoComplete: "off",
                    spellCheck: false,
                    list: "branch-options",
                    "aria-invalid": errors.sourceRef === void 0 ? void 0 : true,
                    "aria-describedby": errors.sourceRef === void 0 ? "source-ref-hint" : "source-ref-error"
                  }
                ),
                errors.sourceRef !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-error", id: "source-ref-error", role: "alert", children: errors.sourceRef }) : /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-hint", id: "source-ref-hint", children: "The branch whose commits you want to inspect." })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-field", children: [
                /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("label", { className: "cr-label", htmlFor: "target-ref", children: "Target branch" }),
                /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                  "input",
                  {
                    id: "target-ref",
                    className: "cr-input cr-mono",
                    value: form.targetRef,
                    onChange: (event) => update("targetRef", event.target.value),
                    placeholder: "main",
                    autoComplete: "off",
                    spellCheck: false,
                    list: "branch-options",
                    "aria-invalid": errors.targetRef === void 0 ? void 0 : true,
                    "aria-describedby": errors.targetRef === void 0 ? "target-ref-hint" : "target-ref-error"
                  }
                ),
                errors.targetRef !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-error", id: "target-ref-error", role: "alert", children: errors.targetRef }) : /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-hint", id: "target-ref-hint", children: "The merge destination. Only the boundary is recorded." })
              ] })
            ] }),
            branchesLoading ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("p", { className: "cr-hint", role: "status", children: "Loading branches\u2026" }) : null,
            branchesError !== null ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("p", { className: "cr-error", role: "alert", children: branchesError }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("fieldset", { className: "cr-commits-fieldset", children: [
              /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("legend", { className: "cr-label", children: "Commits" }),
              /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("label", { className: "cr-radio", children: [
                /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                  "input",
                  {
                    type: "radio",
                    name: "commits-mode",
                    value: "all",
                    checked: form.commitsMode === "all",
                    onChange: () => {
                      update("commitsMode", "all");
                      setErrors((current) => {
                        const next = { ...current };
                        delete next.commits;
                        return next;
                      });
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("span", { children: [
                  "All commits in the merge request",
                  /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-hint", children: "Diffs the source branch against the merge base with the target." })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("label", { className: "cr-radio", children: [
                /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                  "input",
                  {
                    type: "radio",
                    name: "commits-mode",
                    value: "selected",
                    checked: form.commitsMode === "selected",
                    onChange: () => update("commitsMode", "selected")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("span", { children: [
                  "Choose commits",
                  /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-hint", children: "The selection is inclusive: commits between the first and last checked commit are included." })
                ] })
              ] }),
              form.commitsMode === "selected" ? /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-commit-picker", children: [
                commitsLoading ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("p", { className: "cr-hint", role: "status", children: "Loading commits\u2026" }) : commitsError !== null ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("p", { className: "cr-error", role: "alert", children: commitsError }) : commits.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("p", { className: "cr-hint", children: "No commits found between these branches." }) : /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("ul", { className: "cr-commit-list", children: commits.map((commit) => /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("label", { className: "cr-commit-option", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: selected.includes(commit.sha),
                      onChange: () => toggleCommit(commit.sha)
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-commit-sha", children: commit.shortSha }),
                  " ",
                  /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-commit-subject", children: commit.subject }),
                  " ",
                  /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-commit-author", children: commit.author })
                ] }) }, commit.sha)) }),
                chosenShas.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("p", { className: "cr-hint", role: "status", children: [
                  chosenShas.length,
                  " commit",
                  chosenShas.length === 1 ? "" : "s",
                  " will be reviewed."
                ] }) : null,
                errors.commits !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-error", role: "alert", children: errors.commits }) : null
              ] }) : null
            ] })
          ] }) : form.kind === "worktree" ? /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("label", { className: "cr-label", htmlFor: "worktree-base", children: "Base branch" }),
            /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
              "input",
              {
                id: "worktree-base",
                className: "cr-input cr-mono",
                value: form.baseRef,
                onChange: (event) => update("baseRef", event.target.value),
                placeholder: "main",
                autoComplete: "off",
                spellCheck: false,
                list: "branch-options",
                "aria-invalid": errors.baseRef === void 0 ? void 0 : true
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-hint", children: "Compares the base commit with the current worktree, including untracked files." }),
            errors.baseRef !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-error", role: "alert", children: errors.baseRef }) : null
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("label", { className: "cr-label", htmlFor: "commit-sha", children: "Commit SHA" }),
            /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
              "input",
              {
                id: "commit-sha",
                className: "cr-input cr-mono",
                value: form.sha,
                onChange: (event) => update("sha", event.target.value),
                placeholder: "4f3a2c1",
                autoComplete: "off",
                spellCheck: false,
                "aria-invalid": errors.sha === void 0 ? void 0 : true,
                "aria-describedby": errors.sha === void 0 ? void 0 : "commit-sha-error"
              }
            ),
            errors.sha !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "cr-error", id: "commit-sha-error", role: "alert", children: errors.sha }) : null
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "cr-form-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(Button, { type: "submit", loading: submitting, children: "Create review" }),
          /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(Button, { type: "button", variant: "secondary", onClick: () => navigate("/"), children: "Cancel" })
        ] })
      ] })
    ] })
  ] });
}

// packages/web/src/pages/AuthPage.tsx
var import_react25 = require("react");
var import_jsx_runtime30 = require("react/jsx-runtime");
function nextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (next === null || next === "" || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
function AuthPage({ client }) {
  const navigate = useNavigate();
  const [token, setToken] = (0, import_react25.useState)("");
  const [error, setError] = (0, import_react25.useState)(null);
  const [submitting, setSubmitting] = (0, import_react25.useState)(false);
  async function onSubmit(event) {
    event.preventDefault();
    if (token.trim() === "") {
      setError("Enter the token configured for this daemon.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await client.authenticate(token.trim());
      setToken("");
      navigate(nextPath(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "cr-auth-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
      PageHeader,
      {
        eyebrow: "Authentication",
        title: "Sign in to reviewd",
        description: "Paste the shared token from the daemon configuration. It is exchanged for an HttpOnly session cookie and never stored in this browser."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("form", { className: "cr-form", onSubmit: (event) => void onSubmit(event), noValidate: true, children: /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "cr-form-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
        Input,
        {
          label: "Access token",
          type: "password",
          autoComplete: "current-password",
          value: token,
          onChange: (event) => setToken(event.target.value),
          error: error ?? void 0,
          hint: "At least 32 bytes; the daemon never echoes it back.",
          required: true
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "cr-form-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(Button, { type: "submit", loading: submitting, children: "Sign in" }),
        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(Button, { type: "button", variant: "secondary", onClick: () => navigate("/"), children: "Back to reviews" })
      ] })
    ] }) })
  ] });
}

// packages/web/src/pages/HealthPage.tsx
var import_react26 = require("react");
var import_jsx_runtime31 = require("react/jsx-runtime");
function HealthPage({ client }) {
  const [health, setHealth] = (0, import_react26.useState)(null);
  const [error, setError] = (0, import_react26.useState)(null);
  const [loading, setLoading] = (0, import_react26.useState)(true);
  const [reloadKey, setReloadKey] = (0, import_react26.useState)(0);
  const load = (0, import_react26.useCallback)(
    async (signal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.health();
        if (!signal.aborted) setHealth(result);
      } catch (err) {
        if (!signal.aborted) setError(err instanceof Error ? err.message : "Health check failed");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [client]
  );
  (0, import_react26.useEffect)(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);
  return /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("div", { className: "cr-health-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(
      PageHeader,
      {
        eyebrow: "Operations",
        title: "Daemon health",
        description: "A public, unauthenticated read of the reviewd process and its store.",
        actions: /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(Button, { variant: "secondary", onClick: () => setReloadKey((value) => value + 1), children: "Refresh" })
      }
    ),
    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(
      ErrorPanel,
      {
        title: "Health check failed",
        message: error,
        onRetry: () => setReloadKey((value) => value + 1)
      }
    ) : loading && health === null ? /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("div", { className: "cr-form-card", "aria-label": "Loading health", children: [
      /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(Skeleton, { width: "40%", height: 18 }),
      /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(Skeleton, { width: "100%", height: 12 }),
      /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(Skeleton, { width: "72%", height: 12 })
    ] }) : health !== null ? /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)(import_jsx_runtime31.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("div", { className: "cr-form-card", style: { marginBottom: 16 }, children: /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(Badge, { tone: health.status === "ok" ? "success" : "danger", children: health.status }),
        /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("span", { className: "cr-meta", children: [
          "store ",
          health.store.writable ? "writable" : "read-only",
          " \xB7 git",
          " ",
          health.git.ok ? "ok" : "unavailable",
          health.version === void 0 ? "" : ` \xB7 v${health.version}`
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("pre", { className: "cr-code-block", "aria-label": "Raw health response", children: JSON.stringify(health, null, 2) })
    ] }) : null
  ] });
}

// packages/web/src/pages/SettingsPage.tsx
var import_react29 = require("react");

// packages/web/src/pages/FolderPickerDialog.tsx
var import_react27 = require("react");
var import_jsx_runtime32 = require("react/jsx-runtime");
function FolderPickerDialog({
  client,
  initialPath,
  onClose,
  onSelect
}) {
  const [path, setPath] = (0, import_react27.useState)(
    initialPath !== void 0 && initialPath.trim() !== "" ? initialPath.trim() : void 0
  );
  const [typedPath, setTypedPath] = (0, import_react27.useState)(initialPath?.trim() ?? "");
  const [listing, setListing] = (0, import_react27.useState)(null);
  const [loading, setLoading] = (0, import_react27.useState)(true);
  const [error, setError] = (0, import_react27.useState)(null);
  const [requestKey, setRequestKey] = (0, import_react27.useState)(0);
  const pathInputRef = (0, import_react27.useRef)(null);
  (0, import_react27.useEffect)(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void client.listDirectories(path, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setListing(result);
      setTypedPath(
        (current) => document.activeElement === pathInputRef.current ? current : result.path
      );
    }).catch((caught) => {
      if (controller.signal.aborted) return;
      setListing(null);
      setError(caught instanceof Error ? caught.message : "Could not read this folder.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [client, path, requestKey]);
  function openTypedPath(event) {
    event.preventDefault();
    const next = typedPath.trim();
    if (next === "") {
      setPath(void 0);
      setRequestKey((value) => value + 1);
      return;
    }
    setPath(next);
    setRequestKey((value) => value + 1);
  }
  const isGitRepository = listing?.entries.some((entry) => entry.name === ".git") ?? false;
  const subfolders = listing?.entries.filter((entry) => entry.name !== ".git") ?? [];
  function selectCurrent() {
    if (listing === null) return;
    const last = listing.breadcrumbs[listing.breadcrumbs.length - 1]?.name;
    onSelect(listing.path, last === void 0 || last === "/" ? "" : last);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(
    Dialog,
    {
      open: true,
      title: "Choose a repository folder",
      description: "Browse folders on the daemon. A folder is valid when it contains a checkout with a .git entry.",
      onClose,
      actions: /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(import_jsx_runtime32.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(Button, { type: "button", variant: "ghost", onClick: onClose, children: "Cancel" }),
        /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(Button, { type: "button", onClick: selectCurrent, disabled: listing === null || loading, children: "Use this folder" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("form", { className: "cr-folder-path-form", onSubmit: openTypedPath, children: [
          /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
            Input,
            {
              label: "Folder path",
              ref: pathInputRef,
              value: typedPath,
              onChange: (event) => setTypedPath(event.target.value),
              placeholder: "/home/user/repositories",
              autoComplete: "off",
              spellCheck: false,
              className: "cr-mono"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(Button, { type: "submit", variant: "secondary", children: "Open" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("div", { className: "cr-folder-nav", children: [
          /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
            Button,
            {
              type: "button",
              size: "small",
              variant: "secondary",
              disabled: listing?.parent === null || listing?.parent === void 0,
              onClick: () => {
                if (listing?.parent !== null && listing?.parent !== void 0) {
                  setPath(listing.parent);
                }
              },
              children: "Up"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("nav", { className: "cr-folder-breadcrumbs", "aria-label": "Breadcrumb", children: listing?.breadcrumbs.map((crumb, index) => {
            const last = index === listing.breadcrumbs.length - 1;
            return /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { className: "cr-folder-crumb", children: [
              index > 0 ? /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { "aria-hidden": "true", className: "cr-folder-separator", children: "/" }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-folder-crumb-button",
                  "aria-current": last ? "location" : void 0,
                  onClick: () => setPath(crumb.path),
                  children: crumb.name
                }
              )
            ] }, crumb.path);
          }) }),
          isGitRepository ? /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "cr-folder-git-badge", children: "git repo" }) : null
        ] }),
        error !== null ? /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
          ErrorPanel,
          {
            title: "Could not open this folder",
            message: error,
            retryLabel: "Go to home",
            onRetry: () => {
              setPath(void 0);
              setRequestKey((value) => value + 1);
            }
          }
        ) : loading && listing === null ? /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("p", { className: "cr-muted", role: "status", children: "Reading folders\u2026" }) : listing === null ? null : subfolders.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("p", { className: "cr-muted", children: "This folder has no subfolders. You can still choose it." }) : /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("ul", { className: "cr-folder-list", "aria-label": "Folders", children: subfolders.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("button", { type: "button", className: "cr-folder-entry", onClick: () => setPath(entry.path), children: [
          /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "cr-folder-entry-name", children: entry.name }),
          entry.isGit ? /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "cr-folder-git-badge", children: "git repo" }) : null
        ] }) }, entry.path)) }),
        listing?.truncated === true ? /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("p", { className: "cr-hint", children: "Showing the first 500 folders. Type a path to jump deeper." }) : null
      ]
    }
  );
}

// packages/web/src/pages/RepositoryBranchSelect.tsx
var import_react28 = require("react");
var import_jsx_runtime33 = require("react/jsx-runtime");
var BRANCH_DEBOUNCE_MS = 300;
function RepositoryBranchSelect({
  client,
  id,
  path,
  value,
  disabled = false,
  onChange
}) {
  const [data, setData] = (0, import_react28.useState)(null);
  const [errorState, setErrorState] = (0, import_react28.useState)(null);
  const [retryKey, setRetryKey] = (0, import_react28.useState)(0);
  const trimmedPath = path.trim();
  const branches = data?.path === trimmedPath ? data.branches : null;
  const error = errorState?.path === trimmedPath ? errorState.message : null;
  const loading = trimmedPath !== "" && branches === null && error === null;
  (0, import_react28.useEffect)(() => {
    if (trimmedPath === "") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client.listBranches(trimmedPath, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setData({ path: trimmedPath, branches: result.branches });
        setErrorState(null);
      }).catch((caught) => {
        if (controller.signal.aborted) return;
        setData(null);
        setErrorState({
          path: trimmedPath,
          message: caught instanceof Error ? caught.message : "Could not load git branches."
        });
      });
    }, BRANCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, trimmedPath, retryKey]);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  let hint;
  let options;
  let selectDisabled = disabled;
  if (trimmedPath === "") {
    hint = "Choose a repository folder or enter its path first.";
    options = [{ value: "", label: "Select a repository first" }];
    selectDisabled = true;
  } else if (loading) {
    hint = "Loading git branches\u2026";
    options = [{ value, label: "Loading branches\u2026" }];
    selectDisabled = true;
  } else if (error !== null) {
    hint = "Could not load git branches.";
    options = [{ value, label: value === "" ? "Branches unavailable" : value }];
    selectDisabled = true;
  } else {
    const available = branches ?? [];
    options = [{ value: "", label: "No default branch" }];
    if (value !== "" && !available.includes(value)) {
      options.push({ value, label: `${value} (saved)` });
    }
    for (const branch of available) options.push({ value: branch, label: branch });
    hint = available.length === 0 ? "This repository has no branches yet." : "Preselected when starting a review.";
  }
  return /* @__PURE__ */ (0, import_jsx_runtime33.jsxs)("div", { className: "cr-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime33.jsx)("label", { className: "cr-label", htmlFor: id, children: "Default target branch" }),
    /* @__PURE__ */ (0, import_jsx_runtime33.jsx)(
      "select",
      {
        id,
        className: "cr-select cr-mono",
        value,
        disabled: selectDisabled,
        "aria-invalid": error === null ? void 0 : true,
        "aria-busy": loading || void 0,
        "aria-describedby": error === null ? hintId : errorId,
        onChange: (event) => onChange(event.target.value),
        children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime33.jsx)("option", { value: option.value, children: option.label }, option.value))
      }
    ),
    error === null ? /* @__PURE__ */ (0, import_jsx_runtime33.jsx)("span", { className: "cr-hint", id: hintId, children: hint }) : /* @__PURE__ */ (0, import_jsx_runtime33.jsxs)("div", { className: "cr-branch-feedback", children: [
      /* @__PURE__ */ (0, import_jsx_runtime33.jsxs)("span", { className: "cr-error", id: errorId, role: "alert", children: [
        hint,
        " ",
        error
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime33.jsx)(
        Button,
        {
          type: "button",
          size: "small",
          variant: "ghost",
          disabled,
          onClick: () => {
            setErrorState(null);
            setRetryKey((current) => current + 1);
          },
          children: "Retry branches"
        }
      )
    ] })
  ] });
}

// packages/web/src/pages/SettingsPage.tsx
var import_jsx_runtime34 = require("react/jsx-runtime");
function SettingsPage({ client }) {
  const [drafts, setDrafts] = (0, import_react29.useState)([]);
  const [errors, setErrors] = (0, import_react29.useState)({});
  const [loadError, setLoadError] = (0, import_react29.useState)(null);
  const [saveError, setSaveError] = (0, import_react29.useState)(null);
  const [notice, setNotice] = (0, import_react29.useState)(null);
  const [loading, setLoading] = (0, import_react29.useState)(true);
  const [saving, setSaving] = (0, import_react29.useState)(false);
  const [reloadKey, setReloadKey] = (0, import_react29.useState)(0);
  const [picker, setPicker] = (0, import_react29.useState)(null);
  const nextKeyRef = (0, import_react29.useRef)(1);
  const savingRef = (0, import_react29.useRef)(false);
  function nextKey() {
    const key = nextKeyRef.current;
    nextKeyRef.current += 1;
    return key;
  }
  (0, import_react29.useEffect)(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void client.listRepositories().then((result) => {
      if (controller.signal.aborted) return;
      nextKeyRef.current = result.repositories.length + 1;
      setDrafts(
        result.repositories.map((repository, index) => ({
          ...repository,
          key: index + 1
        }))
      );
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load repositories.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [client, reloadKey]);
  function update(key, patch) {
    setDrafts(
      (current) => current.map((draft) => {
        if (draft.key !== key) return draft;
        const pathChanged = patch.path !== void 0 && patch.path !== draft.path;
        return {
          ...draft,
          ...patch,
          ...pathChanged ? { defaultTarget: "" } : {}
        };
      })
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }
  function addRepository() {
    setDrafts((current) => [...current, { key: nextKey(), name: "", path: "", defaultTarget: "" }]);
    setNotice(null);
  }
  function chooseFolder(path, name) {
    if (picker === null) return;
    const key = picker.key;
    setPicker(null);
    setDrafts(
      (current) => current.map(
        (draft) => draft.key === key ? {
          ...draft,
          path,
          ...path === draft.path ? {} : { defaultTarget: "" },
          name: draft.name.trim() === "" ? name : draft.name
        } : draft
      )
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }
  function removeRepository(key) {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }
  async function save() {
    if (savingRef.current) return;
    const nextErrors = {};
    for (const draft of drafts) {
      const draftErrors = {};
      if (draft.name.trim() === "") draftErrors.name = "Repository name is required.";
      if (draft.path.trim() === "") draftErrors.path = "Repository path is required.";
      if (Object.keys(draftErrors).length > 0) nextErrors[draft.key] = draftErrors;
    }
    setErrors(nextErrors);
    setSaveError(null);
    setNotice(null);
    if (Object.keys(nextErrors).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await client.saveRepositories(
        drafts.map((draft) => ({
          name: draft.name.trim(),
          path: draft.path.trim(),
          ...draft.defaultTarget === void 0 || draft.defaultTarget.trim() === "" ? {} : { defaultTarget: draft.defaultTarget.trim() }
        }))
      );
      setDrafts(
        result.repositories.map((repository, index) => ({
          ...repository,
          key: index + 1
        }))
      );
      nextKeyRef.current = result.repositories.length + 1;
      setNotice("Repository settings saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save repository settings.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)(import_jsx_runtime34.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
      PageHeader,
      {
        eyebrow: "Settings",
        title: "Repositories",
        description: "Register the local checkouts that reviewd may inspect. Paths are resolved on the daemon.",
        actions: /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
          Button,
          {
            type: "button",
            loading: saving,
            disabled: loading || saving || loadError !== null,
            onClick: () => void save(),
            children: "Save repositories"
          }
        )
      }
    ),
    loadError !== null ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
      ErrorPanel,
      {
        title: "Could not load repositories",
        message: loadError,
        onRetry: () => setReloadKey((value) => value + 1)
      }
    ) : loading ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("p", { className: "cr-muted", role: "status", children: "Loading repositories\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)(
      "form",
      {
        className: "cr-settings-form",
        onSubmit: (event) => {
          event.preventDefault();
          void save();
        },
        noValidate: true,
        children: [
          saveError !== null ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(ErrorPanel, { title: "Could not save repositories", message: saveError }) : null,
          notice !== null ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("p", { className: "cr-settings-notice", role: "status", children: notice }) : null,
          drafts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "cr-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("h2", { children: "No repositories yet" }),
            /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("p", { children: "Add a checkout to start reviewing merge requests from it." }),
            /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(Button, { type: "button", variant: "secondary", onClick: addRepository, children: "Add repository" })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("ol", { className: "cr-repo-list", children: drafts.map((draft, index) => {
            const draftErrors = errors[draft.key] ?? {};
            return /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("li", { className: "cr-repo-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "cr-repo-fields", children: [
                /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "cr-field", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("label", { className: "cr-label", htmlFor: `repo-${draft.key}-name`, children: "Repository name" }),
                  /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
                    "input",
                    {
                      id: `repo-${draft.key}-name`,
                      className: "cr-input",
                      value: draft.name,
                      disabled: saving,
                      onChange: (event) => update(draft.key, { name: event.target.value }),
                      placeholder: "Checkout",
                      "aria-invalid": draftErrors.name === void 0 ? void 0 : true,
                      "aria-describedby": draftErrors.name === void 0 ? void 0 : `repo-${draft.key}-name-error`
                    }
                  ),
                  draftErrors.name !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
                    "span",
                    {
                      className: "cr-error",
                      id: `repo-${draft.key}-name-error`,
                      role: "alert",
                      children: draftErrors.name
                    }
                  ) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "cr-field", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("label", { className: "cr-label", htmlFor: `repo-${draft.key}-path`, children: "Path on daemon" }),
                  /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "cr-path-control", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
                      "input",
                      {
                        id: `repo-${draft.key}-path`,
                        className: "cr-input cr-mono",
                        value: draft.path,
                        disabled: saving,
                        onChange: (event) => update(draft.key, { path: event.target.value }),
                        placeholder: "/srv/repos/checkout",
                        autoComplete: "off",
                        spellCheck: false,
                        "aria-invalid": draftErrors.path === void 0 ? void 0 : true,
                        "aria-describedby": draftErrors.path === void 0 ? void 0 : `repo-${draft.key}-path-error`
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(Tooltip, { label: "Browse folders", children: /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
                      IconButton,
                      {
                        label: `Browse folders for repository ${draft.name.trim() || draft.path.trim() || index + 1}`,
                        className: "cr-path-browse",
                        disabled: saving,
                        onClick: () => setPicker({ key: draft.key, path: draft.path.trim() }),
                        children: /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(FolderIcon, {})
                      }
                    ) })
                  ] }),
                  draftErrors.path !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
                    "span",
                    {
                      className: "cr-error",
                      id: `repo-${draft.key}-path-error`,
                      role: "alert",
                      children: draftErrors.path
                    }
                  ) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
                  RepositoryBranchSelect,
                  {
                    client,
                    id: `repo-${draft.key}-target`,
                    path: draft.path,
                    value: draft.defaultTarget ?? "",
                    disabled: saving,
                    onChange: (value) => update(draft.key, { defaultTarget: value })
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
                Button,
                {
                  type: "button",
                  className: "cr-repo-remove",
                  variant: "secondary",
                  onClick: () => removeRepository(draft.key),
                  disabled: saving,
                  "aria-label": `Remove repository ${draft.name.trim() || draft.path.trim() || index + 1}`,
                  children: "Remove"
                }
              )
            ] }, draft.key);
          }) }),
          drafts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(Button, { type: "button", variant: "secondary", onClick: addRepository, disabled: saving, children: "Add repository" }) : null
        ]
      }
    ),
    picker !== null ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
      FolderPickerDialog,
      {
        client,
        initialPath: picker.path === "" ? void 0 : picker.path,
        onClose: () => setPicker(null),
        onSelect: chooseFolder
      },
      picker.key
    ) : null
  ] });
}

// packages/web/src/pages/ReviewDetailPage.tsx
var import_jsx_runtime35 = require("react/jsx-runtime");
function ReviewDetailPage({ client, id }) {
  const location = useLocation();
  const navigate = useNavigate();
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(ReviewDetail, { client, id, location, navigate });
}

// packages/web/src/pages/EditReviewPage.tsx
var import_react30 = require("react");
var import_jsx_runtime36 = require("react/jsx-runtime");
var SCOPE_OPTIONS = [
  { value: "range", label: "Merge request (branches)" },
  { value: "worktree", label: "Working tree" },
  { value: "commit", label: "Single commit" },
  { value: "commits", label: "Selected commits" }
];
function backendOf(view) {
  const backend = view.review.reviewer?.backend;
  if (backend === "worker" || backend === "command" || backend === "fake") return backend;
  return "none";
}
function resolvedScopeOf(view) {
  return view.latestSnapshot?.scope ?? null;
}
function formFrom(view) {
  const resolved = resolvedScopeOf(view);
  const kind = resolved?.kind ?? "range";
  const form = {
    title: view.review.title,
    reviewer: backendOf(view),
    kind,
    baseRef: kind === "worktree" ? resolved?.baseRef ?? "HEAD" : resolved?.baseRef ?? resolved?.baseSha ?? "",
    headRef: resolved?.headRef ?? (resolved === null || resolved === void 0 ? "" : resolved.headSha ?? ""),
    sha: resolved?.headSha ?? resolved?.baseSha ?? "",
    shasText: (resolved?.shas ?? []).join(" ")
  };
  return {
    form,
    initial: {
      title: view.review.title,
      reviewer: form.reviewer,
      scopeDraft: scopeDraftKey(form),
      currentLabel: resolved?.label ?? "No snapshot",
      hasSnapshot: resolved !== null && resolved !== void 0
    }
  };
}
function scopeDraftKey(form) {
  return JSON.stringify({
    kind: form.kind,
    baseRef: form.baseRef.trim(),
    headRef: form.headRef.trim(),
    sha: form.sha.trim(),
    shas: form.shasText.trim().split(/\s+/).filter(Boolean)
  });
}
function buildScope2(form) {
  if (form.kind === "range") {
    const baseRef = form.baseRef.trim();
    const headRef = form.headRef.trim();
    if (baseRef === "" || headRef === "") return null;
    return { kind: "range", baseRef, headRef };
  }
  if (form.kind === "worktree") {
    const baseRef = form.baseRef.trim();
    if (baseRef === "") return null;
    return { kind: "worktree", baseRef };
  }
  if (form.kind === "commit") {
    const sha = form.sha.trim();
    if (sha === "") return null;
    return { kind: "commit", sha };
  }
  const shas = form.shasText.trim().split(/\s+/).filter(Boolean);
  if (shas.length === 0) return null;
  return { kind: "commits", shas };
}
function EditReviewPage({ client, id }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [view, setView] = (0, import_react30.useState)(null);
  const [form, setForm] = (0, import_react30.useState)(null);
  const [initial, setInitial] = (0, import_react30.useState)(null);
  const [loading, setLoading] = (0, import_react30.useState)(true);
  const [loadError, setLoadError] = (0, import_react30.useState)(null);
  const [submitError, setSubmitError] = (0, import_react30.useState)(null);
  const [saving, setSaving] = (0, import_react30.useState)(false);
  const [branches, setBranches] = (0, import_react30.useState)([]);
  (0, import_react30.useEffect)(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void client.getReview(id).then((next) => {
      if (!active) return;
      const state = formFrom(next);
      setView(next);
      setForm(state.form);
      setInitial(state.initial);
    }).catch((error) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : "Could not load the review.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [client, id]);
  const repoRoot = view?.review.repoRoot ?? "";
  (0, import_react30.useEffect)(() => {
    if (repoRoot === "") return;
    let active = true;
    void client.listBranches(repoRoot).then((result) => {
      if (active) setBranches(result.branches);
    }).catch(() => {
      if (active) setBranches([]);
    });
    return () => {
      active = false;
    };
  }, [client, repoRoot]);
  const closed = view?.review.status === "closed";
  const titleChanged = form !== null && initial !== null && form.title.trim() !== initial.title.trim();
  const reviewerChanged = form !== null && initial !== null && form.reviewer !== initial.reviewer;
  const scopeChanged = form !== null && initial !== null && initial.hasSnapshot && scopeDraftKey(form) !== initial.scopeDraft;
  const dirty = titleChanged || reviewerChanged || scopeChanged;
  const nextRound = view === null ? 0 : view.review.rounds.length + 1;
  const reviewerOptions = (0, import_react30.useMemo)(() => {
    const current = initial?.reviewer ?? "none";
    const options = [
      { value: "none", label: "Manual review only" },
      { value: "worker", label: "Agent worker" }
    ];
    if (current !== "none" && current !== "worker") {
      options.push({ value: current, label: `${current} (current)` });
    }
    return options;
  }, [initial?.reviewer]);
  function update(key, value) {
    setForm((current) => current === null ? current : { ...current, [key]: value });
    setSubmitError(null);
  }
  async function onSubmit(event) {
    event.preventDefault();
    if (form === null || initial === null || view === null || closed) return;
    const title = form.title.trim();
    if (title === "") {
      setSubmitError("Give this review a title.");
      return;
    }
    const scope = scopeChanged ? buildScope2(form) : null;
    if (scopeChanged && scope === null) {
      setSubmitError("Complete the scope fields before saving.");
      return;
    }
    const input = {};
    if (titleChanged) input.title = title;
    if (reviewerChanged) input.reviewer = { backend: form.reviewer };
    if (scope !== null) input.scope = scope;
    if (Object.keys(input).length === 0) {
      navigate(`/review/${encodeURIComponent(id)}`);
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await client.updateReview(id, input);
      toast("Review updated");
      navigate(`/review/${encodeURIComponent(id)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not update the review.");
    } finally {
      setSaving(false);
    }
  }
  if (loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-form-loading", "data-testid": "edit-review-loading", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("p", { className: "cr-hint", role: "status", children: "Loading the review\u2026" }) });
  }
  if (loadError !== null || view === null || form === null || initial === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)(import_jsx_runtime36.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(PageHeader, { eyebrow: "Edit review", title: "Edit the request" }),
      /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
        ErrorPanel,
        {
          title: "Could not load the review",
          message: loadError ?? "The review is unavailable.",
          onRetry: () => setSubmitError(null)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(Button, { variant: "secondary", onClick: () => navigate("/"), children: "Back to reviews" })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)(import_jsx_runtime36.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
      PageHeader,
      {
        eyebrow: "Edit review",
        title: "Edit the request",
        description: "Correct the title, reviewer or diff boundary. The repository cannot be changed; create a new review for a different repository."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("form", { className: "cr-form", onSubmit: (event) => void onSubmit(event), noValidate: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("datalist", { id: "edit-branch-options", children: branches.map((branch) => /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("option", { value: branch }, branch)) }),
      closed ? /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("p", { className: "cr-notice cr-notice-warning", children: "Closed reviews cannot be edited. You can still delete this review from its page." }) : null,
      submitError !== null ? /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(ErrorPanel, { title: "Could not update the review", message: submitError }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-form-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-form-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("h2", { className: "cr-form-section-title", children: "Repository" }),
          /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-form-grid", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", style: { gridColumn: "1 / -1" }, children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
            Input,
            {
              label: "Repository path",
              value: repoRoot,
              readOnly: true,
              disabled: true,
              className: "cr-mono",
              hint: "The repository is fixed at creation. Create a new review to change it."
            }
          ) }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-form-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("h2", { className: "cr-form-section-title", children: "Review" }),
          /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-form-grid", children: [
            /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", style: { gridColumn: "1 / -1" }, children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
              Input,
              {
                label: "Title",
                value: form.title,
                onChange: (event) => update("title", event.target.value),
                disabled: closed,
                required: true
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
                Select,
                {
                  label: "Reviewer",
                  value: form.reviewer,
                  onChange: (event) => update("reviewer", event.target.value),
                  disabled: closed,
                  options: reviewerOptions
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("span", { className: "cr-hint", children: "Manual reviews accept comments immediately. Agent worker queues a read-only reviewer job." })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
              Select,
              {
                label: "Diff scope",
                value: form.kind,
                onChange: (event) => update("kind", event.target.value),
                disabled: closed || !initial.hasSnapshot,
                options: SCOPE_OPTIONS
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-form-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("h2", { className: "cr-form-section-title", children: "Changes" }),
          /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("p", { className: "cr-meta", children: [
            "Current scope: ",
            /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("span", { className: "cr-mono", children: initial.currentLabel })
          ] }),
          !initial.hasSnapshot ? /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("p", { className: "cr-hint", children: "This review has no snapshot to edit." }) : form.kind === "range" ? /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-form-grid", children: [
            /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
              Input,
              {
                label: "Target branch",
                value: form.baseRef,
                onChange: (event) => update("baseRef", event.target.value),
                disabled: closed,
                list: "edit-branch-options",
                className: "cr-mono"
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
              Input,
              {
                label: "Source branch",
                value: form.headRef,
                onChange: (event) => update("headRef", event.target.value),
                disabled: closed,
                list: "edit-branch-options",
                className: "cr-mono"
              }
            ) })
          ] }) : form.kind === "worktree" ? /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
            Input,
            {
              label: "Base branch",
              value: form.baseRef,
              onChange: (event) => update("baseRef", event.target.value),
              disabled: closed,
              list: "edit-branch-options",
              className: "cr-mono"
            }
          ) }) : form.kind === "commit" ? /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
            Input,
            {
              label: "Commit SHA",
              value: form.sha,
              onChange: (event) => update("sha", event.target.value),
              disabled: closed,
              className: "cr-mono"
            }
          ) }) : /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("div", { className: "cr-field", children: /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
            Input,
            {
              label: "Commits (oldest first)",
              value: form.shasText,
              onChange: (event) => update("shasText", event.target.value),
              disabled: closed,
              className: "cr-mono",
              hint: "Space-separated commit SHAs; the range is inclusive and ordered oldest first."
            }
          ) }),
          scopeChanged && !closed ? /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("p", { className: "cr-notice cr-notice-warning", "data-testid": "scope-warning", children: [
            "Changing the scope creates round ",
            nextRound,
            " from a new snapshot and re-anchors every comment. Previous rounds and comments stay available in history."
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "cr-form-actions", children: [
          !closed ? /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(Button, { type: "submit", loading: saving, disabled: !dirty, children: "Save changes" }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
            Button,
            {
              type: "button",
              variant: "secondary",
              onClick: () => navigate(`/review/${encodeURIComponent(id)}`),
              disabled: saving,
              children: "Cancel"
            }
          )
        ] })
      ] })
    ] })
  ] });
}

// packages/web/src/pages/NotFoundPage.tsx
var import_jsx_runtime37 = require("react/jsx-runtime");
function NotFoundPage({ path }) {
  const navigate = useNavigate();
  return /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("div", { className: "cr-placeholder", children: /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
    PageHeader,
    {
      eyebrow: "404",
      title: "That page does not exist",
      description: `No route matches ${path}. The review list is still one click away.`,
      actions: /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(Button, { onClick: () => navigate("/"), children: "Back to reviews" })
    }
  ) });
}

// packages/web/src/App.tsx
var import_jsx_runtime38 = require("react/jsx-runtime");
function ReviewRoot({
  client,
  showSettingsLink = true
}) {
  const location = useLocation();
  const route = parseRoute(location);
  const navigate = useNavigate();
  const activeClient = (0, import_react31.useMemo)(
    () => client ?? createApiClient({
      baseUrl: BASE_PATH,
      ...AUTH_MODE === "token" ? {
        onUnauthorized: (next) => navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true })
      } : {}
    }),
    [client, navigate]
  );
  (0, import_react31.useEffect)(() => {
    if (AUTH_MODE === "dsh" && route.name === "auth") navigate("/", { replace: true });
  }, [navigate, route.name]);
  return /* @__PURE__ */ (0, import_jsx_runtime38.jsxs)(import_jsx_runtime38.Fragment, { children: [
    route.name === "list" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(ReviewListPage, { client: activeClient }) : null,
    route.name === "new" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(NewReviewPage, { client: activeClient, showSettingsLink }) : null,
    route.name === "auth" && AUTH_MODE === "token" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(AuthPage, { client: activeClient }) : null,
    route.name === "health" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(HealthPage, { client: activeClient }) : null,
    route.name === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(SettingsPage, { client: activeClient }) : null,
    route.name === "review" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(ReviewDetailPage, { client: activeClient, id: route.id }) : null,
    route.name === "edit-review" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(EditReviewPage, { client: activeClient, id: route.id }) : null,
    route.name === "not-found" ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(NotFoundPage, { path: route.path }) : null
  ] });
}
function ReviewProviders({
  children,
  router,
  theme,
  portalContainer
}) {
  const ambientRouter = useRouter();
  const activeRouter = router ?? ambientRouter;
  const themeProps = {
    ...theme?.initialTheme === void 0 ? {} : { initialTheme: theme.initialTheme },
    ...theme?.storageKey === void 0 ? {} : { storageKey: theme.storageKey },
    ...theme?.persist === void 0 ? {} : { persist: theme.persist },
    ...theme?.targetRef === void 0 ? {} : { targetRef: theme.targetRef }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(RouterProvider, { router: activeRouter, children: /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(ThemeProvider, { ...themeProps, children: /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(ToastProvider, { children: portalContainer === void 0 ? children : /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(PortalContainerProvider, { container: portalContainer, children }) }) }) });
}
function ReviewApp({
  client,
  router,
  header,
  theme,
  portalContainer,
  showSettingsLink = true,
  contentClassName
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime38.jsxs)(ReviewProviders, { router, theme, portalContainer, children: [
    header,
    /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("main", { className: contentClassName, children: /* @__PURE__ */ (0, import_jsx_runtime38.jsx)(ReviewRoot, { client, showSettingsLink }) })
  ] });
}

// packages/dsh/src/client/ErrorBoundary.tsx
var import_react32 = require("react");
var import_jsx_runtime39 = require("react/jsx-runtime");
var ErrorBoundary = class extends import_react32.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("reviewd native surface failed", error, info);
  }
  render() {
    if (this.state.error !== null) {
      return /* @__PURE__ */ (0, import_jsx_runtime39.jsxs)("div", { className: "cr-native-error", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("h1", { children: this.props.title ?? "Code review failed to render" }),
        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("p", { children: this.state.error.message }),
        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("button", { type: "button", onClick: () => this.setState({ error: null }), children: "Try again" })
      ] });
    }
    return this.props.children;
  }
};

// packages/dsh/src/client/NativePanel.tsx
var import_jsx_runtime40 = require("react/jsx-runtime");
var ROUTE_STORAGE_KEY = "cr-dsh-route";
function readHostTheme() {
  return typeof document !== "undefined" && document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
}
function NativeHeader() {
  const route = parseRoute(useLocation());
  const active = route.name === "new" ? "/new" : route.name === "health" ? "/health" : "/";
  return /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("header", { className: "cr-native-bar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { className: "cr-native-brand", children: "Code review" }),
    /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("nav", { className: "cr-native-nav", "aria-label": "Code review sections", children: [
      /* @__PURE__ */ (0, import_jsx_runtime40.jsx)(Link, { className: "cr-native-tab", to: "/", "aria-current": active === "/" ? "page" : void 0, children: "Reviews" }),
      /* @__PURE__ */ (0, import_jsx_runtime40.jsx)(
        Link,
        {
          className: "cr-native-tab",
          to: "/new",
          "aria-current": active === "/new" ? "page" : void 0,
          children: "New review"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime40.jsx)(
        Link,
        {
          className: "cr-native-tab",
          to: "/health",
          "aria-current": active === "/health" ? "page" : void 0,
          children: "Health"
        }
      )
    ] })
  ] });
}
function NativePanel({
  client,
  router,
  initialTheme = readHostTheme()
}) {
  const [panelRouter] = (0, import_react33.useState)(
    () => router ?? createMemoryRouter("/", {
      hrefBase: "/code-review",
      storageKey: ROUTE_STORAGE_KEY,
      storage: window.sessionStorage
    })
  );
  const scopeRef = (0, import_react33.useRef)(null);
  const portalRef = (0, import_react33.useRef)(null);
  const activeClient = (0, import_react33.useMemo)(
    () => client ?? createApiClient({ baseUrl: "/api/code-review" }),
    [client]
  );
  const [theme, setTheme] = (0, import_react33.useState)(initialTheme);
  (0, import_react33.useEffect)(() => {
    const syncTheme = () => setTheme(readHostTheme());
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
    syncTheme();
    return () => observer.disconnect();
  }, []);
  (0, import_react33.useEffect)(() => {
    const syncSelection = () => {
      scopeRef.current?.classList.toggle(
        "cr-selecting-lines",
        document.body.classList.contains("cr-selecting-lines")
      );
    };
    const observer = new MutationObserver(syncSelection);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    syncSelection();
    return () => observer.disconnect();
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("div", { ref: scopeRef, className: "cr-native-scope cr-native-panel", "data-theme": theme, children: [
    /* @__PURE__ */ (0, import_jsx_runtime40.jsx)(ErrorBoundary, { title: "Code review failed to render", children: /* @__PURE__ */ (0, import_jsx_runtime40.jsx)(
      ReviewApp,
      {
        client: activeClient,
        router: panelRouter,
        header: /* @__PURE__ */ (0, import_jsx_runtime40.jsx)(NativeHeader, {}),
        theme: { initialTheme: theme, persist: false, targetRef: scopeRef },
        portalContainer: portalRef,
        showSettingsLink: false,
        contentClassName: "cr-native-main"
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("div", { ref: portalRef })
  ] });
}

// packages/dsh/src/client/SettingsSection.tsx
var import_react35 = require("react");

// packages/dsh/src/client/NativeFolderPicker.tsx
var import_react34 = require("react");
var import_jsx_runtime41 = require("react/jsx-runtime");
function FolderGlyph() {
  return /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
    "path",
    {
      d: "M2.5 4.5c0-.55.45-1 1-1h2.6c.27 0 .52.1.7.29l.72.71h5c.55 0 1 .45 1 1v5.5c0 .55-.45 1-1 1h-9c-.55 0-1-.45-1-1v-6.5Z",
      stroke: "currentColor",
      strokeWidth: "1.3",
      strokeLinejoin: "round"
    }
  ) });
}
function NativeFolderPicker({
  client,
  initialPath,
  onClose,
  onSelect
}) {
  const [path, setPath] = (0, import_react34.useState)(
    initialPath !== void 0 && initialPath.trim() !== "" ? initialPath.trim() : void 0
  );
  const [typedPath, setTypedPath] = (0, import_react34.useState)(initialPath?.trim() ?? "");
  const [listing, setListing] = (0, import_react34.useState)(null);
  const [loading, setLoading] = (0, import_react34.useState)(true);
  const [error, setError] = (0, import_react34.useState)(null);
  const [requestKey, setRequestKey] = (0, import_react34.useState)(0);
  const panelRef = (0, import_react34.useRef)(null);
  const pathInputRef = (0, import_react34.useRef)(null);
  (0, import_react34.useEffect)(() => {
    panelRef.current?.focus();
  }, []);
  (0, import_react34.useEffect)(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  (0, import_react34.useEffect)(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void client.listDirectories(path, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setListing(result);
      setTypedPath(
        (current) => document.activeElement === pathInputRef.current ? current : result.path
      );
    }).catch((caught) => {
      if (controller.signal.aborted) return;
      setListing(null);
      setError(caught instanceof Error ? caught.message : "Could not read this folder.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [client, path, requestKey]);
  function openTypedPath(event) {
    event.preventDefault();
    const next = typedPath.trim();
    if (next === "") {
      setPath(void 0);
      setRequestKey((value) => value + 1);
      return;
    }
    setPath(next);
    setRequestKey((value) => value + 1);
  }
  const isGitRepository = listing?.entries.some((entry) => entry.name === ".git") ?? false;
  const subfolders = listing?.entries.filter((entry) => entry.name !== ".git") ?? [];
  function selectCurrent() {
    if (listing === null) return;
    const last = listing.breadcrumbs[listing.breadcrumbs.length - 1]?.name;
    onSelect(listing.path, last === void 0 || last === "/" ? "" : last);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
    "div",
    {
      className: "cr-dsh-picker-layer",
      role: "presentation",
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)(
        "div",
        {
          ref: panelRef,
          className: "cr-dsh-picker",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "cr-dsh-picker-title",
          tabIndex: -1,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("header", { className: "cr-dsh-picker-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("h2", { id: "cr-dsh-picker-title", children: "Choose a repository folder" }),
                /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("p", { children: "A folder is valid when it contains a checkout with a .git entry." })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-dsh-icon-button",
                  "aria-label": "Close folder picker",
                  title: "Close",
                  onClick: onClose,
                  children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
                    "path",
                    {
                      d: "m4 4 8 8M12 4l-8 8",
                      stroke: "currentColor",
                      strokeWidth: "1.5",
                      strokeLinecap: "round"
                    }
                  ) })
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("form", { className: "cr-dsh-picker-path", onSubmit: openTypedPath, children: [
              /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("label", { className: "cr-dsh-label", htmlFor: "cr-dsh-picker-path", children: "Path" }),
              /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("div", { className: "cr-dsh-inline", children: [
                /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
                  "input",
                  {
                    id: "cr-dsh-picker-path",
                    ref: pathInputRef,
                    className: "cr-dsh-input cr-dsh-mono",
                    value: typedPath,
                    onChange: (event) => setTypedPath(event.target.value),
                    placeholder: "/home/user/repositories",
                    autoComplete: "off",
                    spellCheck: false
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("button", { type: "submit", className: "cr-dsh-button", children: "Open" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("div", { className: "cr-dsh-picker-nav", children: [
              /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-dsh-button cr-dsh-button-quiet",
                  disabled: listing?.parent === null || listing?.parent === void 0,
                  onClick: () => {
                    if (listing?.parent !== null && listing?.parent !== void 0) {
                      setPath(listing.parent);
                    }
                  },
                  children: "Up"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("nav", { className: "cr-dsh-breadcrumbs", "aria-label": "Breadcrumb", children: listing?.breadcrumbs.map((crumb, index) => {
                const last = index === listing.breadcrumbs.length - 1;
                return /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("span", { className: "cr-dsh-crumb", children: [
                  index > 0 ? /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("span", { "aria-hidden": "true", className: "cr-dsh-crumb-separator", children: "/" }) : null,
                  /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
                    "button",
                    {
                      type: "button",
                      className: "cr-dsh-crumb-button",
                      "aria-current": last ? "location" : void 0,
                      onClick: () => setPath(crumb.path),
                      children: crumb.name
                    }
                  )
                ] }, crumb.path);
              }) }),
              isGitRepository ? /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("span", { className: "cr-dsh-badge", children: "git repo" }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("div", { className: "cr-dsh-picker-list", children: error !== null ? /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("div", { className: "cr-dsh-picker-state", role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("span", { children: [
                "Could not open this folder: ",
                error
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-dsh-button",
                  onClick: () => {
                    setPath(void 0);
                    setRequestKey((value) => value + 1);
                  },
                  children: "Go to home"
                }
              )
            ] }) : loading && listing === null ? /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("p", { className: "cr-dsh-muted", role: "status", children: "Reading folders\u2026" }) : listing === null ? null : subfolders.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("p", { className: "cr-dsh-muted", children: "This folder has no subfolders. You can still choose it." }) : /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("ul", { className: "cr-dsh-picker-entries", "aria-label": "Folders", children: subfolders.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)(
              "button",
              {
                type: "button",
                className: "cr-dsh-picker-entry",
                onClick: () => setPath(entry.path),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(FolderGlyph, {}),
                  /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("span", { className: "cr-dsh-picker-entry-name", children: entry.name }),
                  entry.isGit ? /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("span", { className: "cr-dsh-badge", children: "git repo" }) : null
                ]
              }
            ) }, entry.path)) }) }),
            listing?.truncated === true ? /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("p", { className: "cr-dsh-muted cr-dsh-picker-hint", children: "Showing the first 500 folders. Type a path to jump deeper." }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("footer", { className: "cr-dsh-picker-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("button", { type: "button", className: "cr-dsh-button", onClick: onClose, children: "Cancel" }),
              /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-dsh-button cr-dsh-button-primary",
                  disabled: listing === null || loading,
                  onClick: selectCurrent,
                  children: "Use this folder"
                }
              )
            ] })
          ]
        }
      )
    }
  );
}

// packages/dsh/src/client/SettingsSection.tsx
var import_jsx_runtime42 = require("react/jsx-runtime");
var BRANCH_DEBOUNCE_MS2 = 300;
function readHostTheme2() {
  return document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
}
function FolderGlyph2() {
  return /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
    "path",
    {
      d: "M2.5 4.5c0-.55.45-1 1-1h2.6c.27 0 .52.1.7.29l.72.71h5c.55 0 1 .45 1 1v5.5c0 .55-.45 1-1 1h-9c-.55 0-1-.45-1-1v-6.5Z",
      stroke: "currentColor",
      strokeWidth: "1.3",
      strokeLinejoin: "round"
    }
  ) });
}
function NativeBranchSelect({
  client,
  id,
  path,
  value,
  disabled,
  onChange
}) {
  const [branches, setBranches] = (0, import_react35.useState)(null);
  const [failure, setFailure] = (0, import_react35.useState)(null);
  const [retryKey, setRetryKey] = (0, import_react35.useState)(0);
  const trimmedPath = path.trim();
  const values = branches?.path === trimmedPath ? branches.values : null;
  const error = failure?.path === trimmedPath ? failure.message : null;
  const loading = trimmedPath !== "" && values === null && error === null;
  (0, import_react35.useEffect)(() => {
    if (trimmedPath === "") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client.listBranches(trimmedPath, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setBranches({ path: trimmedPath, values: result.branches });
        setFailure(null);
      }).catch((caught) => {
        if (controller.signal.aborted) return;
        setBranches(null);
        setFailure({
          path: trimmedPath,
          message: caught instanceof Error ? caught.message : "Could not load git branches."
        });
      });
    }, BRANCH_DEBOUNCE_MS2);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, trimmedPath, retryKey]);
  let options;
  let selectDisabled = disabled;
  if (trimmedPath === "") {
    options = [{ value: "", label: "No default branch" }];
    selectDisabled = true;
  } else if (loading) {
    options = [{ value, label: "Loading branches\u2026" }];
    selectDisabled = true;
  } else if (error !== null) {
    options = [{ value, label: value === "" ? "Branches unavailable" : value }];
    selectDisabled = true;
  } else {
    const available = values ?? [];
    options = [{ value: "", label: "No default branch" }];
    if (value !== "" && !available.includes(value)) {
      options.push({ value, label: `${value} (saved)` });
    }
    for (const branch of available) options.push({ value: branch, label: branch });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("label", { className: "cr-dsh-label", htmlFor: id, children: "Default branch" }),
    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-inline", children: [
      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
        "select",
        {
          id,
          className: "cr-dsh-input cr-dsh-select",
          value,
          disabled: selectDisabled,
          "aria-invalid": error === null ? void 0 : true,
          "aria-busy": loading || void 0,
          onChange: (event) => onChange(event.target.value),
          children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("option", { value: option.value, children: option.label }, option.value))
        }
      ),
      error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
        "button",
        {
          type: "button",
          className: "cr-dsh-retry",
          disabled,
          title: `Could not load branches: ${error}`,
          onClick: () => {
            setFailure(null);
            setRetryKey((current) => current + 1);
          },
          children: "Retry"
        }
      )
    ] })
  ] });
}
function SettingsSection({ client }) {
  const scopeRef = (0, import_react35.useRef)(null);
  const portalRef = (0, import_react35.useRef)(null);
  const activeClient = (0, import_react35.useMemo)(
    () => client ?? createApiClient({ baseUrl: "/api/code-review" }),
    [client]
  );
  const [drafts, setDrafts] = (0, import_react35.useState)([]);
  const [errors, setErrors] = (0, import_react35.useState)({});
  const [loadError, setLoadError] = (0, import_react35.useState)(null);
  const [saveError, setSaveError] = (0, import_react35.useState)(null);
  const [notice, setNotice] = (0, import_react35.useState)(null);
  const [loading, setLoading] = (0, import_react35.useState)(true);
  const [saving, setSaving] = (0, import_react35.useState)(false);
  const [reloadKey, setReloadKey] = (0, import_react35.useState)(0);
  const [picker, setPicker] = (0, import_react35.useState)(null);
  const nextKeyRef = (0, import_react35.useRef)(1);
  const savingRef = (0, import_react35.useRef)(false);
  function nextKey() {
    const key = nextKeyRef.current;
    nextKeyRef.current += 1;
    return key;
  }
  (0, import_react35.useEffect)(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void activeClient.listRepositories().then((result) => {
      if (controller.signal.aborted) return;
      nextKeyRef.current = result.repositories.length + 1;
      setDrafts(
        result.repositories.map((repository, index) => ({
          ...repository,
          key: index + 1
        }))
      );
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load repositories.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [activeClient, reloadKey]);
  function update(key, patch) {
    setDrafts(
      (current) => current.map((draft) => {
        if (draft.key !== key) return draft;
        const pathChanged = patch.path !== void 0 && patch.path !== draft.path;
        return {
          ...draft,
          ...patch,
          ...pathChanged ? { defaultTarget: "" } : {}
        };
      })
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }
  function addRepository() {
    setDrafts((current) => [...current, { key: nextKey(), name: "", path: "", defaultTarget: "" }]);
    setNotice(null);
  }
  function chooseFolder(path, name) {
    if (picker === null) return;
    const key = picker.key;
    setPicker(null);
    setDrafts(
      (current) => current.map(
        (draft) => draft.key === key ? {
          ...draft,
          path,
          ...path === draft.path ? {} : { defaultTarget: "" },
          name: draft.name.trim() === "" ? name : draft.name
        } : draft
      )
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }
  function removeRepository(key) {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }
  async function save() {
    if (savingRef.current) return;
    const nextErrors = {};
    for (const draft of drafts) {
      const draftErrors = {};
      if (draft.name.trim() === "") draftErrors.name = "Repository name is required.";
      if (draft.path.trim() === "") draftErrors.path = "Repository path is required.";
      if (Object.keys(draftErrors).length > 0) nextErrors[draft.key] = draftErrors;
    }
    setErrors(nextErrors);
    setSaveError(null);
    setNotice(null);
    if (Object.keys(nextErrors).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await activeClient.saveRepositories(
        drafts.map((draft) => ({
          name: draft.name.trim(),
          path: draft.path.trim(),
          ...draft.defaultTarget === void 0 || draft.defaultTarget.trim() === "" ? {} : { defaultTarget: draft.defaultTarget.trim() }
        }))
      );
      setDrafts(
        result.repositories.map((repository, index) => ({
          ...repository,
          key: index + 1
        }))
      );
      nextKeyRef.current = result.repositories.length + 1;
      setNotice("Repository settings saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save repository settings.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const saveDisabled = loading || saving || loadError !== null;
  return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
    "div",
    {
      ref: scopeRef,
      className: "cr-native-scope cr-dsh-settings-scope",
      "data-theme": readHostTheme2(),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(ErrorBoundary, { title: "Could not load repository settings", children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(ThemeProvider, { initialTheme: readHostTheme2(), persist: false, targetRef: scopeRef, children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(ToastProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(PortalContainerProvider, { container: portalRef, children: [
          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("section", { className: "cr-dsh-settings", "aria-labelledby": "cr-dsh-settings-title", children: [
            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("header", { className: "cr-dsh-settings-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-settings-copy", children: [
                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h2", { id: "cr-dsh-settings-title", children: "Repositories" }),
                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { children: "Local checkouts that reviewd may inspect. Paths resolve on the daemon." })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-dsh-button cr-dsh-button-primary",
                  disabled: saveDisabled,
                  onClick: () => void save(),
                  children: saving ? "Saving\u2026" : "Save"
                }
              )
            ] }),
            loadError !== null ? /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-banner cr-dsh-banner-error", role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("span", { children: [
                "Could not load repositories: ",
                loadError
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                "button",
                {
                  type: "button",
                  className: "cr-dsh-button",
                  onClick: () => setReloadKey((value) => value + 1),
                  children: "Retry"
                }
              )
            ] }) : loading ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "cr-dsh-muted", role: "status", children: "Loading repositories\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
              "form",
              {
                className: "cr-dsh-form",
                noValidate: true,
                onSubmit: (event) => {
                  event.preventDefault();
                  void save();
                },
                children: [
                  saveError !== null ? /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("p", { className: "cr-dsh-banner cr-dsh-banner-error", role: "alert", children: [
                    "Could not save repositories: ",
                    saveError
                  ] }) : null,
                  notice !== null ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "cr-dsh-banner cr-dsh-banner-success", role: "status", children: notice }) : null,
                  drafts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-empty", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { children: "No repositories configured." }),
                    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "cr-dsh-muted", children: "Add a checkout to start reviewing worktrees from it." })
                  ] }) : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("div", { className: "cr-dsh-repos", children: drafts.map((draft, index) => {
                    const draftErrors = errors[draft.key] ?? {};
                    const label = draft.name.trim() || draft.path.trim() || index + 1;
                    return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-repo", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-field", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("label", { className: "cr-dsh-label", htmlFor: `repo-${draft.key}-name`, children: "Name" }),
                        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                          "input",
                          {
                            id: `repo-${draft.key}-name`,
                            className: "cr-dsh-input",
                            value: draft.name,
                            disabled: saving,
                            placeholder: "Checkout",
                            onChange: (event) => update(draft.key, { name: event.target.value }),
                            "aria-invalid": draftErrors.name === void 0 ? void 0 : true,
                            "aria-describedby": draftErrors.name === void 0 ? void 0 : `repo-${draft.key}-name-error`
                          }
                        ),
                        draftErrors.name === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                          "span",
                          {
                            className: "cr-dsh-error",
                            id: `repo-${draft.key}-name-error`,
                            role: "alert",
                            children: draftErrors.name
                          }
                        )
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-field", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("label", { className: "cr-dsh-label", htmlFor: `repo-${draft.key}-path`, children: "Path" }),
                        /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "cr-dsh-inline", children: [
                          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                            "input",
                            {
                              id: `repo-${draft.key}-path`,
                              className: "cr-dsh-input cr-dsh-mono",
                              value: draft.path,
                              disabled: saving,
                              placeholder: "/srv/repos/checkout",
                              autoComplete: "off",
                              spellCheck: false,
                              onChange: (event) => update(draft.key, { path: event.target.value }),
                              "aria-invalid": draftErrors.path === void 0 ? void 0 : true,
                              "aria-describedby": draftErrors.path === void 0 ? void 0 : `repo-${draft.key}-path-error`
                            }
                          ),
                          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                            "button",
                            {
                              type: "button",
                              className: "cr-dsh-icon-button",
                              "aria-label": `Browse folders for repository ${label}`,
                              title: "Browse folders",
                              disabled: saving,
                              onClick: () => setPicker({ key: draft.key, path: draft.path.trim() }),
                              children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(FolderGlyph2, {})
                            }
                          )
                        ] }),
                        draftErrors.path === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                          "span",
                          {
                            className: "cr-dsh-error",
                            id: `repo-${draft.key}-path-error`,
                            role: "alert",
                            children: draftErrors.path
                          }
                        )
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                        NativeBranchSelect,
                        {
                          client: activeClient,
                          id: `repo-${draft.key}-target`,
                          path: draft.path,
                          value: draft.defaultTarget ?? "",
                          disabled: saving,
                          onChange: (value) => update(draft.key, { defaultTarget: value })
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                        "button",
                        {
                          type: "button",
                          className: "cr-dsh-icon-button cr-dsh-remove",
                          "aria-label": `Remove repository ${label}`,
                          title: "Remove repository",
                          disabled: saving,
                          onClick: () => removeRepository(draft.key),
                          children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                            "svg",
                            {
                              width: "14",
                              height: "14",
                              viewBox: "0 0 16 16",
                              fill: "none",
                              "aria-hidden": "true",
                              children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
                                "path",
                                {
                                  d: "m4 4 8 8M12 4l-8 8",
                                  stroke: "currentColor",
                                  strokeWidth: "1.5",
                                  strokeLinecap: "round"
                                }
                              )
                            }
                          )
                        }
                      )
                    ] }, draft.key);
                  }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
                    "button",
                    {
                      type: "button",
                      className: "cr-dsh-add",
                      disabled: saving,
                      onClick: addRepository,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { "aria-hidden": "true", children: "+" }),
                        " Add repository"
                      ]
                    }
                  )
                ]
              }
            )
          ] }),
          picker !== null ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
            NativeFolderPicker,
            {
              client: activeClient,
              initialPath: picker.path === "" ? void 0 : picker.path,
              onClose: () => setPicker(null),
              onSelect: chooseFolder
            },
            picker.key
          ) : null
        ] }) }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("div", { ref: portalRef })
      ]
    }
  );
}

// packages/dsh/src/client.tsx
var import_jsx_runtime43 = require("react/jsx-runtime");
var PANEL_ID = "code-review";
function Icon({ size = 18 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime43.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime43.jsx)("rect", { x: "2", y: "4", width: "20", height: "16", rx: "4", stroke: "currentColor", strokeWidth: "1.6" }),
        /* @__PURE__ */ (0, import_jsx_runtime43.jsx)(
          "path",
          {
            d: "M6 9h9M6 13h12M6 17h6",
            stroke: "currentColor",
            strokeWidth: "1.6",
            strokeLinecap: "round"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime43.jsx)("circle", { cx: "18", cy: "16", r: "4.5", fill: "var(--dsw-alias-state-success-primary, #22c55e)" }),
        /* @__PURE__ */ (0, import_jsx_runtime43.jsx)(
          "path",
          {
            d: "m16.3 16 1.2 1.2 2.2-2.6",
            stroke: "#fff",
            strokeWidth: "1.4",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        )
      ]
    }
  );
}
var inject = ["slots"];
function apply(ctx) {
  ctx.effect?.(() => {
    const style = document.createElement("style");
    style.dataset.reviewdNative = "true";
    style.textContent = "/*\n * Code review design tokens. Dark is the default; light is a derived theme.\n * Every text/border pair used by the UI is checked in tokens.test.ts.\n */\n.cr-native-scope,\n.cr-native-scope[data-theme='dark'],\n.cr-native-scope .theme-dark {\n  color-scheme: dark;\n  --cr-bg: #0d1117;\n  --cr-surface: #161b22;\n  --cr-surface-raised: #21262d;\n  --cr-text: #e6edf3;\n  --cr-text-muted: #9da7b3;\n  --cr-border: #5b6572;\n  --cr-primary: #58a6ff;\n  --cr-on-primary: #08111f;\n  --cr-danger: #ff7b72;\n  --cr-on-danger: #2b0b0b;\n  --cr-warning: #e3b341;\n  --cr-info: #79c0ff;\n  --cr-success: #56d364;\n  --cr-added-bg: #10261a;\n  --cr-removed-bg: #2b1518;\n  --cr-added-accent: #56d364;\n  --cr-removed-accent: #ff7b72;\n  --cr-word-added-bg: #1b4729;\n  --cr-word-removed-bg: #4a2024;\n  --cr-selection: #1f6feb;\n  --cr-on-selection: #ffffff;\n  --cr-selection-bg: #162b45;\n  --cr-selection-accent: #79c0ff;\n  --cr-focus: #58a6ff;\n  --cr-overlay: rgb(3 7 12 / 76%);\n  --cr-shadow: 0 18px 48px rgb(0 0 0 / 42%);\n}\n\n.cr-native-scope[data-theme='light'],\n.cr-native-scope .theme-light {\n  color-scheme: light;\n  /*\n   * The page is deliberately off-white: a pure-white canvas glares when\n   * switching from the dark theme. Cards stay a touch lighter than the page.\n   */\n  --cr-bg: #f4f6f8;\n  --cr-surface: #fbfcfd;\n  --cr-surface-raised: #eaeef2;\n  --cr-text: #1f2328;\n  --cr-text-muted: #57606a;\n  /* Neutral border chosen for a \u22653:1 boundary on both page and surface. */\n  --cr-border: #7d8590;\n  --cr-primary: #0969da;\n  --cr-on-primary: #ffffff;\n  --cr-danger: #b42318;\n  --cr-on-danger: #ffffff;\n  --cr-warning: #7a4d00;\n  --cr-info: #1d4ed8;\n  --cr-success: #116d32;\n  --cr-added-bg: #eaffef;\n  --cr-removed-bg: #ffefed;\n  --cr-added-accent: #116d32;\n  --cr-removed-accent: #b42318;\n  --cr-word-added-bg: #ccffd8;\n  --cr-word-removed-bg: #ffd7d5;\n  --cr-selection: #0969da;\n  --cr-on-selection: #ffffff;\n  --cr-selection-bg: #ddf4ff;\n  --cr-selection-accent: #0969da;\n  --cr-focus: #0969da;\n  --cr-overlay: rgb(31 35 40 / 48%);\n  --cr-shadow: 0 18px 48px rgb(31 35 40 / 18%);\n}\n\n.cr-native-scope {\n  --cr-space-1: 4px;\n  --cr-space-2: 8px;\n  --cr-space-3: 12px;\n  --cr-space-4: 16px;\n  --cr-space-5: 20px;\n  --cr-space-6: 24px;\n  --cr-space-8: 32px;\n  --cr-space-10: 40px;\n  --cr-space-12: 48px;\n  --cr-radius-control: 6px;\n  --cr-radius-card: 10px;\n  --cr-radius-pill: 999px;\n  --cr-font-ui:\n    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,\n    'Helvetica Neue', Arial, sans-serif;\n  --cr-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;\n  --cr-text-body: 16px;\n  --cr-leading-body: 1.5;\n  --cr-text-control: 14px;\n  --cr-leading-control: 1.4;\n  --cr-text-meta: 13px;\n  --cr-text-code: 12.5px;\n  --cr-leading-code: 20px;\n  --cr-motion-press: 120ms;\n  --cr-motion-tabs: 150ms;\n  --cr-motion-collapse: 180ms;\n  --cr-motion-dialog: 240ms;\n  --cr-sidebar: 280px;\n  --cr-rail: 320px;\n  --cr-summary-max-height: clamp(14rem, 40vh, 28rem);\n  --cr-focus-ring: 0 0 0 2px var(--cr-bg), 0 0 0 4px var(--cr-focus);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .cr-native-scope {\n    --cr-motion-press: 0ms;\n    --cr-motion-tabs: 0ms;\n    --cr-motion-collapse: 0ms;\n    --cr-motion-dialog: 0ms;\n  }\n}\n\n.cr-native-scope *,\n.cr-native-scope *::before,\n.cr-native-scope *::after {\n  box-sizing: border-box;\n}\n\n.cr-native-scope {\n  min-height: 100%;\n}\n\n.cr-native-scope {\n  background: var(--cr-bg);\n  color: var(--cr-text);\n  font-family: var(--cr-font-ui);\n  font-size: var(--cr-text-body);\n  line-height: var(--cr-leading-body);\n  -webkit-font-smoothing: antialiased;\n  text-rendering: optimizeLegibility;\n}\n\n.cr-native-scope {\n  margin: 0;\n  background: var(--cr-bg);\n  color: var(--cr-text);\n}\n\n.cr-native-scope button,\n.cr-native-scope input,\n.cr-native-scope textarea,\n.cr-native-scope select {\n  font: inherit;\n  color: inherit;\n}\n\n.cr-native-scope a {\n  color: var(--cr-primary);\n  text-underline-offset: 3px;\n}\n\n.cr-native-scope a:hover {\n  text-decoration-thickness: 2px;\n}\n\n.cr-native-scope :focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: 2px;\n}\n\n.cr-native-scope ::selection {\n  background: var(--cr-selection);\n  color: var(--cr-on-selection);\n}\n\n.cr-native-scope.cr-selecting-lines {\n  cursor: row-resize;\n  user-select: none;\n}\n\n.cr-native-scope .cr-visually-hidden {\n  position: absolute !important;\n  width: 1px !important;\n  height: 1px !important;\n  padding: 0 !important;\n  margin: -1px !important;\n  overflow: hidden !important;\n  clip: rect(0 0 0 0) !important;\n  white-space: nowrap !important;\n  border: 0 !important;\n}\n\n.cr-native-scope .cr-skip-link {\n  position: fixed;\n  z-index: 100;\n  top: 8px;\n  left: 8px;\n  padding: 8px 12px;\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-primary);\n  color: var(--cr-on-primary);\n  transform: translateY(-160%);\n  transition: transform var(--cr-motion-collapse) ease;\n}\n\n.cr-native-scope .cr-skip-link:focus-visible {\n  transform: translateY(0);\n}\n\n.cr-native-scope .cr-mono {\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-code);\n  line-height: var(--cr-leading-code);\n}\n\n.cr-native-scope .cr-meta {\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n  line-height: 1.4;\n}\n\n/* App shell */\n.cr-native-scope .cr-shell {\n  display: grid;\n  grid-template-columns: var(--cr-sidebar) minmax(0, 1fr);\n  min-height: 100vh;\n  background: var(--cr-bg);\n}\n\n.cr-native-scope .cr-sidebar {\n  position: sticky;\n  top: 0;\n  display: flex;\n  flex-direction: column;\n  gap: var(--cr-space-6);\n  height: 100vh;\n  padding: var(--cr-space-5) var(--cr-space-4);\n  border-right: 1px solid var(--cr-border);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-sidebar-head {\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-sidebar-head .cr-brand {\n  min-width: 0;\n  flex: 1 1 auto;\n}\n\n.cr-native-scope .cr-sidebar-toggle {\n  flex: 0 0 40px;\n}\n\n.cr-native-scope .cr-brand {\n  display: flex;\n  align-items: center;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-1) var(--cr-space-2);\n  color: var(--cr-text);\n  text-decoration: none;\n}\n\n.cr-native-scope .cr-brand-mark {\n  display: grid;\n  place-items: center;\n  width: 34px;\n  height: 34px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  color: var(--cr-on-primary);\n  background: var(--cr-primary);\n  font-family: var(--cr-font-mono);\n  font-size: 16px;\n  font-weight: 700;\n  letter-spacing: -0.08em;\n}\n\n.cr-native-scope .cr-brand-copy {\n  display: grid;\n  gap: 1px;\n}\n\n.cr-native-scope .cr-brand-name {\n  font-family: var(--cr-font-mono);\n  font-size: 15px;\n  font-weight: 600;\n  letter-spacing: -0.02em;\n}\n\n.cr-native-scope .cr-brand-sub {\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.cr-native-scope .cr-nav {\n  display: grid;\n  gap: var(--cr-space-1);\n}\n\n.cr-native-scope .cr-nav-label {\n  padding: 0 var(--cr-space-2) var(--cr-space-2);\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.cr-native-scope .cr-nav-link {\n  display: flex;\n  align-items: center;\n  gap: var(--cr-space-3);\n  min-height: 40px;\n  padding: var(--cr-space-2) var(--cr-space-3);\n  border: 1px solid transparent;\n  border-radius: var(--cr-radius-control);\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  font-weight: 500;\n  text-decoration: none;\n  transition:\n    background var(--cr-motion-press) ease,\n    color var(--cr-motion-press) ease;\n}\n\n.cr-native-scope .cr-nav-link:hover {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-nav-link[aria-current='page'] {\n  border-color: var(--cr-border);\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-nav-icon {\n  display: grid;\n  place-items: center;\n  width: 20px;\n  height: 20px;\n  flex: 0 0 20px;\n}\n\n.cr-native-scope .cr-sidebar-footer {\n  display: grid;\n  gap: var(--cr-space-3);\n  margin-top: auto;\n  padding-top: var(--cr-space-4);\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-theme-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-daemon {\n  display: flex;\n  align-items: center;\n  gap: var(--cr-space-2);\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: var(--cr-radius-pill);\n  background: var(--cr-success);\n  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cr-success) 18%, transparent);\n}\n\n.cr-native-scope .cr-main {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-topbar {\n  display: none;\n  align-items: center;\n  gap: var(--cr-space-3);\n  min-height: 56px;\n  padding: var(--cr-space-2) var(--cr-space-4);\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-content {\n  width: 100%;\n  max-width: 1320px;\n  margin: 0 auto;\n  padding: var(--cr-space-8) var(--cr-space-8) var(--cr-space-12);\n}\n\n.cr-native-scope .cr-page-head {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--cr-space-6);\n  margin-bottom: var(--cr-space-6);\n}\n\n.cr-native-scope .cr-eyebrow {\n  margin: 0 0 var(--cr-space-2);\n  color: var(--cr-primary);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.1em;\n  text-transform: uppercase;\n}\n\n.cr-native-scope .cr-page-title {\n  margin: 0;\n  font-size: clamp(26px, 3vw, 34px);\n  font-weight: 650;\n  letter-spacing: -0.035em;\n  line-height: 1.15;\n}\n\n.cr-native-scope .cr-page-sub {\n  max-width: 62ch;\n  margin: var(--cr-space-2) 0 0;\n  color: var(--cr-text-muted);\n  font-size: 15px;\n}\n\n.cr-native-scope .cr-page-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n}\n\n/* Toolbar and table */\n.cr-native-scope .cr-toolbar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-end;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-4);\n  border: 1px solid var(--cr-border);\n  border-bottom: 0;\n  border-radius: var(--cr-radius-card) var(--cr-radius-card) 0 0;\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-toolbar > .cr-field,\n.cr-native-scope .cr-toolbar > .cr-search {\n  flex: 1 1 220px;\n}\n\n.cr-native-scope .cr-search {\n  position: relative;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-search-icon {\n  position: absolute;\n  z-index: 1;\n  top: 50%;\n  left: 11px;\n  color: var(--cr-text-muted);\n  pointer-events: none;\n  transform: translateY(-50%);\n}\n\n.cr-native-scope .cr-search .cr-input {\n  padding-left: 34px;\n}\n\n.cr-native-scope .cr-toolbar > .cr-field-select {\n  flex: 0 1 190px;\n}\n\n.cr-native-scope .cr-list {\n  /* The review list lives directly in the panel flex column; without this it shrinks\n     to the leftover viewport height and clips every row past the first screen. */\n  flex-shrink: 0;\n  overflow: hidden;\n  border: 1px solid var(--cr-border);\n  border-radius: 0 0 var(--cr-radius-card) var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-list-head {\n  display: grid;\n  grid-template-columns: minmax(0, 2.6fr) minmax(90px, 1fr) minmax(80px, 0.7fr) 76px 84px 86px;\n  gap: var(--cr-space-4);\n  padding: var(--cr-space-3) var(--cr-space-4);\n  border-bottom: 1px solid var(--cr-border);\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n/* Repository groups in the reviews list (client-side only). */\n\n.cr-native-scope .cr-review-group {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-review-group + .cr-review-group {\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-review-group-heading {\n  margin: 0;\n  font: inherit;\n}\n\n.cr-native-scope .cr-review-group-toggle {\n  display: flex;\n  width: 100%;\n  min-width: 0;\n  align-items: center;\n  gap: var(--cr-space-2);\n  padding: var(--cr-space-3) var(--cr-space-4);\n  border: 0;\n  background: color-mix(in srgb, var(--cr-surface-raised) 45%, var(--cr-surface));\n  color: var(--cr-text);\n  cursor: pointer;\n  text-align: left;\n}\n\n.cr-native-scope .cr-review-group-toggle:hover {\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-review-group-toggle:focus-visible {\n  outline-offset: -2px;\n}\n\n.cr-native-scope .cr-review-group-chevron {\n  width: 0;\n  height: 0;\n  flex: none;\n  border-top: 5px solid transparent;\n  border-bottom: 5px solid transparent;\n  border-left: 6px solid currentColor;\n  transform: rotate(90deg);\n  transition: transform var(--cr-motion-collapse) ease;\n}\n\n.cr-native-scope .cr-review-group-toggle[aria-expanded='false'] .cr-review-group-chevron {\n  transform: rotate(0deg);\n}\n\n.cr-native-scope .cr-review-group-name {\n  overflow: hidden;\n  min-width: 0;\n  font-size: 14px;\n  font-weight: 600;\n  letter-spacing: -0.01em;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-review-group-path {\n  overflow: hidden;\n  min-width: 0;\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-review-group-count {\n  flex: none;\n  margin-left: auto;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-review-group-rows[hidden] {\n  display: none;\n}\n\n.cr-native-scope .cr-review-row {\n  display: grid;\n  grid-template-columns: minmax(0, 2.6fr) minmax(90px, 1fr) minmax(80px, 0.7fr) 76px 84px 86px;\n  gap: var(--cr-space-4);\n  align-items: center;\n  min-height: 64px;\n  padding: var(--cr-space-3) var(--cr-space-4);\n  border-bottom: 1px solid color-mix(in srgb, var(--cr-border) 55%, transparent);\n  color: var(--cr-text);\n  text-decoration: none;\n  transition: background var(--cr-motion-press) ease;\n}\n\n.cr-native-scope .cr-review-row:last-child {\n  border-bottom: 0;\n}\n\n.cr-native-scope .cr-review-row:hover {\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-review-title {\n  display: block;\n  overflow: hidden;\n  font-size: 15px;\n  font-weight: 600;\n  letter-spacing: -0.01em;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-review-id {\n  display: block;\n  overflow: hidden;\n  margin-top: 3px;\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-scope {\n  display: inline-flex;\n  max-width: 100%;\n  align-items: center;\n  gap: 6px;\n  overflow: hidden;\n  padding: 3px 8px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-pill);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-author {\n  overflow: hidden;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-age {\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-not-fixed {\n  color: var(--cr-warning);\n  font-size: var(--cr-text-meta);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-not-fixed[data-zero='true'] {\n  color: var(--cr-text-muted);\n}\n\n/* Forms */\n.cr-native-scope .cr-form {\n  display: grid;\n  gap: var(--cr-space-5);\n  max-width: 760px;\n}\n\n.cr-native-scope .cr-form-card {\n  display: grid;\n  gap: var(--cr-space-5);\n  padding: var(--cr-space-6);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-form-section {\n  display: grid;\n  gap: var(--cr-space-2);\n  padding-bottom: var(--cr-space-4);\n  border-bottom: 1px solid color-mix(in srgb, var(--cr-border) 55%, transparent);\n}\n\n.cr-native-scope .cr-form-section:last-child {\n  padding-bottom: 0;\n  border-bottom: 0;\n}\n\n.cr-native-scope .cr-form-section-title {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 600;\n}\n\n.cr-native-scope .cr-form-section-copy {\n  margin: 0;\n  color: var(--cr-text-muted);\n  font-size: 14px;\n}\n\n.cr-native-scope .cr-form-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: var(--cr-space-4);\n}\n\n.cr-native-scope .cr-form-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-field {\n  display: grid;\n  align-content: start;\n  gap: 6px;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-label {\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n  font-weight: 550;\n}\n\n.cr-native-scope .cr-hint {\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-error {\n  color: var(--cr-danger);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-input,\n.cr-native-scope .cr-textarea,\n.cr-native-scope .cr-select {\n  width: 100%;\n  min-height: 40px;\n  padding: 8px 10px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n  line-height: var(--cr-leading-control);\n  transition:\n    border-color var(--cr-motion-press) ease,\n    background var(--cr-motion-press) ease;\n}\n\n.cr-native-scope .cr-textarea {\n  min-height: 112px;\n  resize: vertical;\n}\n\n.cr-native-scope .cr-input::placeholder,\n.cr-native-scope .cr-textarea::placeholder {\n  color: var(--cr-text-muted);\n  opacity: 0.8;\n}\n\n.cr-native-scope .cr-input:hover,\n.cr-native-scope .cr-textarea:hover,\n.cr-native-scope .cr-select:hover {\n  border-color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-input:focus-visible,\n.cr-native-scope .cr-textarea:focus-visible,\n.cr-native-scope .cr-select:focus-visible {\n  border-color: var(--cr-primary);\n  outline: 2px solid var(--cr-focus);\n  outline-offset: 2px;\n}\n\n.cr-native-scope .cr-input[aria-invalid='true'],\n.cr-native-scope .cr-textarea[aria-invalid='true'],\n.cr-native-scope .cr-select[aria-invalid='true'] {\n  border-color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-input:disabled,\n.cr-native-scope .cr-textarea:disabled,\n.cr-native-scope .cr-select:disabled {\n  cursor: not-allowed;\n  opacity: 0.55;\n}\n\n.cr-native-scope .cr-select {\n  appearance: none;\n  padding-right: 32px;\n  background-image:\n    linear-gradient(45deg, transparent 50%, currentColor 50%),\n    linear-gradient(135deg, currentColor 50%, transparent 50%);\n  background-position:\n    calc(100% - 16px) 17px,\n    calc(100% - 11px) 17px;\n  background-repeat: no-repeat;\n  background-size: 5px 5px;\n}\n\n/* Buttons */\n.cr-native-scope .cr-button {\n  display: inline-flex;\n  min-height: 40px;\n  align-items: center;\n  justify-content: center;\n  gap: var(--cr-space-2);\n  padding: 8px 14px;\n  border: 1px solid transparent;\n  border-radius: var(--cr-radius-control);\n  font-size: var(--cr-text-control);\n  font-weight: 600;\n  line-height: 1.2;\n  text-decoration: none;\n  cursor: pointer;\n  transition:\n    background var(--cr-motion-press) ease,\n    border-color var(--cr-motion-press) ease,\n    transform var(--cr-motion-press) ease;\n}\n\n.cr-native-scope .cr-button:active:not(:disabled) {\n  transform: translateY(1px);\n}\n\n.cr-native-scope .cr-button:disabled,\n.cr-native-scope .cr-button[aria-disabled='true'] {\n  cursor: not-allowed;\n  opacity: 0.55;\n}\n\n.cr-native-scope .cr-button[data-variant='primary'] {\n  background: var(--cr-primary);\n  color: var(--cr-on-primary);\n}\n\n.cr-native-scope .cr-button[data-variant='primary']:hover:not(:disabled) {\n  background: color-mix(in srgb, var(--cr-primary) 88%, var(--cr-text));\n}\n\n.cr-native-scope .cr-button[data-variant='secondary'] {\n  border-color: var(--cr-border);\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-button[data-variant='secondary']:hover:not(:disabled) {\n  border-color: var(--cr-text-muted);\n  background: color-mix(in srgb, var(--cr-surface-raised) 70%, var(--cr-border));\n}\n\n.cr-native-scope .cr-button[data-variant='ghost'] {\n  background: transparent;\n  color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-button[data-variant='ghost']:hover:not(:disabled) {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-button[data-variant='danger'] {\n  background: var(--cr-danger);\n  color: var(--cr-on-danger);\n}\n\n.cr-native-scope .cr-icon-button {\n  display: inline-grid;\n  width: 40px;\n  height: 40px;\n  flex: 0 0 40px;\n  place-items: center;\n  padding: 0;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: transparent;\n  color: var(--cr-text-muted);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-icon-button:hover:not(:disabled) {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-icon-button:disabled {\n  cursor: not-allowed;\n  opacity: 0.55;\n}\n\n.cr-native-scope .cr-spinner {\n  width: 14px;\n  height: 14px;\n  border: 2px solid currentColor;\n  border-right-color: transparent;\n  border-radius: var(--cr-radius-pill);\n  animation: cr-spin 700ms linear infinite;\n}\n\n@keyframes cr-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n/* Badges, skeleton, empty state */\n.cr-native-scope .cr-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 2px 9px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-pill);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  line-height: 1.6;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-badge[data-tone='success'] {\n  border-color: color-mix(in srgb, var(--cr-success) 45%, var(--cr-border));\n  background: color-mix(in srgb, var(--cr-success) 10%, transparent);\n  color: var(--cr-success);\n}\n\n.cr-native-scope .cr-badge[data-tone='danger'] {\n  border-color: color-mix(in srgb, var(--cr-danger) 45%, var(--cr-border));\n  background: color-mix(in srgb, var(--cr-danger) 10%, transparent);\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-badge[data-tone='warning'] {\n  border-color: color-mix(in srgb, var(--cr-warning) 45%, var(--cr-border));\n  color: var(--cr-warning);\n}\n\n.cr-native-scope .cr-skeleton {\n  display: block;\n  overflow: hidden;\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-surface-raised);\n  position: relative;\n}\n\n.cr-native-scope .cr-skeleton::after {\n  position: absolute;\n  inset: 0;\n  background: linear-gradient(\n    90deg,\n    transparent,\n    color-mix(in srgb, var(--cr-border) 30%, transparent),\n    transparent\n  );\n  animation: cr-shimmer 1200ms ease-in-out infinite;\n  content: '';\n  transform: translateX(-100%);\n}\n\n@keyframes cr-shimmer {\n  to {\n    transform: translateX(100%);\n  }\n}\n\n.cr-native-scope .cr-empty {\n  display: grid;\n  justify-items: center;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-12) var(--cr-space-6);\n  text-align: center;\n}\n\n.cr-native-scope .cr-empty-icon {\n  display: grid;\n  width: 48px;\n  height: 48px;\n  place-items: center;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface-raised);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 20px;\n}\n\n.cr-native-scope .cr-empty-title {\n  margin: 0;\n  font-size: 17px;\n  font-weight: 600;\n}\n\n.cr-native-scope .cr-empty-copy {\n  max-width: 46ch;\n  margin: 0;\n  color: var(--cr-text-muted);\n  font-size: 14px;\n}\n\n.cr-native-scope .cr-error-panel {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-4);\n  border: 1px solid color-mix(in srgb, var(--cr-danger) 45%, var(--cr-border));\n  border-radius: var(--cr-radius-card);\n  background: color-mix(in srgb, var(--cr-danger) 8%, var(--cr-surface));\n}\n\n.cr-native-scope .cr-error-panel strong {\n  display: block;\n  font-size: 14px;\n}\n\n.cr-native-scope .cr-error-panel p {\n  margin: 2px 0 0;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n/* Dialog, tabs, tooltip, toast */\n.cr-native-scope .cr-overlay {\n  position: fixed;\n  z-index: 40;\n  inset: 0;\n  display: grid;\n  place-items: center;\n  padding: var(--cr-space-4);\n  background: var(--cr-overlay);\n  animation: cr-fade var(--cr-motion-dialog) ease both;\n}\n\n.cr-native-scope .cr-dialog {\n  width: min(520px, 100%);\n  max-height: min(80vh, 720px);\n  overflow: auto;\n  overscroll-behavior: contain;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n  box-shadow: var(--cr-shadow);\n  animation: cr-dialog-in var(--cr-motion-dialog) ease both;\n}\n\n.cr-native-scope .cr-dialog-head {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--cr-space-4);\n  padding: var(--cr-space-5) var(--cr-space-5) var(--cr-space-3);\n}\n\n.cr-native-scope .cr-dialog-title {\n  margin: 0;\n  font-size: 18px;\n  font-weight: 650;\n  letter-spacing: -0.02em;\n}\n\n.cr-native-scope .cr-dialog-copy {\n  margin: var(--cr-space-2) 0 0;\n  color: var(--cr-text-muted);\n  font-size: 14px;\n}\n\n.cr-native-scope .cr-dialog-body {\n  display: grid;\n  gap: var(--cr-space-4);\n  padding: 0 var(--cr-space-5) var(--cr-space-5);\n  overscroll-behavior: contain;\n}\n\n.cr-native-scope .cr-dialog-actions {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: var(--cr-space-2);\n  padding-top: var(--cr-space-2);\n}\n\n@keyframes cr-fade {\n  from {\n    opacity: 0;\n  }\n}\n\n@keyframes cr-dialog-in {\n  from {\n    opacity: 0;\n    transform: translateY(8px) scale(0.985);\n  }\n}\n\n.cr-native-scope .cr-tabs {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 2px;\n  border-bottom: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-tab {\n  position: relative;\n  min-height: 40px;\n  padding: 8px 12px;\n  border: 0;\n  border-radius: var(--cr-radius-control) var(--cr-radius-control) 0 0;\n  background: transparent;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  font-weight: 550;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-tab:hover {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-tab[aria-selected='true'] {\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-tab[aria-selected='true']::after {\n  position: absolute;\n  right: 8px;\n  bottom: -1px;\n  left: 8px;\n  height: 2px;\n  background: var(--cr-primary);\n  content: '';\n  transition: transform var(--cr-motion-tabs) ease;\n}\n\n.cr-native-scope .cr-tooltip-wrap {\n  position: relative;\n  display: inline-flex;\n}\n\n.cr-native-scope .cr-tooltip {\n  position: absolute;\n  z-index: 30;\n  bottom: calc(100% + 6px);\n  left: 50%;\n  width: max-content;\n  max-width: 240px;\n  padding: 5px 8px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n  font-size: 12px;\n  line-height: 1.35;\n  opacity: 0;\n  pointer-events: none;\n  transform: translate(-50%, 2px);\n  transition:\n    opacity var(--cr-motion-press) ease,\n    transform var(--cr-motion-press) ease;\n}\n\n.cr-native-scope .cr-tooltip-wrap:hover .cr-tooltip,\n.cr-native-scope .cr-tooltip-wrap:focus-within .cr-tooltip,\n.cr-native-scope .cr-tooltip[data-open='true'] {\n  opacity: 1;\n  transform: translate(-50%, 0);\n}\n\n.cr-native-scope .cr-toast-region {\n  position: fixed;\n  z-index: 60;\n  right: var(--cr-space-4);\n  bottom: var(--cr-space-4);\n  display: grid;\n  width: min(380px, calc(100vw - 32px));\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-toast {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-3) var(--cr-space-4);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface-raised);\n  box-shadow: var(--cr-shadow);\n  font-size: 14px;\n  animation: cr-toast-in var(--cr-motion-dialog) ease both;\n}\n\n.cr-native-scope .cr-toast[data-tone='danger'] {\n  border-color: color-mix(in srgb, var(--cr-danger) 55%, var(--cr-border));\n}\n\n@keyframes cr-toast-in {\n  from {\n    opacity: 0;\n    transform: translateY(8px);\n  }\n}\n\n/* Routes */\n.cr-native-scope .cr-auth-page,\n.cr-native-scope .cr-health-page,\n.cr-native-scope .cr-placeholder {\n  max-width: 720px;\n}\n\n.cr-native-scope .cr-code-block {\n  overflow: auto;\n  max-height: 60vh;\n  margin: 0;\n  padding: var(--cr-space-4);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-code);\n  line-height: var(--cr-leading-code);\n  white-space: pre-wrap;\n}\n\n.cr-native-scope .cr-back {\n  display: inline-flex;\n  min-height: 40px;\n  align-items: center;\n  gap: 6px;\n  color: var(--cr-text-muted);\n  font-size: 14px;\n  text-decoration: none;\n}\n\n.cr-native-scope .cr-back:hover {\n  color: var(--cr-text);\n}\n\n/* Responsive shell */\n.cr-native-scope .cr-menu-button {\n  display: none;\n}\n\n@media (min-width: 1025px) {\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] {\n    --cr-sidebar: 76px;\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-sidebar {\n    align-items: center;\n    padding: var(--cr-space-4) var(--cr-space-1);\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-sidebar-head {\n    flex-direction: column;\n    width: 100%;\n    gap: var(--cr-space-3);\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-sidebar .cr-brand {\n    justify-content: center;\n    padding: 0;\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-sidebar .cr-brand-copy,\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-nav-label,\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-nav-text,\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-theme-label,\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-daemon span {\n    display: none;\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-nav {\n    justify-items: center;\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-nav-link {\n    width: 44px;\n    height: 44px;\n    justify-content: center;\n    padding: 0;\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-sidebar-footer {\n    align-self: stretch;\n    justify-items: center;\n  }\n\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-theme-row,\n  .cr-native-scope .cr-shell[data-sidebar='collapsed'] .cr-daemon {\n    justify-content: center;\n  }\n}\n\n@media (max-width: 1024px) {\n  .cr-native-scope .cr-sidebar-toggle {\n    display: none;\n  }\n\n  .cr-native-scope {\n    --cr-sidebar: 76px;\n  }\n\n  .cr-native-scope .cr-sidebar {\n    align-items: center;\n    padding: var(--cr-space-4) var(--cr-space-2);\n  }\n\n  .cr-native-scope .cr-brand {\n    padding: 0;\n  }\n\n  .cr-native-scope .cr-brand-copy,\n  .cr-native-scope .cr-nav-label,\n  .cr-native-scope .cr-nav-text,\n  .cr-native-scope .cr-sidebar-footer .cr-theme-label,\n  .cr-native-scope .cr-daemon span {\n    display: none;\n  }\n\n  .cr-native-scope .cr-nav-link {\n    width: 44px;\n    height: 44px;\n    justify-content: center;\n    padding: 0;\n  }\n\n  .cr-native-scope .cr-content {\n    padding: var(--cr-space-6) var(--cr-space-6) var(--cr-space-10);\n  }\n}\n\n@media (max-width: 768px) {\n  .cr-native-scope {\n    --cr-sidebar: 0px;\n  }\n\n  .cr-native-scope .cr-shell {\n    display: block;\n  }\n\n  .cr-native-scope .cr-sidebar {\n    position: fixed;\n    z-index: 50;\n    top: 0;\n    bottom: 0;\n    left: 0;\n    width: 280px;\n    height: 100dvh;\n    align-items: stretch;\n    padding: var(--cr-space-5) var(--cr-space-4);\n    border-right: 1px solid var(--cr-border);\n    transform: translateX(-100%);\n    transition: transform var(--cr-motion-collapse) ease;\n  }\n\n  .cr-native-scope .cr-shell[data-drawer='open'] .cr-sidebar {\n    transform: translateX(0);\n  }\n\n  .cr-native-scope .cr-brand-copy,\n  .cr-native-scope .cr-nav-label,\n  .cr-native-scope .cr-nav-text,\n  .cr-native-scope .cr-sidebar-footer .cr-theme-label,\n  .cr-native-scope .cr-daemon span {\n    display: initial;\n  }\n\n  .cr-native-scope .cr-nav-link {\n    width: auto;\n    height: auto;\n    justify-content: flex-start;\n    padding: var(--cr-space-2) var(--cr-space-3);\n  }\n\n  .cr-native-scope .cr-topbar {\n    display: flex;\n    position: sticky;\n    z-index: 20;\n    top: 0;\n  }\n\n  .cr-native-scope .cr-menu-button {\n    display: inline-grid;\n  }\n\n  .cr-native-scope .cr-content {\n    padding: var(--cr-space-5) var(--cr-space-4) var(--cr-space-10);\n  }\n\n  .cr-native-scope .cr-page-head {\n    align-items: stretch;\n    flex-direction: column;\n    gap: var(--cr-space-4);\n  }\n\n  .cr-native-scope .cr-list-head {\n    display: none;\n  }\n\n  .cr-native-scope .cr-review-group-path {\n    display: none;\n  }\n\n  .cr-native-scope .cr-review-row {\n    grid-template-columns: minmax(0, 1fr) auto;\n    gap: var(--cr-space-2) var(--cr-space-3);\n    align-items: start;\n    padding: var(--cr-space-4);\n  }\n\n  .cr-native-scope .cr-review-main {\n    grid-column: 1;\n    grid-row: 1;\n  }\n\n  .cr-native-scope .cr-review-row .cr-author {\n    display: none;\n  }\n\n  .cr-native-scope .cr-review-row .cr-age {\n    grid-column: 1;\n    grid-row: 2;\n  }\n\n  .cr-native-scope .cr-review-row .cr-badge {\n    grid-column: 2;\n    grid-row: 1;\n    justify-self: end;\n  }\n\n  .cr-native-scope .cr-review-row .cr-scope {\n    display: none;\n  }\n\n  .cr-native-scope .cr-review-row .cr-not-fixed {\n    grid-column: 2;\n    grid-row: 2;\n    justify-self: end;\n  }\n\n  .cr-native-scope .cr-form-grid {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-form-card {\n    padding: var(--cr-space-4);\n  }\n}\n\n@media (max-width: 480px) {\n  .cr-native-scope .cr-content {\n    padding: var(--cr-space-4) var(--cr-space-3) var(--cr-space-8);\n  }\n\n  .cr-native-scope .cr-topbar {\n    padding: var(--cr-space-2) var(--cr-space-3);\n  }\n\n  .cr-native-scope .cr-page-title {\n    font-size: 25px;\n  }\n\n  .cr-native-scope .cr-toolbar {\n    flex-direction: column;\n    align-items: stretch;\n  }\n\n  .cr-native-scope .cr-toolbar > .cr-field,\n  .cr-native-scope .cr-toolbar > .cr-search {\n    position: relative;\n    flex: 0 0 auto;\n    min-width: 0;\n  }\n\n  .cr-native-scope .cr-search-icon {\n    position: absolute;\n    z-index: 1;\n    top: 50%;\n    left: 11px;\n    color: var(--cr-text-muted);\n    pointer-events: none;\n    transform: translateY(-50%);\n  }\n\n  .cr-native-scope .cr-search .cr-input {\n    padding-left: 34px;\n  }\n\n  .cr-native-scope .cr-toolbar > .cr-field-select {\n    flex-basis: auto;\n  }\n\n  .cr-native-scope .cr-review-row {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-review-row .cr-badge,\n  .cr-native-scope .cr-review-row .cr-not-fixed {\n    grid-column: 1;\n    justify-self: start;\n  }\n\n  .cr-native-scope .cr-review-row .cr-badge {\n    grid-row: 3;\n  }\n\n  .cr-native-scope .cr-review-row .cr-not-fixed {\n    grid-row: 4;\n  }\n\n  .cr-native-scope .cr-page-actions,\n  .cr-native-scope .cr-form-actions {\n    flex-direction: column;\n    align-items: stretch;\n  }\n\n  .cr-native-scope .cr-page-actions .cr-button,\n  .cr-native-scope .cr-form-actions .cr-button {\n    width: 100%;\n  }\n\n  .cr-native-scope .cr-dialog {\n    max-height: 90vh;\n  }\n}\n\n@media (pointer: coarse) {\n  .cr-native-scope .cr-button,\n  .cr-native-scope .cr-icon-button,\n  .cr-native-scope .cr-nav-link,\n  .cr-native-scope .cr-input,\n  .cr-native-scope .cr-select {\n    min-height: 44px;\n  }\n\n  .cr-native-scope .cr-icon-button {\n    width: 44px;\n    height: 44px;\n    flex-basis: 44px;\n  }\n}\n\n.cr-native-scope .cr-drawer-backdrop {\n  position: fixed;\n  z-index: 45;\n  inset: 0;\n  display: none;\n  border: 0;\n  background: var(--cr-overlay);\n  cursor: default;\n}\n\n@media (max-width: 768px) {\n  .cr-native-scope .cr-shell[data-drawer='open'] .cr-drawer-backdrop {\n    display: block;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .cr-native-scope .cr-skeleton::after,\n  .cr-native-scope .cr-spinner,\n  .cr-native-scope .cr-overlay,\n  .cr-native-scope .cr-dialog,\n  .cr-native-scope .cr-toast,\n  .cr-native-scope .cr-skip-link,\n  .cr-native-scope .cr-review-row,\n  .cr-native-scope .cr-button,\n  .cr-native-scope .cr-nav-link,\n  .cr-native-scope .cr-tab {\n    animation: none;\n    transition: none;\n  }\n}\n\n/* ---------------------------------------------------------------------------\n * Review detail\n * ------------------------------------------------------------------------- */\n\n.cr-native-scope .cr-detail,\n.cr-native-scope .cr-detail-loading,\n.cr-native-scope .cr-detail-error {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-detail-loading {\n  display: grid;\n  gap: var(--cr-space-4);\n}\n\n.cr-native-scope .cr-detail-header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--cr-space-6);\n  margin: var(--cr-space-4) 0 var(--cr-space-6);\n}\n\n.cr-native-scope .cr-detail-heading {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-detail-eyebrow {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  margin-bottom: var(--cr-space-2);\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-eyebrow-dot {\n  width: 3px;\n  height: 3px;\n  border-radius: 999px;\n  background: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-scope-separator {\n  color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-detail-title {\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-detail-scope {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-3);\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-detail-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: flex-end;\n  gap: var(--cr-space-2);\n  flex: 0 0 auto;\n}\n\n.cr-native-scope .cr-round-pills {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  padding: 3px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-pill);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-round-pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-height: 30px;\n  padding: 2px 9px;\n  border: 0;\n  border-radius: var(--cr-radius-pill);\n  background: transparent;\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-round-pill:hover {\n  color: var(--cr-text);\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-round-pill[aria-pressed='true'] {\n  background: var(--cr-primary);\n  color: var(--cr-on-primary);\n}\n\n.cr-native-scope .cr-round-count {\n  display: inline-grid;\n  min-width: 18px;\n  height: 18px;\n  place-items: center;\n  padding: 0 4px;\n  border-radius: 999px;\n  background: color-mix(in srgb, currentColor 16%, transparent);\n  font-family: var(--cr-font-ui);\n  font-size: 10px;\n  font-weight: 700;\n}\n\n.cr-native-scope .cr-banner {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-3);\n  margin-bottom: var(--cr-space-4);\n  padding: var(--cr-space-3) var(--cr-space-4);\n  border: 1px solid color-mix(in srgb, var(--cr-primary) 45%, var(--cr-border));\n  border-radius: var(--cr-radius-card);\n  background: color-mix(in srgb, var(--cr-primary) 10%, var(--cr-surface));\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-detail-grid {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) var(--cr-rail);\n  gap: var(--cr-space-5);\n  align-items: start;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-detail-main {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-detail-grid-wide {\n  grid-template-columns: minmax(0, 1fr);\n}\n\n.cr-native-scope .cr-detail-tabs {\n  display: flex;\n  gap: var(--cr-space-1);\n  overflow-x: auto;\n  border-bottom: 1px solid var(--cr-border);\n  scrollbar-width: thin;\n}\n\n.cr-native-scope .cr-detail-tabs .cr-tab {\n  min-height: 44px;\n  padding: 0 var(--cr-space-3);\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-tab-count {\n  display: inline-grid;\n  min-width: 19px;\n  height: 18px;\n  place-items: center;\n  margin-left: 6px;\n  padding: 0 5px;\n  border-radius: 999px;\n  background: var(--cr-surface-raised);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-ui);\n  font-size: 10px;\n  font-weight: 700;\n}\n\n.cr-native-scope .cr-tab[aria-selected='true'] .cr-tab-count {\n  background: color-mix(in srgb, var(--cr-primary) 18%, transparent);\n  color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-tab-panel {\n  padding-top: var(--cr-space-4);\n  outline: none;\n}\n\n.cr-native-scope .cr-section-head,\n.cr-native-scope .cr-card-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-3);\n  min-width: 0;\n}\n\n.cr-native-scope .cr-section-head {\n  margin-bottom: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-card {\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-card-head {\n  margin-bottom: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-card-title {\n  margin: 0;\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n  font-weight: 650;\n  letter-spacing: -0.01em;\n}\n\n.cr-native-scope .cr-link-button {\n  display: inline-flex;\n  align-items: center;\n  min-height: 28px;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: var(--cr-primary);\n  font: inherit;\n  font-size: var(--cr-text-meta);\n  text-decoration: underline;\n  text-underline-offset: 3px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-link-button:hover {\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-inline-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-notice {\n  margin: var(--cr-space-3) 0 0;\n  padding: var(--cr-space-2) var(--cr-space-3);\n  border-left: 3px solid var(--cr-border);\n  border-radius: 0 var(--cr-radius-control) var(--cr-radius-control) 0;\n  background: var(--cr-surface-raised);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-notice-warning {\n  border-left-color: var(--cr-warning);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-notice-info {\n  border-left-color: var(--cr-primary);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-rail {\n  display: grid;\n  gap: var(--cr-space-3);\n  min-width: 0;\n}\n\n.cr-native-scope .cr-rail-card {\n  padding: var(--cr-space-4);\n}\n\n.cr-native-scope .cr-rail-copy {\n  margin: 0;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-rail-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-3);\n  color: var(--cr-text-muted);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-fix-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 6px;\n}\n\n.cr-native-scope .cr-fix-cell {\n  display: grid;\n  gap: 2px;\n  min-height: 58px;\n  padding: var(--cr-space-2);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n  color: var(--cr-text);\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-fix-cell:hover {\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-fix-cell[aria-pressed='true'] {\n  border-color: var(--cr-primary);\n  box-shadow: inset 0 0 0 1px var(--cr-primary);\n}\n\n.cr-native-scope .cr-fix-cell[data-group='addressed'] .cr-fix-count {\n  color: var(--cr-success);\n}\n\n.cr-native-scope .cr-fix-cell[data-group='not-fixed'] .cr-fix-count {\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-fix-cell[data-group='outdated'] .cr-fix-count {\n  color: var(--cr-warning);\n}\n\n.cr-native-scope .cr-fix-count {\n  font-family: var(--cr-font-mono);\n  font-size: 20px;\n  font-weight: 650;\n  line-height: 1.1;\n}\n\n.cr-native-scope .cr-fix-label {\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  line-height: 1.2;\n}\n\n.cr-native-scope .cr-fix-board .cr-link-button {\n  margin-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-fix-note {\n  margin: var(--cr-space-3) 0 0;\n}\n\n.cr-native-scope .cr-switch-row {\n  display: flex;\n  align-items: flex-start;\n  gap: var(--cr-space-2);\n  min-height: 40px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-switch-row input {\n  width: 18px;\n  height: 18px;\n  margin: 2px 0 0;\n  accent-color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-switch-row > span {\n  display: grid;\n  gap: 2px;\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-delivery-details {\n  margin-top: var(--cr-space-2);\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-delivery-details summary {\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-shortcut-card .cr-link-button {\n  font-family: var(--cr-font-mono);\n  font-size: 16px;\n}\n\n/* Conversations */\n.cr-native-scope .cr-thread-list {\n  display: grid;\n  gap: var(--cr-space-3);\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n/* Quoted code scrolls inside its own block; it must not widen the grid track. */\n.cr-native-scope .cr-thread-list > li {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-thread {\n  min-width: 0;\n  padding: var(--cr-space-3);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-thread-active {\n  border-color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-thread-compact {\n  padding: var(--cr-space-3);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n}\n\n.cr-native-scope .cr-thread-deleted {\n  border-style: dashed;\n  background: var(--cr-bg);\n}\n\n.cr-native-scope .cr-thread-tombstone {\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  font-style: italic;\n}\n\n.cr-native-scope .cr-thread-delete-confirm {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-3);\n  padding-top: var(--cr-space-3);\n  border-top: 1px solid var(--cr-border);\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-thread-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  margin-bottom: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-thread-author {\n  font-size: var(--cr-text-control);\n  font-weight: 650;\n}\n\n.cr-native-scope .cr-avatar {\n  display: grid;\n  width: 24px;\n  height: 24px;\n  place-items: center;\n  border-radius: 999px;\n  background: var(--cr-surface-raised);\n  color: var(--cr-primary);\n  font-size: 11px;\n  font-weight: 700;\n}\n\n.cr-native-scope .cr-anchor-jump {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  max-width: 100%;\n  min-height: 32px;\n  margin-bottom: var(--cr-space-2);\n  padding: 3px 7px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n  color: var(--cr-text-muted);\n  font: inherit;\n  font-size: 12px;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-anchor-jump:hover {\n  color: var(--cr-text);\n  border-color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-anchor-path {\n  overflow: hidden;\n  max-width: 34ch;\n  font-family: var(--cr-font-mono);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-anchor-line {\n  color: var(--cr-primary);\n  font-family: var(--cr-font-mono);\n}\n\n.cr-native-scope .cr-thread-body {\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n  line-height: 1.55;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-quote {\n  overflow: auto;\n  max-height: 220px;\n  margin: var(--cr-space-2) 0;\n  padding: var(--cr-space-2) var(--cr-space-3);\n  border-left: 3px solid var(--cr-border);\n  border-radius: 0 var(--cr-radius-control) var(--cr-radius-control) 0;\n  background: var(--cr-bg);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-code);\n  line-height: var(--cr-leading-code);\n  white-space: pre;\n}\n\n.cr-native-scope .cr-suggestion {\n  margin-top: var(--cr-space-3);\n  padding: var(--cr-space-2);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n}\n\n.cr-native-scope .cr-suggestion-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n  margin-bottom: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-suggestion-label {\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  font-weight: 650;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.cr-native-scope .cr-suggestion-block {\n  overflow: auto;\n  border-radius: var(--cr-radius-control);\n}\n\n.cr-native-scope .cr-suggestion-block + .cr-suggestion-block {\n  margin-top: 6px;\n}\n\n.cr-native-scope .cr-suggestion-block pre {\n  margin: 0;\n  padding: 6px 9px;\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-code);\n  line-height: var(--cr-leading-code);\n  white-space: pre;\n}\n\n.cr-native-scope .cr-suggestion-old {\n  border: 1px solid color-mix(in srgb, var(--cr-danger) 35%, var(--cr-border));\n  background: var(--cr-removed-bg);\n}\n\n.cr-native-scope .cr-suggestion-new {\n  border: 1px solid color-mix(in srgb, var(--cr-success) 35%, var(--cr-border));\n  background: var(--cr-added-bg);\n}\n\n.cr-native-scope .cr-suggestion-caption {\n  display: block;\n  padding: 2px 9px;\n  color: var(--cr-text-muted);\n  font-size: 10px;\n  font-weight: 650;\n  letter-spacing: 0.07em;\n  text-transform: uppercase;\n}\n\n.cr-native-scope .cr-replies {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin: var(--cr-space-3) 0 0;\n  padding: 0 0 0 var(--cr-space-3);\n  border-left: 2px solid var(--cr-border);\n  list-style: none;\n}\n\n.cr-native-scope .cr-reply-head {\n  display: flex;\n  align-items: center;\n  gap: var(--cr-space-2);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-reply-body {\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-thread-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-1);\n  margin-top: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-reply-form {\n  margin-top: var(--cr-space-3);\n  padding-top: var(--cr-space-3);\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-topic-thread {\n  display: grid;\n  gap: var(--cr-space-2);\n  min-width: 0;\n  margin-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-topic-thread-list {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-topic-thread-list > li {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-topic-thread-actions,\n.cr-native-scope .cr-topic-thread-form-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-topic-thread-form {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-1);\n  padding-top: var(--cr-space-2);\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-topic-thread-form .cr-meta {\n  margin: 0;\n}\n\n.cr-native-scope .cr-topic-thread-error {\n  margin: 0;\n  color: var(--cr-danger);\n  font-size: var(--cr-text-meta);\n}\n\n/* Diff */\n.cr-native-scope .cr-diff-layout {\n  display: grid;\n  grid-template-columns: 238px minmax(0, 1fr);\n  gap: var(--cr-space-3);\n  align-items: start;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-file-tree {\n  position: sticky;\n  top: var(--cr-space-4);\n  overflow: auto;\n  max-height: calc(100vh - 80px);\n  padding: var(--cr-space-3);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-file-tree-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-file-tree .cr-field {\n  margin-bottom: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-file-tree-empty {\n  margin: var(--cr-space-2) 0;\n}\n\n.cr-native-scope .cr-tree {\n  display: grid;\n  gap: 2px;\n}\n\n.cr-native-scope .cr-tree-dir {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  width: 100%;\n  min-height: 28px;\n  padding: 2px 4px;\n  border: 0;\n  border-radius: var(--cr-radius-control);\n  background: transparent;\n  color: var(--cr-text-muted);\n  font: inherit;\n  font-size: 11px;\n  font-weight: 650;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-tree-dir:hover {\n  color: var(--cr-text);\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-tree-dir-name {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-tree-file {\n  display: grid;\n  grid-template-columns: 16px minmax(0, 1fr) auto auto auto;\n  gap: 6px;\n  align-items: center;\n  width: 100%;\n  min-height: 30px;\n  padding: 2px 4px 2px 16px;\n  border: 0;\n  border-radius: var(--cr-radius-control);\n  background: transparent;\n  color: var(--cr-text-muted);\n  font: inherit;\n  font-size: 12px;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-tree-file:hover {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-tree-file-active {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n  box-shadow: inset 2px 0 0 var(--cr-primary);\n}\n\n.cr-native-scope .cr-tree-path {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-tree-status {\n  display: grid;\n  width: 15px;\n  height: 15px;\n  place-items: center;\n  border-radius: 3px;\n  font-family: var(--cr-font-mono);\n  font-size: 9px;\n  font-weight: 700;\n}\n\n.cr-native-scope .cr-tree-status-added,\n.cr-native-scope .cr-tree-status-untracked {\n  background: color-mix(in srgb, var(--cr-success) 16%, transparent);\n  color: var(--cr-success);\n}\n\n.cr-native-scope .cr-tree-status-deleted {\n  background: color-mix(in srgb, var(--cr-danger) 16%, transparent);\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-tree-status-renamed {\n  background: color-mix(in srgb, var(--cr-warning) 16%, transparent);\n  color: var(--cr-warning);\n}\n\n.cr-native-scope .cr-tree-status-modified {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-tree-stat {\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 10px;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-diff-main {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-conflict-banner {\n  margin-bottom: var(--cr-space-3);\n  padding: var(--cr-space-3) var(--cr-space-4);\n  border: 1px solid color-mix(in srgb, var(--cr-danger) 35%, var(--cr-border));\n  border-left: 4px solid var(--cr-danger);\n  border-radius: var(--cr-radius-card);\n  background: color-mix(in srgb, var(--cr-danger) 7%, var(--cr-surface));\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-conflict-banner strong {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: var(--cr-space-2);\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-conflict-count {\n  color: var(--cr-danger);\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-meta);\n  font-weight: 500;\n}\n\n.cr-native-scope .cr-conflict-banner p {\n  margin: var(--cr-space-1) 0 var(--cr-space-2);\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-conflict-banner ul {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-1) var(--cr-space-3);\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-conflict-banner li {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-conflict-banner .cr-link-button {\n  max-width: 100%;\n  overflow: hidden;\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-meta);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-tree-status-conflict {\n  background: color-mix(in srgb, var(--cr-danger) 18%, transparent);\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-diff-toolbar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-3);\n  margin-bottom: var(--cr-space-3);\n  padding: var(--cr-space-2);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-diff-delta-note {\n  display: inline-flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 2px 6px;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n/* Full-file preview */\n\n.cr-native-scope .cr-dialog:has(.cr-file-view) {\n  display: flex;\n  width: min(1080px, 100%);\n  max-height: min(88vh, 900px);\n  flex-direction: column;\n  overflow: hidden;\n}\n\n.cr-native-scope .cr-dialog:has(.cr-file-view) .cr-dialog-head {\n  flex: 0 0 auto;\n}\n\n.cr-native-scope .cr-dialog:has(.cr-file-view) .cr-dialog-body {\n  min-height: 0;\n  overflow: auto;\n  overscroll-behavior: contain;\n}\n\n.cr-native-scope .cr-file-view {\n  display: grid;\n  min-width: 0;\n  gap: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-file-view > .cr-segmented {\n  justify-self: start;\n}\n\n.cr-native-scope .cr-full-file {\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-code);\n  line-height: var(--cr-leading-code);\n}\n\n.cr-native-scope .cr-full-file-head,\n.cr-native-scope .cr-full-file-line {\n  display: grid;\n  grid-template-columns: 58px 20px minmax(0, 1fr) 26px;\n  min-width: 0;\n  align-items: stretch;\n}\n\n.cr-native-scope .cr-full-file-head {\n  position: sticky;\n  z-index: 1;\n  top: 0;\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-surface);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-sans);\n  font-size: 10px;\n  font-weight: 650;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.cr-native-scope .cr-full-file-head > * {\n  padding: 6px 8px;\n}\n\n.cr-native-scope .cr-full-file-line {\n  min-height: 20px;\n  color: var(--cr-text);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-full-file-line:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: -2px;\n}\n\n.cr-native-scope .cr-full-file-line-selected {\n  background: color-mix(in srgb, var(--cr-primary) 18%, var(--cr-bg));\n}\n\n.cr-native-scope .cr-full-file-block + .cr-full-file-block .cr-full-file-line {\n  border-top: 1px solid color-mix(in srgb, var(--cr-border) 45%, transparent);\n}\n\n.cr-native-scope .cr-full-file-toolbar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-full-file-toolbar .cr-meta {\n  margin: 0;\n}\n\n.cr-native-scope .cr-full-file-thread-cell,\n.cr-native-scope .cr-full-file-composer-cell {\n  padding: var(--cr-space-2);\n  border-top: 1px solid var(--cr-border);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-full-file-thread-cell .cr-thread + .cr-thread {\n  margin-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-full-file-composer-cell {\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-full-file-finding {\n  display: block;\n  font-family: var(--cr-font-ui);\n}\n\n.cr-native-scope .cr-full-file-finding .cr-inline-finding {\n  margin: 0;\n}\n\n.cr-native-scope .cr-full-file-finding .cr-inline-finding-head strong,\n.cr-native-scope .cr-full-file-finding .cr-inline-finding-rationale {\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-full-file-question {\n  display: block;\n  font-family: var(--cr-font-ui);\n}\n\n.cr-native-scope .cr-full-file-question .cr-inline-question {\n  margin: 0;\n}\n\n.cr-native-scope .cr-full-file-line-add {\n  background: var(--cr-added-bg);\n}\n\n.cr-native-scope .cr-full-file-line-del {\n  background: var(--cr-removed-bg);\n}\n\n.cr-native-scope .cr-full-file-no {\n  padding: 0 7px 0 3px;\n  border-right: 1px solid var(--cr-border);\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  text-align: right;\n  user-select: none;\n}\n\n.cr-native-scope .cr-full-file-marker {\n  color: var(--cr-text-muted);\n  text-align: center;\n  user-select: none;\n}\n\n.cr-native-scope .cr-full-file-line-add .cr-full-file-marker {\n  color: var(--cr-success);\n}\n\n.cr-native-scope .cr-full-file-line-del .cr-full-file-marker {\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-full-file-code {\n  margin: 0;\n  padding: 0 10px;\n  overflow-wrap: anywhere;\n  tab-size: 2;\n  white-space: pre-wrap;\n}\n\n.cr-native-scope .cr-full-file-actions-cell {\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  justify-content: center;\n}\n\n.cr-native-scope .cr-full-file-comment {\n  display: none;\n  width: 20px;\n  min-height: 18px;\n  padding: 0;\n  border: 0;\n  border-radius: 3px;\n  background: var(--cr-surface-raised);\n  color: var(--cr-primary);\n  font: inherit;\n  font-weight: 700;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-full-file-line:hover .cr-full-file-comment,\n.cr-native-scope .cr-full-file-line:focus-within .cr-full-file-comment,\n.cr-native-scope .cr-full-file-line-selected .cr-full-file-comment {\n  display: inline-block;\n}\n\n@media (pointer: coarse) {\n  .cr-native-scope .cr-full-file-head,\n  .cr-native-scope .cr-full-file-line {\n    grid-template-columns: 58px 20px minmax(0, 1fr) 40px;\n  }\n\n  .cr-native-scope .cr-full-file-comment {\n    display: inline-block;\n    width: 36px;\n    min-height: 36px;\n  }\n}\n\n.cr-native-scope .cr-full-file-more {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-segmented {\n  display: inline-flex;\n  padding: 2px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n}\n\n.cr-native-scope .cr-segmented-button {\n  min-height: 30px;\n  padding: 2px 9px;\n  border: 0;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--cr-text-muted);\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-segmented-button:hover:not(:disabled) {\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-segmented-button[aria-pressed='true'] {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-segmented-button:disabled {\n  opacity: 0.45;\n  cursor: not-allowed;\n}\n\n.cr-native-scope .cr-diff-count,\n.cr-native-scope .cr-diff-scope-note {\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-shortcut-hint {\n  margin-left: auto;\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-mobile-file-select {\n  display: none;\n}\n\n.cr-native-scope .cr-diff-files {\n  display: grid;\n  gap: var(--cr-space-3);\n  min-width: 0;\n}\n\n.cr-native-scope .cr-diff-file {\n  overflow: hidden;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-diff-file-active {\n  border-color: color-mix(in srgb, var(--cr-primary) 55%, var(--cr-border));\n}\n\n.cr-native-scope .cr-diff-file-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  min-height: 42px;\n  padding: var(--cr-space-1) var(--cr-space-2);\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-diff-full-file {\n  flex: 0 0 auto;\n}\n\n.cr-native-scope .cr-diff-collapse {\n  display: grid;\n  width: 26px;\n  height: 26px;\n  place-items: center;\n  border: 0;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--cr-text-muted);\n  font-size: 16px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-diff-collapse:hover {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-diff-path {\n  display: flex;\n  min-width: 0;\n  flex: 1 1 260px;\n  align-items: center;\n  gap: var(--cr-space-2);\n  padding: 2px 0;\n  border: 0;\n  background: transparent;\n  color: var(--cr-text);\n  font-family: var(--cr-font-mono);\n  font-size: 12px;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-diff-path:hover .cr-diff-path-text {\n  text-decoration: underline;\n  text-underline-offset: 3px;\n}\n\n.cr-native-scope .cr-diff-path-text {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-diff-stat {\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-diff-stat-add {\n  color: var(--cr-success);\n}\n\n.cr-native-scope .cr-diff-stat-del {\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-diff-hash {\n  flex: 0 0 auto;\n  margin-left: auto;\n  font-family: var(--cr-font-mono);\n}\n\n.cr-native-scope .cr-diff-body {\n  overflow-x: auto;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-diff-gutter-head {\n  display: grid;\n  grid-template-columns: 48px 48px 20px 22px minmax(0, 1fr);\n  min-width: 560px;\n  padding: 3px var(--cr-space-2);\n  border-bottom: 1px solid var(--cr-border);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 9px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.cr-native-scope .cr-hunk {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n  min-width: 560px;\n  padding: 4px var(--cr-space-2);\n  border-top: 1px solid var(--cr-border);\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-surface-raised);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-hunk-code {\n  color: var(--cr-info);\n}\n\n.cr-native-scope .cr-hunk-header {\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-diff-line {\n  position: relative;\n  display: grid;\n  grid-template-columns: 48px 48px 20px 22px minmax(0, 1fr) auto;\n  align-items: stretch;\n  min-width: 560px;\n  min-height: 20px;\n  color: var(--cr-text);\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-code);\n  line-height: var(--cr-leading-code);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-diff-line:hover {\n  background: color-mix(in srgb, var(--cr-text) 5%, transparent);\n}\n\n.cr-native-scope .cr-diff-line:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: -2px;\n}\n\n.cr-native-scope .cr-diff-line-add {\n  background: var(--cr-added-bg);\n}\n\n.cr-native-scope .cr-diff-line-del {\n  background: var(--cr-removed-bg);\n}\n\n.cr-native-scope .cr-diff-line-selected {\n  box-shadow: inset 2px 0 0 var(--cr-selection-accent);\n}\n\n.cr-native-scope .cr-diff-line-range {\n  background: var(--cr-selection-bg);\n}\n\n.cr-native-scope .cr-diff-line-drag {\n  background: var(--cr-selection-bg);\n  box-shadow: inset 2px 0 0 var(--cr-selection-accent);\n}\n\n.cr-native-scope .cr-diff-line-drag .cr-diff-no {\n  color: var(--cr-selection-accent);\n}\n\n.cr-native-scope .cr-diff-risk-cell {\n  display: grid;\n  place-items: center;\n  align-self: center;\n}\n\n.cr-native-scope .cr-diff-risk-pin {\n  position: relative;\n  display: grid;\n  width: 17px;\n  height: 17px;\n  padding: 0;\n  place-items: center;\n  border: 1px solid currentColor;\n  border-radius: 50%;\n  background: var(--cr-surface);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-ui);\n  font-size: 9px;\n  font-weight: 800;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-diff-risk-pin:hover,\n.cr-native-scope .cr-diff-risk-pin:focus-visible {\n  outline: 2px solid currentColor;\n  outline-offset: 1px;\n}\n\n.cr-native-scope .cr-diff-risk-pin.cr-risk-blocker {\n  background: var(--cr-danger);\n  color: var(--cr-on-danger);\n  border-color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-diff-risk-pin.cr-risk-major {\n  background: var(--cr-warning);\n  color: var(--cr-bg);\n  border-color: var(--cr-warning);\n}\n\n.cr-native-scope .cr-diff-risk-pin.cr-risk-minor {\n  background: var(--cr-info);\n  color: var(--cr-bg);\n  border-color: var(--cr-info);\n}\n\n.cr-native-scope .cr-diff-risk-pin.cr-risk-nit {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-diff-line-commented .cr-diff-comment-count {\n  display: inline-grid;\n}\n\n.cr-native-scope .cr-diff-no {\n  padding: 0 7px 0 3px;\n  border-right: 1px solid var(--cr-border);\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  text-align: right;\n  user-select: none;\n}\n\n.cr-native-scope .cr-diff-marker {\n  color: var(--cr-text-muted);\n  text-align: center;\n  user-select: none;\n}\n\n.cr-native-scope .cr-diff-line-add .cr-diff-marker {\n  color: var(--cr-success);\n}\n\n.cr-native-scope .cr-diff-line-del .cr-diff-marker {\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-diff-text {\n  overflow: visible;\n  padding-right: var(--cr-space-2);\n  font-family: inherit;\n  white-space: pre;\n}\n\n.cr-native-scope .cr-diff-wrap .cr-diff-line,\n.cr-native-scope .cr-diff-wrap .cr-diff-gutter-head,\n.cr-native-scope .cr-diff-wrap .cr-hunk {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-diff-wrap .cr-diff-text {\n  min-width: 0;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-diff-wrap .cr-diff-body {\n  overflow-x: hidden;\n}\n\n.cr-native-scope .cr-diff-wrap .cr-quote,\n.cr-native-scope .cr-diff-wrap .cr-thread-body,\n.cr-native-scope .cr-diff-wrap .cr-reply-body {\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-diff-actions-cell {\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 3px;\n}\n\n.cr-native-scope .cr-diff-comment {\n  display: none;\n  width: 24px;\n  min-height: 20px;\n  padding: 0;\n  border: 0;\n  border-radius: 3px;\n  background: var(--cr-surface-raised);\n  color: var(--cr-primary);\n  font: inherit;\n  font-weight: 700;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-diff-line:hover .cr-diff-comment,\n.cr-native-scope .cr-diff-line:focus-within .cr-diff-comment,\n.cr-native-scope .cr-diff-line-selected .cr-diff-comment {\n  display: inline-block;\n}\n\n.cr-native-scope .cr-diff-comment-count {\n  display: none;\n  min-width: 18px;\n  height: 18px;\n  place-items: center;\n  align-self: center;\n  margin-right: 4px;\n  border-radius: 999px;\n  background: var(--cr-primary);\n  color: var(--cr-on-primary);\n  font-family: var(--cr-font-ui);\n  font-size: 10px;\n  font-weight: 700;\n}\n\n.cr-native-scope .cr-diff-line-commented .cr-diff-comment-count {\n  display: inline-grid;\n}\n\n.cr-native-scope .cr-inline-thread {\n  display: grid;\n  gap: var(--cr-space-2);\n  min-width: 0;\n  padding: var(--cr-space-2) var(--cr-space-3);\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-bg);\n}\n\n.cr-native-scope .cr-inline-composer {\n  min-width: 0;\n  padding: var(--cr-space-2) var(--cr-space-3) var(--cr-space-3);\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-bg);\n}\n\n.cr-native-scope .cr-inline-finding-row {\n  display: block;\n}\n\n.cr-native-scope .cr-inline-question-row {\n  display: block;\n}\n\n.cr-native-scope .cr-inline-thread-cell {\n  display: grid;\n  gap: var(--cr-space-2);\n  min-width: 0;\n}\n\n.cr-native-scope .cr-inline-finding {\n  display: block;\n  min-width: 0;\n  margin: 0;\n  padding: 0;\n  border: 0;\n  border-block: 1px solid var(--cr-border);\n  border-left: 2px solid var(--cr-warning);\n  border-radius: 0;\n  background: var(--cr-surface);\n  color: var(--cr-text);\n  font-family: var(--cr-font-ui);\n}\n\n.cr-native-scope .cr-inline-finding.cr-risk-blocker {\n  border-left-color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-inline-finding.cr-risk-minor {\n  border-left-color: var(--cr-info);\n}\n\n.cr-native-scope .cr-inline-finding.cr-risk-nit {\n  border-left-color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-inline-finding-header {\n  display: grid;\n  width: 100%;\n  min-width: 0;\n  grid-template-columns: 14px 22px minmax(0, 1fr);\n  align-items: start;\n  gap: var(--cr-space-2);\n  margin: 0;\n  padding: 5px 10px 6px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-inline-finding-header:hover {\n  background: color-mix(in srgb, var(--cr-text) 4%, transparent);\n}\n\n.cr-native-scope .cr-inline-finding-header:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: -2px;\n}\n\n.cr-native-scope .cr-inline-finding-toggle {\n  display: grid;\n  width: 14px;\n  height: 20px;\n  place-items: center;\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  line-height: 1;\n}\n\n.cr-native-scope .cr-inline-finding-severity {\n  display: grid;\n  width: 22px;\n  height: 22px;\n  place-items: center;\n  border-radius: 50%;\n  background: var(--cr-warning);\n  color: var(--cr-bg);\n  font-size: 10px;\n  font-weight: 800;\n  line-height: 1;\n}\n\n.cr-native-scope .cr-inline-finding.cr-risk-blocker .cr-inline-finding-severity {\n  background: var(--cr-danger);\n  color: var(--cr-on-danger);\n}\n\n.cr-native-scope .cr-inline-finding.cr-risk-minor .cr-inline-finding-severity {\n  background: var(--cr-info);\n  color: var(--cr-bg);\n}\n\n.cr-native-scope .cr-inline-finding.cr-risk-nit .cr-inline-finding-severity {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-inline-finding-main {\n  display: grid;\n  gap: 0;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-inline-finding-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-inline-finding-head strong {\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-inline-finding-body {\n  padding: 0 10px 7px 62px;\n}\n\n.cr-native-scope .cr-inline-finding-rationale {\n  margin: 0;\n  color: var(--cr-text);\n  font-size: var(--cr-text-meta);\n  line-height: 1.5;\n}\n\n.cr-native-scope .cr-inline-finding-details {\n  min-width: 0;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-inline-finding-details summary {\n  width: fit-content;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-inline-finding-evidence,\n.cr-native-scope .cr-inline-finding-suggestion pre {\n  max-width: 100%;\n  margin: var(--cr-space-2) 0 0;\n  overflow-x: auto;\n  padding: var(--cr-space-2);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n  color: var(--cr-text);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n  line-height: 1.45;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-inline-finding-suggestion {\n  margin-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-inline-finding-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-inline-question {\n  display: block;\n  width: 100%;\n  min-width: 0;\n  margin: 0;\n  padding: 5px 10px 6px;\n  border: 0;\n  border-block: 1px solid var(--cr-border);\n  border-left: 2px solid color-mix(in srgb, var(--cr-info) 70%, var(--cr-border));\n  border-radius: 0;\n  background: var(--cr-surface);\n  color: var(--cr-text);\n  font-family: var(--cr-font-ui);\n}\n\n.cr-native-scope .cr-inline-question-row {\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  gap: 8px;\n}\n\n.cr-native-scope .cr-inline-question-header {\n  display: grid;\n  flex: 1;\n  min-width: 0;\n  grid-template-columns: 14px 18px minmax(0, 1fr);\n  align-items: center;\n  gap: 8px;\n  margin: 0;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-inline-question-header:hover {\n  background: color-mix(in srgb, var(--cr-text) 4%, transparent);\n}\n\n.cr-native-scope .cr-inline-question-header:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: -2px;\n}\n\n.cr-native-scope .cr-inline-question-mark {\n  display: grid;\n  width: 18px;\n  height: 18px;\n  place-items: center;\n  border: 1px solid color-mix(in srgb, var(--cr-info) 45%, var(--cr-border));\n  border-radius: 50%;\n  background: color-mix(in srgb, var(--cr-info) 12%, var(--cr-surface));\n  color: color-mix(in srgb, var(--cr-info) 82%, var(--cr-text));\n  font-family: var(--cr-font-ui);\n  font-size: 11px;\n  font-weight: 800;\n  line-height: 1;\n}\n\n.cr-native-scope .cr-inline-question-main {\n  display: grid;\n  gap: 3px;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-inline-question-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-inline-question-head .cr-badge {\n  flex: none;\n}\n\n.cr-native-scope .cr-inline-question-head .cr-meta {\n  margin: 0;\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-inline-question-toggle {\n  display: grid;\n  width: 14px;\n  height: 20px;\n  place-items: center;\n  color: var(--cr-text-muted);\n  font-size: 11px;\n  line-height: 1;\n}\n\n.cr-native-scope .cr-inline-question-cta {\n  min-height: 24px;\n  margin-left: auto;\n  padding: 2px 7px;\n  border: 1px solid color-mix(in srgb, var(--cr-info) 30%, var(--cr-border));\n  border-radius: var(--cr-radius-control);\n  background: color-mix(in srgb, var(--cr-info) 6%, transparent);\n  color: var(--cr-text);\n  font: inherit;\n  font-size: 11px;\n  font-weight: 650;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-inline-question-cta:hover {\n  background: color-mix(in srgb, var(--cr-info) 12%, transparent);\n}\n\n.cr-native-scope .cr-inline-question-cta:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: 2px;\n}\n\n.cr-native-scope .cr-inline-question-text {\n  margin: 0;\n  color: var(--cr-text);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-inline-question-body {\n  display: grid;\n  gap: 4px;\n  min-width: 0;\n  padding: 4px 0 0 48px;\n}\n\n.cr-native-scope .cr-inline-question-why {\n  margin: 0;\n  color: var(--cr-text-muted);\n  font-size: 12px;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-inline-question-why .cr-meta {\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-inline-question .cr-topic-thread {\n  margin-top: 4px;\n  padding-top: 6px;\n  border-top: 1px solid color-mix(in srgb, var(--cr-info) 18%, var(--cr-border));\n}\n\n.cr-native-scope .cr-inline-question .cr-topic-thread-list {\n  gap: 0;\n}\n\n.cr-native-scope .cr-inline-question .cr-topic-thread-list > li + li {\n  border-top: 1px solid color-mix(in srgb, var(--cr-info) 14%, var(--cr-border));\n}\n\n.cr-native-scope .cr-inline-question .cr-thread-compact {\n  padding: 7px 0;\n  border: 0;\n  border-radius: 0;\n  background: transparent;\n}\n\n.cr-native-scope .cr-inline-question .cr-thread-actions {\n  margin-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-inline-question .cr-reply-form {\n  margin-top: var(--cr-space-2);\n  padding-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-finding-decision {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-3);\n  padding-top: var(--cr-space-3);\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-finding-decision-status {\n  display: flex;\n  flex: 1 1 220px;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  min-width: 0;\n}\n\n.cr-native-scope .cr-finding-decision-note {\n  flex: 1 1 100%;\n  margin: 0;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-finding-decision-note-label {\n  color: var(--cr-text);\n  font-weight: 600;\n}\n\n.cr-native-scope .cr-finding-decision-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-finding-decision .cr-button[aria-pressed='true'] {\n  border-color: var(--cr-primary);\n  color: var(--cr-primary);\n  box-shadow: inset 0 0 0 1px var(--cr-primary);\n}\n\n.cr-native-scope .cr-finding-decision-editor {\n  display: grid;\n  flex: 1 1 100%;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-finding-decision-editor .cr-field {\n  margin: 0;\n}\n\n.cr-native-scope .cr-finding-decision-editor .cr-textarea {\n  min-height: 84px;\n}\n\n.cr-native-scope .cr-finding-decision-editor-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-finding-decision-error {\n  color: var(--cr-danger);\n  font-size: var(--cr-text-meta);\n  margin: 0;\n}\n\n.cr-native-scope .cr-diff-empty,\n.cr-native-scope .cr-diff-placeholder,\n.cr-native-scope .cr-diff-more,\n.cr-native-scope .cr-diff-loading {\n  padding: var(--cr-space-4);\n}\n\n.cr-native-scope .cr-diff-empty {\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-diff-placeholder {\n  display: grid;\n  gap: 6px;\n}\n\n.cr-native-scope .cr-diff-more {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-3);\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-diff-loading {\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n/* Composer */\n.cr-native-scope .cr-composer {\n  padding: var(--cr-space-3);\n  border: 1px solid var(--cr-primary);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-composer-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n  margin-bottom: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-composer-title {\n  font-size: var(--cr-text-control);\n  font-weight: 650;\n}\n\n.cr-native-scope .cr-composer-range {\n  display: grid;\n  grid-template-columns: minmax(0, 120px) minmax(0, 120px);\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-draft-note {\n  margin: 0 0 var(--cr-space-2);\n  padding: 8px 10px;\n  border: 1px solid color-mix(in srgb, var(--cr-info) 35%, var(--cr-border));\n  border-radius: var(--cr-radius-control);\n  background: color-mix(in srgb, var(--cr-info) 8%, var(--cr-surface));\n  color: var(--cr-text-muted);\n  font-size: 12px;\n  line-height: 1.45;\n}\n\n.cr-native-scope .cr-composer-suggestion {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-2);\n  padding-top: var(--cr-space-2);\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-suggestion-preview {\n  display: grid;\n  gap: 6px;\n}\n\n.cr-native-scope .cr-composer-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-composer-actions .cr-meta {\n  margin-left: auto;\n}\n\n.cr-native-scope .cr-check {\n  display: flex;\n  align-items: center;\n  gap: var(--cr-space-2);\n  min-height: 36px;\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-check input {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--cr-primary);\n}\n\n/* Report and signals */\n.cr-native-scope .cr-report {\n  display: grid;\n  gap: var(--cr-space-4);\n}\n\n.cr-native-scope .cr-report-summary {\n  padding: var(--cr-space-4);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-report-summary-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-report-copy {\n  margin: var(--cr-space-3) 0;\n  color: var(--cr-text);\n  font-size: var(--cr-text-body);\n  line-height: 1.55;\n  white-space: pre-wrap;\n}\n\n.cr-native-scope .cr-report-copy,\n.cr-native-scope .cr-rail-copy {\n  max-height: var(--cr-summary-max-height);\n  padding-right: var(--cr-space-2);\n  overflow-y: auto;\n  overflow-wrap: anywhere;\n  overscroll-behavior: contain;\n  scrollbar-gutter: stable;\n  scrollbar-width: thin;\n}\n\n.cr-native-scope .cr-report-transferred {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  margin: 0 0 var(--cr-space-3);\n}\n\n.cr-native-scope .cr-report-counts {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-report-warnings,\n.cr-native-scope .cr-report-warnings li {\n  margin: var(--cr-space-2) 0 0;\n  padding-left: var(--cr-space-4);\n  color: var(--cr-warning);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-report-toolbar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-end;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-report-toolbar .cr-field {\n  width: 170px;\n}\n\n.cr-native-scope .cr-multi-select {\n  position: relative;\n  display: grid;\n  gap: 6px;\n  width: 170px;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-multi-select-trigger {\n  display: flex;\n  width: 100%;\n  min-height: 44px;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n  padding: 8px 10px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n  line-height: var(--cr-leading-control);\n  text-align: left;\n  cursor: pointer;\n  transition:\n    border-color var(--cr-motion-press) ease,\n    background var(--cr-motion-press) ease;\n}\n\n.cr-native-scope .cr-multi-select-trigger:hover {\n  border-color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-multi-select-trigger:focus-visible {\n  border-color: var(--cr-primary);\n  outline: 2px solid var(--cr-focus);\n  outline-offset: 2px;\n}\n\n.cr-native-scope .cr-multi-select-trigger[aria-expanded='true'] {\n  border-color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-multi-select-trigger:disabled {\n  cursor: not-allowed;\n  opacity: 0.55;\n}\n\n.cr-native-scope .cr-multi-select-trigger > span:first-child {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-multi-select-chevron {\n  flex: none;\n  color: var(--cr-text-muted);\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-multi-select-menu {\n  position: absolute;\n  z-index: 20;\n  top: calc(100% + 4px);\n  left: 0;\n  display: none;\n  width: max(100%, 220px);\n  max-height: 300px;\n  overflow: auto;\n  padding: 6px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n  box-shadow: var(--cr-shadow);\n}\n\n.cr-native-scope .cr-multi-select[data-open] .cr-multi-select-menu {\n  display: grid;\n  gap: 1px;\n}\n\n.cr-native-scope .cr-multi-select-option {\n  min-height: 40px;\n  padding: 4px 8px;\n  border-radius: var(--cr-radius-control);\n}\n\n.cr-native-scope .cr-multi-select-option:hover {\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-report-selection {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-2);\n  padding: var(--cr-space-2) var(--cr-space-3);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-report-select-all {\n  margin-right: var(--cr-space-1);\n}\n\n.cr-native-scope .cr-report-bulk-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n  margin-left: auto;\n}\n\n@media (max-width: 720px) {\n  .cr-native-scope .cr-report-bulk-actions {\n    width: 100%;\n    margin-left: 0;\n  }\n}\n\n.cr-native-scope .cr-findings {\n  display: grid;\n  gap: var(--cr-space-3);\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-report-browser {\n  min-width: 0;\n  overflow: hidden;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-report-tabs > .cr-tabs {\n  padding: 0 var(--cr-space-4);\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-report-tabs > [role='tabpanel'] {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-report-issues {\n  display: grid;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-4);\n}\n\n.cr-native-scope .cr-report-questions {\n  display: grid;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-4);\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-report-scroll {\n  height: clamp(20rem, 58vh, 46rem);\n  padding: var(--cr-space-4);\n  overflow-x: hidden;\n  overflow-y: auto;\n  border-block: 1px solid var(--cr-border);\n  overscroll-behavior: contain;\n  scrollbar-gutter: stable;\n  scrollbar-width: thin;\n}\n\n.cr-native-scope .cr-report-scroll .cr-findings,\n.cr-native-scope .cr-report-scroll .cr-question-list {\n  margin: 0;\n  padding: 0;\n}\n\n.cr-native-scope .cr-report-pagination {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n  padding-block: var(--cr-space-1);\n}\n\n.cr-native-scope .cr-report-pagination-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-finding {\n  min-width: 0;\n  max-width: 100%;\n  padding: var(--cr-space-4);\n  overflow-wrap: anywhere;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-finding-collapsed {\n  padding-block: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-finding-collapsed .cr-finding-head {\n  margin-bottom: var(--cr-space-1);\n}\n\n.cr-native-scope .cr-finding-collapsed .cr-finding-title {\n  margin-bottom: 0;\n}\n\n.cr-native-scope .cr-finding-toggle {\n  display: grid;\n  width: 16px;\n  height: 20px;\n  padding: 0;\n  place-items: center;\n  border: 0;\n  background: transparent;\n  color: var(--cr-text-muted);\n  font: inherit;\n  font-size: 11px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-finding-toggle:hover,\n.cr-native-scope .cr-finding-toggle:focus-visible {\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-finding-toggle:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: 1px;\n}\n\n.cr-native-scope .cr-finding-body {\n  display: grid;\n  gap: var(--cr-space-2);\n  min-width: 0;\n}\n\n.cr-native-scope .cr-finding-item {\n  min-width: 0;\n  max-width: 100%;\n  list-style: none;\n}\n\n.cr-native-scope .cr-finding-item:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: 2px;\n  border-radius: var(--cr-radius-card);\n}\n\n.cr-native-scope .cr-finding:focus-visible {\n  outline: 2px solid var(--cr-focus);\n  outline-offset: 2px;\n}\n\n.cr-native-scope .cr-finding-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n  min-width: 0;\n  margin-bottom: var(--cr-space-2);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-finding-select {\n  flex: 0 0 auto;\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--cr-primary);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-finding-selected {\n  border-color: var(--cr-primary);\n  box-shadow: inset 0 0 0 1px var(--cr-primary);\n}\n\n.cr-native-scope .cr-finding-location {\n  min-width: 0;\n  padding: 0;\n  overflow-wrap: anywhere;\n  border: 0;\n  background: transparent;\n  color: var(--cr-primary);\n  font-family: var(--cr-font-mono);\n  font-size: 12px;\n  text-decoration: underline;\n  text-underline-offset: 3px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-finding-title {\n  margin: 0 0 var(--cr-space-2);\n  font-size: var(--cr-text-control);\n  font-weight: 650;\n}\n\n.cr-native-scope .cr-finding-copy {\n  margin: 0;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-control);\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-evidence {\n  max-width: 100%;\n  overflow: auto;\n  overflow-wrap: anywhere;\n  max-height: 280px;\n  margin: var(--cr-space-3) 0 0;\n  padding: var(--cr-space-2) var(--cr-space-3);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-bg);\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: var(--cr-text-code);\n  line-height: var(--cr-leading-code);\n  white-space: pre-wrap;\n}\n\n.cr-native-scope .cr-report-section {\n  padding: var(--cr-space-4);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-question-list,\n.cr-native-scope .cr-verification-list,\n.cr-native-scope .cr-test-list {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin: var(--cr-space-3) 0 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-question-list li,\n.cr-native-scope .cr-verification-list li,\n.cr-native-scope .cr-test-list li {\n  display: flex;\n  min-width: 0;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: var(--cr-space-2);\n  padding-bottom: var(--cr-space-2);\n  border-bottom: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-question-list li:last-child,\n.cr-native-scope .cr-verification-list li:last-child,\n.cr-native-scope .cr-test-list li:last-child {\n  border-bottom: 0;\n  padding-bottom: 0;\n}\n\n.cr-native-scope .cr-question-list p {\n  flex-basis: 100%;\n  margin: 0;\n}\n\n.cr-native-scope .cr-question-list > li {\n  align-items: flex-start;\n}\n\n.cr-native-scope .cr-question-list .cr-topic-thread {\n  flex-basis: 100%;\n  width: 100%;\n  margin-top: 6px;\n  padding-top: 8px;\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-finding-item > .cr-topic-thread {\n  margin: 8px var(--cr-space-4) 0;\n  padding-top: 8px;\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-signals {\n  display: grid;\n  gap: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-signals-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-signals-note {\n  margin: 0;\n}\n\n.cr-native-scope .cr-signal-list {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-signal {\n  display: grid;\n  grid-template-columns: 18px minmax(0, 1fr) auto;\n  gap: var(--cr-space-3);\n  align-items: start;\n  padding: var(--cr-space-3);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-card);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-signal[data-tone='danger'] {\n  border-left: 3px solid var(--cr-danger);\n}\n\n.cr-native-scope .cr-signal[data-tone='warning'] {\n  border-left: 3px solid var(--cr-warning);\n}\n\n.cr-native-scope .cr-signal[data-tone='info'] {\n  border-left: 3px solid var(--cr-info);\n}\n\n.cr-native-scope .cr-signal-mark {\n  color: var(--cr-text-muted);\n  font-size: 14px;\n  line-height: 1.3;\n}\n\n.cr-native-scope .cr-signal-main {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-signal-title-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-signal-main p {\n  margin: 2px 0 0;\n  overflow-wrap: anywhere;\n}\n\n.cr-native-scope .cr-signal .cr-link-button {\n  overflow-wrap: anywhere;\n}\n\n/* Submit / refresh / shortcuts */\n.cr-native-scope .cr-submit {\n  display: grid;\n  gap: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-recipient-warning {\n  padding: var(--cr-space-3);\n  border: 1px solid color-mix(in srgb, var(--cr-warning) 45%, var(--cr-border));\n  border-radius: var(--cr-radius-control);\n  background: color-mix(in srgb, var(--cr-warning) 9%, var(--cr-surface));\n}\n\n.cr-native-scope .cr-recipient-warning p {\n  margin: 4px 0 0;\n  color: var(--cr-text-muted);\n  font-size: var(--cr-text-meta);\n}\n\n.cr-native-scope .cr-verdict-field {\n  margin: 0;\n  padding: 0;\n  border: 0;\n}\n\n.cr-native-scope .cr-verdict-options {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-verdict-option {\n  display: flex;\n  align-items: flex-start;\n  gap: var(--cr-space-2);\n  min-height: 44px;\n  padding: var(--cr-space-2);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-verdict-option:has(input:checked) {\n  border-color: var(--cr-primary);\n  background: color-mix(in srgb, var(--cr-primary) 8%, transparent);\n}\n\n.cr-native-scope .cr-verdict-option input {\n  width: 18px;\n  height: 18px;\n  margin: 2px 0 0;\n  accent-color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-verdict-option > span {\n  display: grid;\n  gap: 1px;\n}\n\n.cr-native-scope .cr-submit-counts {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-tree-risk {\n  display: grid;\n  min-width: 18px;\n  height: 18px;\n  padding: 0 4px;\n  place-items: center;\n  border: 1px solid currentColor;\n  border-radius: var(--cr-radius-pill);\n  background: var(--cr-surface);\n  font-family: var(--cr-font-ui);\n  font-size: 10px;\n  font-weight: 750;\n}\n\n.cr-native-scope .cr-tree-risk.cr-risk-blocker {\n  color: var(--cr-danger);\n}\n\n.cr-native-scope .cr-tree-risk.cr-risk-major {\n  color: var(--cr-warning);\n}\n\n.cr-native-scope .cr-tree-risk.cr-risk-minor {\n  color: var(--cr-info);\n}\n\n.cr-native-scope .cr-tree-risk.cr-risk-nit {\n  color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-tree-comments {\n  display: inline-grid;\n  min-width: 18px;\n  height: 18px;\n  place-items: center;\n  padding: 0 4px;\n  border-radius: 9px;\n  background: color-mix(in srgb, var(--cr-warning) 18%, transparent);\n  color: var(--cr-warning);\n  font-family: var(--cr-font-mono);\n  font-size: 10px;\n  font-weight: 700;\n}\n\n.cr-native-scope .cr-submit-pending {\n  display: grid;\n  gap: var(--cr-space-2);\n  padding-top: var(--cr-space-3);\n  border-top: 1px solid var(--cr-border);\n}\n\n.cr-native-scope .cr-submit-pending-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-submit-pending-head h3 {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 650;\n}\n\n.cr-native-scope .cr-submit-pending-head span {\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-submit-pending-list {\n  display: grid;\n  gap: 6px;\n  max-height: 220px;\n  margin: 0;\n  padding: 0;\n  overflow: auto;\n  list-style: none;\n}\n\n.cr-native-scope .cr-submit-pending-item {\n  display: grid;\n  gap: 2px;\n  width: 100%;\n  padding: 8px 10px;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-surface);\n  color: var(--cr-text);\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-submit-pending-item:hover:not(:disabled),\n.cr-native-scope .cr-submit-pending-item:focus-visible {\n  border-color: var(--cr-primary);\n  background: color-mix(in srgb, var(--cr-primary) 7%, var(--cr-surface));\n}\n\n.cr-native-scope .cr-submit-pending-item:disabled {\n  cursor: default;\n}\n\n.cr-native-scope .cr-submit-pending-path {\n  color: var(--cr-text-muted);\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-submit-pending-body {\n  display: -webkit-box;\n  overflow: hidden;\n  font-size: 12px;\n  line-height: 1.4;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n}\n\n.cr-native-scope .cr-refresh {\n  display: grid;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-refresh p {\n  margin: 0;\n}\n\n.cr-native-scope .cr-shortcut-list {\n  display: grid;\n  gap: var(--cr-space-2);\n  margin: 0;\n}\n\n.cr-native-scope .cr-shortcut-list > div {\n  display: grid;\n  grid-template-columns: 72px minmax(0, 1fr);\n  gap: var(--cr-space-2);\n  align-items: baseline;\n}\n\n.cr-native-scope .cr-shortcut-list dt,\n.cr-native-scope .cr-shortcut-list dd {\n  margin: 0;\n}\n\n.cr-native-scope .cr-shortcut-list kbd {\n  display: inline-block;\n  min-width: 26px;\n  padding: 2px 6px;\n  border: 1px solid var(--cr-border);\n  border-bottom-width: 2px;\n  border-radius: 4px;\n  background: var(--cr-bg);\n  color: var(--cr-text);\n  font-family: var(--cr-font-mono);\n  font-size: 11px;\n  text-align: center;\n}\n\n/* Detail responsive */\n@media (max-width: 1240px) {\n  .cr-native-scope .cr-detail-grid {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-rail {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .cr-native-scope .cr-rail-card:first-child {\n    grid-column: 1 / -1;\n  }\n}\n\n@media (max-width: 1024px) {\n  .cr-native-scope .cr-diff-layout {\n    grid-template-columns: 210px minmax(0, 1fr);\n  }\n}\n\n@media (max-width: 900px) {\n  .cr-native-scope .cr-diff-layout {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-file-tree {\n    position: static;\n    display: none;\n  }\n\n  .cr-native-scope .cr-mobile-file-select {\n    display: block;\n    flex: 1 1 180px;\n  }\n\n  .cr-native-scope .cr-mobile-file-select select {\n    width: 100%;\n    min-height: 38px;\n    padding: 6px 9px;\n    border: 1px solid var(--cr-border);\n    border-radius: var(--cr-radius-control);\n    background: var(--cr-bg);\n    color: var(--cr-text);\n    font-size: var(--cr-text-control);\n  }\n\n  .cr-native-scope .cr-shortcut-hint {\n    display: none;\n  }\n}\n\n@media (max-width: 768px) {\n  .cr-native-scope .cr-detail-header {\n    flex-direction: column;\n    gap: var(--cr-space-4);\n  }\n\n  .cr-native-scope .cr-detail-actions {\n    justify-content: flex-start;\n  }\n\n  .cr-native-scope .cr-detail-title {\n    font-size: 26px;\n  }\n\n  .cr-native-scope .cr-rail {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-rail-card:first-child {\n    grid-column: auto;\n  }\n\n  .cr-native-scope .cr-inline-thread,\n  .cr-native-scope .cr-inline-composer {\n    padding-inline: var(--cr-space-3);\n    min-width: 0;\n  }\n\n  .cr-native-scope .cr-inline-finding,\n  .cr-native-scope .cr-inline-question {\n    margin-inline: 0;\n  }\n\n  .cr-native-scope .cr-signal {\n    grid-template-columns: 18px minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-signal .cr-link-button {\n    grid-column: 2;\n    justify-self: start;\n  }\n\n  .cr-native-scope .cr-report-toolbar .cr-field,\n  .cr-native-scope .cr-report-toolbar .cr-multi-select {\n    width: min(100%, 220px);\n  }\n}\n\n@media (max-width: 520px) {\n  .cr-native-scope .cr-detail-header,\n  .cr-native-scope .cr-detail-eyebrow,\n  .cr-native-scope .cr-detail-scope {\n    overflow-wrap: anywhere;\n  }\n\n  .cr-native-scope .cr-detail-tabs {\n    flex-wrap: wrap;\n  }\n\n  .cr-native-scope .cr-detail-tabs .cr-tab {\n    flex: 1 1 45%;\n    justify-content: center;\n    min-width: 0;\n    padding: 0 8px;\n    font-size: 12.5px;\n  }\n\n  .cr-native-scope .cr-detail-tabs .cr-tab-count {\n    margin-left: 5px;\n    min-width: 17px;\n    padding: 0 4px;\n  }\n\n  .cr-native-scope .cr-detail-actions {\n    display: grid;\n    grid-template-columns: minmax(0, 1fr);\n    width: 100%;\n  }\n\n  .cr-native-scope .cr-detail-actions .cr-button {\n    width: 100%;\n  }\n\n  .cr-native-scope .cr-round-pills {\n    justify-content: flex-start;\n  }\n\n  .cr-native-scope .cr-diff-toolbar {\n    align-items: stretch;\n  }\n\n  .cr-native-scope .cr-diff-count,\n  .cr-native-scope .cr-diff-scope-note {\n    white-space: normal;\n  }\n\n  .cr-native-scope .cr-diff-file-head {\n    gap: 6px;\n  }\n\n  .cr-native-scope .cr-diff-hash {\n    display: none;\n  }\n\n  .cr-native-scope .cr-diff-gutter-head,\n  .cr-native-scope .cr-hunk,\n  .cr-native-scope .cr-diff-line,\n  .cr-native-scope .cr-inline-thread,\n  .cr-native-scope .cr-inline-composer {\n    min-width: 0;\n  }\n\n  .cr-native-scope .cr-diff-body {\n    overflow-x: auto;\n  }\n\n  .cr-native-scope .cr-diff-gutter-head {\n    grid-template-columns: 34px 34px 16px 22px minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-diff-line {\n    grid-template-columns: 34px 34px 16px 22px minmax(0, 1fr) auto auto;\n    font-size: 11.5px;\n  }\n\n  .cr-native-scope .cr-inline-thread,\n  .cr-native-scope .cr-inline-composer {\n    padding-left: var(--cr-space-2);\n  }\n\n  .cr-native-scope .cr-composer-range {\n    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-rail {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-fix-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .cr-native-scope .cr-thread-head {\n    gap: 6px;\n  }\n}\n\n@media (pointer: coarse) {\n  .cr-native-scope .cr-diff-line {\n    min-height: 44px;\n  }\n\n  .cr-native-scope .cr-diff-comment {\n    display: inline-block;\n    width: 44px;\n    height: 44px;\n  }\n\n  .cr-native-scope .cr-diff-risk-pin::before {\n    position: absolute;\n    inset: -14px;\n    content: '';\n  }\n\n  .cr-native-scope .cr-round-pill,\n  .cr-native-scope .cr-segmented-button,\n  .cr-native-scope .cr-tree-file,\n  .cr-native-scope .cr-tree-dir {\n    min-height: 44px;\n  }\n\n  .cr-native-scope .cr-diff-line:hover .cr-diff-comment {\n    display: inline-block;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .cr-native-scope .cr-round-pill,\n  .cr-native-scope .cr-segmented-button,\n  .cr-native-scope .cr-fix-cell,\n  .cr-native-scope .cr-tree-file,\n  .cr-native-scope .cr-tree-dir,\n  .cr-native-scope .cr-thread,\n  .cr-native-scope .cr-anchor-jump {\n    transition: none;\n  }\n}\n\n.cr-native-scope .cr-button[data-size='small'] {\n  min-height: 30px;\n  padding: 3px 9px;\n  font-size: 12px;\n}\n\n@media (max-width: 768px) {\n  .cr-native-scope .cr-topbar .cr-tooltip,\n  .cr-native-scope .cr-topbar .cr-tooltip-wrap:hover .cr-tooltip,\n  .cr-native-scope .cr-topbar .cr-tooltip-wrap:focus-within .cr-tooltip,\n  .cr-native-scope .cr-topbar .cr-tooltip[data-open='true'] {\n    left: auto;\n    right: 0;\n    transform: translateY(2px);\n  }\n\n  .cr-native-scope .cr-topbar .cr-tooltip-wrap:hover .cr-tooltip,\n  .cr-native-scope .cr-topbar .cr-tooltip-wrap:focus-within .cr-tooltip,\n  .cr-native-scope .cr-topbar .cr-tooltip[data-open='true'] {\n    transform: translateY(0);\n  }\n}\n\n.cr-native-scope .cr-detail-tabs {\n  scrollbar-width: none;\n}\n\n.cr-native-scope .cr-detail-tabs::-webkit-scrollbar {\n  display: none;\n}\n\n@media (max-width: 520px) {\n  .cr-native-scope .cr-detail-actions > .cr-badge {\n    justify-self: start;\n  }\n}\n\n@media (pointer: coarse) {\n  .cr-native-scope .cr-button[data-size='small'],\n  .cr-native-scope .cr-link-button {\n    min-height: 44px;\n  }\n}\n\n.cr-native-scope .cr-form-section-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-form-error-summary {\n  margin: 0;\n  padding: var(--cr-space-3);\n  border: 1px solid color-mix(in srgb, var(--cr-danger) 45%, var(--cr-border));\n  border-radius: var(--cr-radius-control);\n  background: color-mix(in srgb, var(--cr-danger) 9%, var(--cr-surface));\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-commits-fieldset {\n  display: grid;\n  gap: var(--cr-space-2);\n  min-width: 0;\n  margin: var(--cr-space-2) 0 0;\n  padding: var(--cr-space-3);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n}\n\n.cr-native-scope .cr-radio {\n  display: flex;\n  align-items: flex-start;\n  gap: var(--cr-space-2);\n  min-height: 44px;\n  padding: 6px 4px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-radio input {\n  width: 18px;\n  height: 18px;\n  margin: 2px 0 0;\n  accent-color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-radio > span {\n  display: grid;\n  gap: 2px;\n}\n\n.cr-native-scope .cr-commit-picker {\n  display: grid;\n  gap: var(--cr-space-2);\n  padding-top: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-commit-list {\n  display: grid;\n  gap: 2px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-commit-option {\n  display: grid;\n  grid-template-columns: 18px 72px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: var(--cr-space-2);\n  min-height: 44px;\n  padding: 4px 6px;\n  border-radius: var(--cr-radius-control);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-commit-option:hover {\n  background: color-mix(in srgb, var(--cr-text) 5%, transparent);\n}\n\n.cr-native-scope .cr-commit-option input {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-commit-sha {\n  color: var(--cr-text-muted);\n  font-family: var(--cr-font-mono);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-commit-subject {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-commit-author {\n  color: var(--cr-text-muted);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-settings-form {\n  display: grid;\n  gap: var(--cr-space-4);\n  max-width: 1040px;\n}\n\n.cr-native-scope .cr-settings-notice {\n  margin: 0;\n  padding: var(--cr-space-3);\n  border: 1px solid color-mix(in srgb, var(--cr-success) 45%, var(--cr-border));\n  border-radius: var(--cr-radius-control);\n  background: color-mix(in srgb, var(--cr-success) 8%, var(--cr-surface));\n  color: var(--cr-text);\n  font-size: var(--cr-text-control);\n}\n\n.cr-native-scope .cr-repo-list {\n  display: grid;\n  gap: var(--cr-space-3);\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-repo-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  align-items: start;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-4);\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-repo-fields {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 0.8fr);\n  gap: var(--cr-space-3);\n}\n\n.cr-native-scope .cr-path-control {\n  display: flex;\n  align-items: stretch;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-path-control .cr-input {\n  min-width: 0;\n  flex: 1 1 auto;\n}\n\n.cr-native-scope .cr-path-control .cr-icon-button {\n  flex: 0 0 auto;\n}\n\n.cr-native-scope .cr-path-browse {\n  background: var(--cr-surface);\n  color: var(--cr-primary);\n}\n\n.cr-native-scope .cr-branch-feedback {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-1) var(--cr-space-2);\n}\n\n.cr-native-scope .cr-branch-feedback .cr-error {\n  min-width: 0;\n  flex: 1 1 180px;\n}\n\n.cr-native-scope .cr-repo-remove {\n  margin-top: calc(1.4em + 6px);\n}\n\n.cr-native-scope .cr-folder-path-form {\n  display: flex;\n  align-items: flex-end;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-folder-path-form .cr-field {\n  min-width: 0;\n  flex: 1 1 auto;\n  margin: 0;\n}\n\n.cr-native-scope .cr-folder-nav {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--cr-space-2);\n}\n\n.cr-native-scope .cr-folder-breadcrumbs {\n  display: flex;\n  min-width: 0;\n  flex: 1 1 220px;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 2px;\n  font-family: var(--cr-font-mono);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-folder-crumb {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n}\n\n.cr-native-scope .cr-folder-separator {\n  color: var(--cr-text-muted);\n}\n\n.cr-native-scope .cr-folder-crumb-button {\n  min-height: 30px;\n  padding: 2px 5px;\n  border: 0;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--cr-primary);\n  font: inherit;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-folder-crumb-button[aria-current='location'] {\n  color: var(--cr-text);\n  font-weight: 650;\n}\n\n.cr-native-scope .cr-folder-crumb-button:hover {\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-folder-list {\n  display: grid;\n  max-height: min(42vh, 360px);\n  margin: 0;\n  padding: 0;\n  overflow: auto;\n  border: 1px solid var(--cr-border);\n  border-radius: var(--cr-radius-control);\n  list-style: none;\n}\n\n.cr-native-scope .cr-folder-entry {\n  display: flex;\n  width: 100%;\n  min-height: 44px;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--cr-space-3);\n  padding: var(--cr-space-2) var(--cr-space-3);\n  border: 0;\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-surface);\n  color: var(--cr-text);\n  font-family: var(--cr-font-mono);\n  font-size: 13px;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-folder-list li:last-child .cr-folder-entry {\n  border-bottom: 0;\n}\n\n.cr-native-scope .cr-folder-entry:hover,\n.cr-native-scope .cr-folder-entry:focus-visible {\n  background: var(--cr-surface-raised);\n}\n\n.cr-native-scope .cr-folder-entry-name {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-folder-git-badge {\n  flex: 0 0 auto;\n  padding: 1px 7px;\n  border: 1px solid color-mix(in srgb, var(--cr-success) 45%, var(--cr-border));\n  border-radius: var(--cr-radius-pill);\n  color: var(--cr-success);\n  font-family: var(--cr-font-ui);\n  font-size: 10px;\n  font-weight: 650;\n  letter-spacing: 0.02em;\n}\n\n@media (max-width: 860px) {\n  .cr-native-scope .cr-repo-fields {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-path-control,\n  .cr-native-scope .cr-folder-path-form {\n    flex-wrap: wrap;\n  }\n\n  .cr-native-scope .cr-folder-path-form .cr-button {\n    width: 100%;\n  }\n\n  .cr-native-scope .cr-repo-row {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-repo-row > .cr-button {\n    justify-self: start;\n  }\n\n  .cr-native-scope .cr-repo-remove {\n    margin-top: 0;\n  }\n}\n\n@media (max-width: 520px) {\n  .cr-native-scope .cr-commit-option {\n    grid-template-columns: 18px minmax(0, 1fr);\n  }\n\n  .cr-native-scope .cr-commit-sha {\n    display: none;\n  }\n\n  .cr-native-scope .cr-commit-author {\n    grid-column: 2;\n  }\n}\n\n/* Touch line selection: long-press then drag. The bar appears only for that gesture. */\n.cr-native-scope .cr-touch-comment-bar {\n  position: fixed;\n  bottom: calc(18px + env(safe-area-inset-bottom, 0px));\n  left: 50%;\n  z-index: 80;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  max-width: calc(100vw - 24px);\n  padding: 6px 6px 6px 14px;\n  transform: translateX(-50%);\n  border: 1px solid var(--cr-border);\n  border-radius: 999px;\n  background: var(--cr-surface-raised);\n  box-shadow: 0 10px 30px rgb(0 0 0 / 22%);\n  color: var(--cr-text);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-touch-comment-range {\n  overflow: hidden;\n  color: var(--cr-text-muted);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-touch-comment-cta {\n  min-height: 40px;\n  padding: 0 16px;\n  border: 0;\n  border-radius: 999px;\n  background: var(--cr-primary);\n  color: var(--cr-on-primary);\n  font-size: 13px;\n  font-weight: 600;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-touch-comment-clear {\n  display: inline-flex;\n  width: 36px;\n  height: 36px;\n  align-items: center;\n  justify-content: center;\n  padding: 0;\n  border: 0;\n  border-radius: 999px;\n  background: transparent;\n  color: var(--cr-text-muted);\n  font-size: 18px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-touch-comment-clear:hover {\n  background: color-mix(in srgb, var(--cr-text) 8%, transparent);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-touch-selecting .cr-diff-line {\n  user-select: none;\n}\n\n@media (pointer: coarse) {\n  .cr-native-scope .cr-diff-line {\n    -webkit-touch-callout: none;\n    user-select: none;\n  }\n\n  .cr-native-scope .cr-touch-comment-cta {\n    min-height: 44px;\n  }\n\n  .cr-native-scope .cr-touch-comment-clear {\n    width: 44px;\n    height: 44px;\n  }\n}\n\n.cr-native-scope {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  min-height: 0;\n  height: 100%;\n  overflow: hidden;\n  background: var(--cr-bg);\n  color: var(--cr-text);\n  font-family: var(--dsw-font-family, var(--cr-font-ui));\n}\n\n.cr-native-scope.cr-native-panel .cr-native-bar {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-height: 48px;\n  padding: 6px 16px;\n  border-bottom: 1px solid var(--cr-border);\n  background: var(--cr-surface);\n}\n\n.cr-native-scope .cr-native-brand {\n  flex: 0 0 auto;\n  color: var(--cr-text);\n  font-family: var(--dsw-font-family, var(--cr-font-ui));\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.cr-native-scope .cr-native-nav {\n  display: flex;\n  flex: 1 1 auto;\n  gap: 4px;\n  min-width: 0;\n  overflow-x: auto;\n  scrollbar-width: thin;\n}\n\n.cr-native-scope .cr-native-tab {\n  flex: 0 0 auto;\n  min-height: 32px;\n  padding: 5px 9px;\n  border: 1px solid transparent;\n  border-radius: var(--cr-radius-control);\n  color: var(--cr-text-muted);\n  font-size: 12px;\n  text-decoration: none;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-native-tab:hover {\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-native-tab[aria-current='page'] {\n  border-color: var(--cr-border);\n  background: var(--cr-surface-raised);\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-native-main {\n  display: flex;\n  flex: 1 1 auto;\n  flex-direction: column;\n  min-height: 0;\n  overflow: auto;\n  padding: 20px 24px 48px;\n}\n\n.cr-native-scope.cr-native-panel {\n  --cr-bg: var(--dsw-alias-bg-layer-1, #0d1117);\n  --cr-surface: var(--dsw-alias-bg-layer-2, #161b22);\n  --cr-surface-raised: var(--dsw-alias-bg-layer-3, #21262d);\n  --cr-text: var(--dsw-alias-label-primary, #e6edf3);\n  --cr-text-muted: var(--dsw-alias-label-tertiary, #9da7b3);\n  --cr-border: var(--dsw-alias-border-l2, #5b6572);\n  --cr-primary: var(--dsw-alias-brand-primary, #58a6ff);\n  --cr-on-primary: var(--dsw-alias-label-primary-foreground, #08111f);\n}\n\n.cr-native-scope.cr-settings-tab {\n  height: auto;\n  min-height: 0;\n  overflow: visible;\n  padding: 4px 0 24px;\n}\n\n.cr-native-scope.cr-settings-tab > .cr-page-head {\n  margin-bottom: 16px;\n}\n\n@media (max-width: 640px) {\n  .cr-native-scope.cr-native-panel .cr-native-bar {\n    padding-inline: 12px;\n  }\n\n  .cr-native-scope .cr-native-main {\n    padding: 16px 16px 40px;\n  }\n}\n\n.cr-native-scope .cr-native-error {\n  padding: 24px;\n  color: var(--cr-text);\n}\n\n.cr-native-scope .cr-native-error h1 {\n  margin: 0 0 8px;\n  font-size: 20px;\n}\n\n.cr-native-scope .cr-native-error p {\n  margin: 0 0 16px;\n  color: var(--cr-text-muted);\n}\n\n/* Native DSH settings section (Settings \u2192 Code Review). The surrounding shell\n   owns the modal chrome and theme, so this surface only uses host tokens. */\n.cr-native-scope.cr-dsh-settings-scope {\n  height: auto;\n  min-height: 0;\n  overflow: visible;\n  background: transparent;\n  color: var(--dsw-alias-label-primary, #111827);\n  font-size: 13px;\n}\n\n.cr-native-scope .cr-dsh-settings {\n  display: grid;\n  gap: 14px;\n  max-width: 760px;\n  font-family: var(--dsw-font-family, system-ui, sans-serif);\n  font-size: 13px;\n  line-height: 1.45;\n}\n\n.cr-native-scope .cr-dsh-settings-head {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n}\n\n.cr-native-scope .cr-dsh-settings-copy {\n  min-width: 0;\n}\n\n.cr-native-scope .cr-dsh-settings-copy h2 {\n  margin: 0;\n  font-size: 15px;\n  font-weight: 600;\n  line-height: 1.35;\n}\n\n.cr-native-scope .cr-dsh-settings-copy p {\n  margin: 2px 0 0;\n  color: var(--dsw-alias-label-tertiary, #6b7280);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-dsh-form {\n  display: grid;\n  gap: 12px;\n}\n\n.cr-native-scope .cr-dsh-muted {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #6b7280);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-dsh-banner {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  margin: 0;\n  padding: 8px 10px;\n  border: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n  border-radius: 8px;\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-dsh-banner-error {\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d92d20) 45%, transparent);\n  color: var(--dsw-alias-state-error-primary, #b42318);\n}\n\n.cr-native-scope .cr-dsh-banner-success {\n  border-color: color-mix(\n    in srgb,\n    var(--dsw-alias-state-success-primary, #12b76a) 45%,\n    transparent\n  );\n  color: var(--dsw-alias-label-primary, #111827);\n}\n\n.cr-native-scope .cr-dsh-repos {\n  border-top: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n}\n\n.cr-native-scope .cr-dsh-repo {\n  display: grid;\n  grid-template-columns: minmax(110px, 0.9fr) minmax(190px, 1.5fr) minmax(125px, 0.8fr) auto;\n  align-items: start;\n  gap: 10px;\n  padding: 12px 0;\n  border-bottom: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n}\n\n.cr-native-scope .cr-dsh-field {\n  display: grid;\n  gap: 4px;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-dsh-label {\n  color: var(--dsw-alias-label-tertiary, #6b7280);\n  font-size: 11px;\n  font-weight: 500;\n  line-height: 1.3;\n}\n\n.cr-native-scope .cr-dsh-input {\n  box-sizing: border-box;\n  width: 100%;\n  height: 32px;\n  padding: 0 9px;\n  border: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2, #fff);\n  color: var(--dsw-alias-label-primary, #111827);\n  font: inherit;\n  font-size: 13px;\n  outline: none;\n}\n\n.cr-native-scope .cr-dsh-input::placeholder {\n  color: var(--dsw-alias-label-quaternary, #98a2b3);\n}\n\n.cr-native-scope .cr-dsh-input:focus-visible {\n  border-color: var(--dsw-alias-brand-primary, #2f6fed);\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #2f6fed) 28%, transparent);\n}\n\n.cr-native-scope .cr-dsh-input:disabled {\n  opacity: 0.55;\n}\n\n.cr-native-scope .cr-dsh-mono {\n  font-family: var(--cr-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-dsh-select {\n  padding-right: 26px;\n}\n\n.cr-native-scope .cr-dsh-inline {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-dsh-inline .cr-dsh-input {\n  min-width: 0;\n  flex: 1 1 auto;\n}\n\n.cr-native-scope .cr-dsh-icon-button {\n  display: inline-flex;\n  flex: 0 0 auto;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  border: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2, #fff);\n  color: var(--dsw-alias-label-tertiary, #6b7280);\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-dsh-icon-button:hover:not(:disabled) {\n  background: var(--dsw-alias-bg-layer-3, #f2f4f7);\n  color: var(--dsw-alias-label-primary, #111827);\n}\n\n.cr-native-scope .cr-dsh-icon-button:disabled {\n  opacity: 0.5;\n}\n\n.cr-native-scope .cr-dsh-remove {\n  margin-top: 19px;\n}\n\n.cr-native-scope .cr-dsh-remove:hover:not(:disabled) {\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d92d20) 50%, transparent);\n  color: var(--dsw-alias-state-error-primary, #b42318);\n}\n\n.cr-native-scope .cr-dsh-retry {\n  flex: 0 0 auto;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-brand-primary, #2f6fed);\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-dsh-button {\n  display: inline-flex;\n  flex: 0 0 auto;\n  align-items: center;\n  justify-content: center;\n  min-height: 32px;\n  padding: 0 12px;\n  border: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n  border-radius: 8px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary, #111827);\n  font: inherit;\n  font-size: 12px;\n  font-weight: 500;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-dsh-button:hover:not(:disabled) {\n  background: var(--dsw-alias-bg-layer-3, #f2f4f7);\n}\n\n.cr-native-scope .cr-dsh-button-primary {\n  border-color: transparent;\n  background: var(--dsw-alias-brand-primary, #2f6fed);\n  color: var(--dsw-alias-label-primary-foreground, #fff);\n}\n\n.cr-native-scope .cr-dsh-button-primary:hover:not(:disabled) {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2f6fed) 88%, #000);\n}\n\n.cr-native-scope .cr-dsh-button:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n\n.cr-native-scope .cr-dsh-add {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  width: 100%;\n  min-height: 34px;\n  border: 1px dashed var(--dsw-alias-border-l2, #d0d5dd);\n  border-radius: 8px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary, #6b7280);\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-dsh-add:hover:not(:disabled) {\n  border-color: var(--dsw-alias-brand-primary, #2f6fed);\n  color: var(--dsw-alias-brand-primary, #2f6fed);\n}\n\n.cr-native-scope .cr-dsh-add:disabled {\n  opacity: 0.5;\n}\n\n.cr-native-scope .cr-dsh-error {\n  color: var(--dsw-alias-state-error-primary, #b42318);\n  font-size: 11px;\n}\n\n.cr-native-scope .cr-dsh-empty {\n  padding: 14px 0 4px;\n}\n\n.cr-native-scope .cr-dsh-empty p {\n  margin: 0;\n}\n\n.cr-native-scope .cr-dsh-empty .cr-dsh-muted {\n  margin-top: 2px;\n}\n\n@media (max-width: 760px) {\n  .cr-native-scope .cr-dsh-settings-head {\n    flex-direction: column;\n    align-items: stretch;\n  }\n\n  .cr-native-scope .cr-dsh-settings-head .cr-dsh-button-primary {\n    align-self: flex-start;\n  }\n\n  .cr-native-scope .cr-dsh-repo {\n    grid-template-columns: minmax(0, 1fr);\n    gap: 10px;\n  }\n\n  .cr-native-scope .cr-dsh-remove {\n    margin-top: 0;\n    justify-self: end;\n  }\n}\n\n@media (pointer: coarse) {\n  .cr-native-scope .cr-dsh-input,\n  .cr-native-scope .cr-dsh-select {\n    height: 40px;\n    font-size: 16px;\n  }\n\n  .cr-native-scope .cr-dsh-icon-button {\n    width: 40px;\n    height: 40px;\n  }\n\n  .cr-native-scope .cr-dsh-button {\n    min-height: 40px;\n  }\n\n  .cr-native-scope .cr-dsh-add {\n    min-height: 42px;\n  }\n\n  .cr-native-scope .cr-dsh-remove {\n    margin-top: 15px;\n  }\n}\n\n/* Native folder picker opened from the Code Review settings section. */\n.cr-native-scope .cr-dsh-picker-layer {\n  position: fixed;\n  inset: 0;\n  z-index: 10000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 24px;\n  background: color-mix(in srgb, #000 42%, transparent);\n}\n\n.cr-native-scope .cr-dsh-picker {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  width: min(560px, 100%);\n  max-height: min(80vh, 720px);\n  padding: 16px;\n  border: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-layer-1, #fff);\n  color: var(--dsw-alias-label-primary, #111827);\n  box-shadow: 0 16px 48px rgb(0 0 0 / 28%);\n  font-family: var(--dsw-font-family, system-ui, sans-serif);\n  font-size: 13px;\n  outline: none;\n}\n\n.cr-native-scope .cr-dsh-picker-head {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.cr-native-scope .cr-dsh-picker-head h2 {\n  margin: 0;\n  font-size: 15px;\n  font-weight: 600;\n  line-height: 1.35;\n}\n\n.cr-native-scope .cr-dsh-picker-head p {\n  margin: 2px 0 0;\n  color: var(--dsw-alias-label-tertiary, #6b7280);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-dsh-picker-path {\n  display: grid;\n  gap: 4px;\n}\n\n.cr-native-scope .cr-dsh-picker-nav {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n\n.cr-native-scope .cr-dsh-button-quiet {\n  padding: 0 9px;\n}\n\n.cr-native-scope .cr-dsh-breadcrumbs {\n  display: flex;\n  flex: 1 1 auto;\n  align-items: center;\n  gap: 2px;\n  min-width: 0;\n  overflow-x: auto;\n  white-space: nowrap;\n  scrollbar-width: none;\n}\n\n.cr-native-scope .cr-dsh-breadcrumbs::-webkit-scrollbar {\n  display: none;\n}\n\n.cr-native-scope .cr-dsh-crumb {\n  display: inline-flex;\n  align-items: center;\n}\n\n.cr-native-scope .cr-dsh-crumb-separator {\n  padding: 0 2px;\n  color: var(--dsw-alias-label-quaternary, #98a2b3);\n}\n\n.cr-native-scope .cr-dsh-crumb-button {\n  padding: 2px 3px;\n  border: 0;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--dsw-alias-brand-primary, #2f6fed);\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-dsh-crumb-button:hover {\n  background: var(--dsw-alias-bg-layer-3, #f2f4f7);\n}\n\n.cr-native-scope .cr-dsh-crumb-button[aria-current='location'] {\n  color: var(--dsw-alias-label-primary, #111827);\n  font-weight: 500;\n}\n\n.cr-native-scope .cr-dsh-badge {\n  flex: 0 0 auto;\n  padding: 1px 6px;\n  border: 1px solid\n    color-mix(in srgb, var(--dsw-alias-state-success-primary, #12b76a) 50%, transparent);\n  border-radius: 999px;\n  color: var(--dsw-alias-state-success-primary, #067647);\n  font-size: 10px;\n  line-height: 1.5;\n}\n\n.cr-native-scope .cr-dsh-picker-list {\n  flex: 1 1 auto;\n  min-height: 120px;\n  max-height: 46vh;\n  overflow: auto;\n  border: 1px solid var(--dsw-alias-border-l2, #d0d5dd);\n  border-radius: 8px;\n  padding: 4px;\n}\n\n.cr-native-scope .cr-dsh-picker-entries {\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.cr-native-scope .cr-dsh-picker-entry {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  min-height: 34px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary, #111827);\n  font: inherit;\n  font-size: 13px;\n  text-align: left;\n  cursor: pointer;\n}\n\n.cr-native-scope .cr-dsh-picker-entry:hover {\n  background: var(--dsw-alias-bg-layer-3, #f2f4f7);\n}\n\n.cr-native-scope .cr-dsh-picker-entry-name {\n  flex: 1 1 auto;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.cr-native-scope .cr-dsh-picker-state {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 8px;\n  color: var(--dsw-alias-state-error-primary, #b42318);\n  font-size: 12px;\n}\n\n.cr-native-scope .cr-dsh-picker-hint {\n  flex: 0 0 auto;\n}\n\n.cr-native-scope .cr-dsh-picker-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  padding-top: 2px;\n}\n\n@media (max-width: 600px) {\n  .cr-native-scope .cr-dsh-picker-layer {\n    padding: 12px;\n  }\n\n  .cr-native-scope .cr-dsh-picker {\n    max-height: 90vh;\n  }\n\n  .cr-native-scope .cr-dsh-picker-actions .cr-dsh-button {\n    flex: 1 1 0;\n  }\n}\n\n@media (pointer: coarse) {\n  .cr-native-scope .cr-dsh-picker-entry {\n    min-height: 44px;\n  }\n\n  .cr-native-scope .cr-dsh-picker {\n    font-size: 14px;\n  }\n}\n";
    document.head.append(style);
    return () => style.remove();
  }, "reviewd: scoped styles");
  ctx.slots.inject(
    "sidebar.panellist",
    () => ctx.slots.register(
      { name: "sidebar.panellist", id: PANEL_ID, order: 12, label: () => "Code Review" },
      Icon
    )
  );
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: PANEL_ID }, NativePanel));
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      { name: "settings.section", id: PANEL_ID, order: 25, label: () => "Code Review" },
      SettingsSection
    )
  );
}
    return module.exports;
  }
});
