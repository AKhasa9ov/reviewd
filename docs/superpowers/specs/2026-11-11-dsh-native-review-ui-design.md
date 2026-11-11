# DSH Native Review UI — Approved Design

**Date:** 2026-11-11
**Status:** Approved; settings placement amended by the human partner
**Scope:** EPIC — native code-review UI inside the DSH `main` panel, with full parity to the standalone reviewd SPA.

## 1. Problem

The standalone reviewd SPA already contains the complete review workflow. The DSH `Code Review` panel currently renders a separate, thin list and sends users to the SPA in a new tab for every real action. The panel must become the primary UI, not a shortcut. It must keep the existing data and must not regress the standalone SPA.

## 2. Approved decisions

| Decision          | Choice                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Rendering surface | Native React in the DSH `main` slot; no iframe                                                          |
| Feature scope     | Full standalone parity                                                                                  |
| Data              | Same daemon/store as the standalone UI                                                                  |
| Chrome            | Compact DSH-native navigation; no nested reviewd sidebar                                                |
| Settings          | Repository settings live in DSH Settings → Built-in plugins → **Code Review** tab; not in the panel nav |
| Standalone SPA    | Kept as fallback and external deep-link surface                                                         |
| Language          | English UI copy, matching the standalone SPA                                                            |

## 3. Non-goals

- No iframe or Shadow DOM.
- No duplicate implementation of review pages.
- No new authentication flow inside the panel; DSH's session is the auth boundary.
- No automatic conversion of external `/code-review/review/<id>` feedback links into a native DSH panel route. Those links keep opening the standalone SPA.
- No duplicate settings UI: the panel does not get a Settings tab after the DSH Settings tab exists.
- No release/publish in this EPIC without separate approval.

## 4. Architecture

### 4.1 Reuse boundary

`packages/web/src/App.tsx` becomes a composition root rather than a Shell-coupled component:

```text
ReviewProviders   RouterProvider + ThemeProvider + ToastProvider + portal container
ReviewRoot        active API client + auth-mode redirect + route switch
ReviewApp         ReviewProviders + optional native header + ReviewRoot
App               ReviewProviders + standalone Shell + ReviewRoot
```

Existing pages and `ReviewDetail` are reused unchanged in behavior. `ReviewDetail` already accepts `location` and `navigate`; that is the supported injection point.

`ReviewRoot` creates the API client unless one is supplied. The native client supplies `createApiClient({ baseUrl: '/api/code-review' })`; the standalone client keeps `BASE_PATH` and token auth.

The existing `SettingsPage` is reused by the DSH Settings tab. It already talks to the daemon API and owns repository add/remove/save, branch defaults, and the folder picker.

### 4.2 Router

The current module-level browser router is replaced by a router object supplied through React context:

```ts
interface Router {
  location(): string;
  subscribe(listener: () => void): () => void;
  navigate(to: string, options?: { replace?: boolean }): void;
  href(to: string): string;
}
```

- `createBrowserRouter()` wraps `window.history` and the SPA base for standalone.
- `createMemoryRouter(initial, options)` holds a logical path in memory for the native panel.
- `createMemoryRouter` persists its location in `sessionStorage` so switching DSH panels does not reset the current review.
- `useLocation`, `useNavigate`, and `Link` consume the context; the exported default browser `navigate` remains for compatibility.
- Native links carry `/code-review/...` as their real `href` so middle-click / “open in new tab” still has a working standalone fallback.

### 4.3 Native chrome

Inside the panel:

```text
Code review                         Reviews | New review | Health
────────────────────────────────────────────────────────────────────────────
route content
```

- Navigation is a `<nav aria-label="Code review sections">` of real links with `aria-current="page"`.
- No reviewd sidebar, drawer, theme toggle, or duplicate brand chrome.
- No Settings link in the panel. Settings is a DSH Settings surface.
- Pages keep their existing page headers and actions.
- At narrow widths the nav scrolls horizontally; content must not create page-level horizontal overflow at 320px.

### 4.4 Theme and DOM isolation

The standalone stylesheet targets `html`, `body`, `:root`, and `#root`. It must not leak into DSH.

- Build a scoped stylesheet by prefixing every UI selector with `.cr-native-scope`.
- Prefix root selectors so `:root` becomes `.cr-native-scope`, and `html/body/#root` become `.cr-native-scope`.
- Leave `@keyframes` selectors untouched.
- Append a small native-shell stylesheet, scoped the same way, for the panel frame/nav and settings-tab frame.
- Keep light DOM. `ReviewDetail` and full-file dialogs use `document.getElementById` and focus restoration; Shadow DOM would require rewriting those code paths.
- Inject the scoped stylesheet once from the DSH client `apply` effect; both the native panel and the DSH Settings tab use the same `.cr-native-scope` class. The style is removed on plugin teardown.
- `ThemeProvider` accepts `targetRef` and `persist`. Native mode applies `data-theme` to the scope and does not write `document.documentElement` or `localStorage`.
- Native theme starts from `body[data-ds-dark-theme]` and follows later host theme changes through a `MutationObserver` that updates the scope only.
- `Dialog` portals into a container inside the active scope via `PortalContainerProvider`; standalone continues to portal to `document.body` by default. This also makes the folder picker in the DSH Settings tab scoped.
- No portal or theme writes escape to DSH chrome.

### 4.5 Client bundle

`packages/dsh/client.js` is generated from `packages/dsh/src/client.tsx`.

Bundle contract:

```js
window.__ModuleLoader__.load({
  id: '@sir_yami/reviewd',
  factory(require) {
    // CJS bundle output
    return module.exports;
  },
});
```

- React, ReactDOM, ReactDOM client, and the JSX runtime are externalized to DSH's module table.
- `platform: 'browser'`, `format: 'cjs'`, `target: 'es2022'`.
- CSS is provided through the build-time define `__REVIEW_CSS__`.
- The output remains a single shipped `client.js`; `packages/dsh/web/` is unchanged.

### 4.6 DSH Settings plugin tab

The client registers:

```text
Settings → Built-in plugins → Code Review
```

using `ctx.slots.inject('settings.plugins.tab', ...)` and `ctx.slots.register({ name: 'settings.plugins.tab', id: 'code-review', order: 20, label: () => 'Code Review' }, SettingsTab)`.

`SettingsTab` wraps the reused `SettingsPage` with:

- the native API client (`/api/code-review`);
- `.cr-native-scope` and a host-theme `data-theme`;
- `ThemeProvider` with `targetRef` and `persist: false`;
- a panel-local `PortalContainerProvider` for the folder picker.

The tab is additive: if a DSH composition does not declare `settings.plugins.tab`, the native panel still works and settings remain reachable through the standalone SPA. No panel Settings tab is kept.

### 4.7 Data and store

The native panel and Settings tab always call same-origin `/api/code-review`, which the host already proxies to either the embedded or external daemon.

- Current user profile uses external daemon `127.0.0.1:3100`; no store change is required and both surfaces see the same reviews/settings.
- Embedded mode keeps the existing default store. `storeDir` remains the supported override; docs will state that `~/.local/share/code-review` can be selected explicitly. The package default is not changed for existing embedded users.
- No migration or deletion of either store is part of this work.

## 5. Route behavior

Native routes use logical paths:

| Path               | View          |
| ------------------ | ------------- |
| `/`                | Reviews list  |
| `/new`             | New review    |
| `/review/:id`      | Review detail |
| `/review/:id/edit` | Edit request  |
| `/health`          | Daemon health |
| anything else      | Not found     |

`/settings` remains a standalone SPA route. The native panel does not expose it; if an old native deep route reaches it, it renders the existing Settings page as a compatibility fallback, not as a navigation entry.

- The router state persists in `sessionStorage` under a DSH-specific key.
- The standalone SPA keeps `/code-review/...` browser URLs.
- Auth route is reachable only in standalone token mode; DSH mode redirects `/auth` to `/`.

## 6. Failure containment

- A React error boundary wraps the native app and renders a scoped error panel with a retry action instead of leaving the DSH slot blank.
- The Settings tab has its own boundary so a settings failure cannot blank the DSH Settings dialog.
- Existing page-level `ErrorPanel` and retry paths are retained.
- API 401/503 handling stays with existing page error components; the native client does not add a token form.

## 7. Acceptance criteria

1. Opening `Code Review` in DSH shows the full review list without leaving the panel.
2. New review can be created and opens the native detail route.
3. Review detail supports diff, full file, comments, findings, submit, and edit through the native route.
4. Repository settings are functional in DSH Settings → Built-in plugins → Code Review; the panel has no Settings nav tab.
5. Health is reachable and functional in the panel.
6. The same review IDs and settings are visible through the external daemon and the standalone SPA.
7. Standalone `/code-review/` behavior and its tests remain green.
8. Native rendering writes no global `html/body/#root` styles and does not mount a second app on `document.body`.
9. Keyboard navigation, focus-visible, 320px layout, and reduced-motion behavior remain usable.
10. `pnpm build`, `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
11. Live DSH verification is captured with a screenshot or transcript before release consideration.

## 8. Risks and mitigations

| Risk                                                      | Mitigation                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Router refactor regresses standalone                      | Keep default browser router; run existing web/UI tests and Playwright after each wave |
| CSS scoping misses a global selector                      | Unit-test generated CSS for `html/body/:root`; inspect bundle                         |
| Portal dialogs render outside scope tokens                | Portal container inside panel and settings tab; test dialog theme and focus           |
| React duplicate or wrong module ID                        | Externalize the four baseline modules; VM test asserts `require` IDs                  |
| DSH slot height/scroll breaks detail views                | Native frame owns height; CSS override for `.cr-content`; test at 320/768px           |
| Settings tab missing in older DSH                         | Registration is additive via `ctx.slots.inject`; standalone Settings remains          |
| Store conflict if standalone and embedded daemon both run | Document one-writer rule; current external mode is unaffected                         |
| Direct DOM lookups fail under isolation                   | Keep light DOM; no Shadow DOM                                                         |
| Theme changes while panel open                            | Scope-only MutationObserver on `body[data-ds-dark-theme]`                             |
