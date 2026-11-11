import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, RepositorySetting } from '@sir_yami/reviewd-ui';
import {
  PortalContainerProvider,
  ThemeProvider,
  ToastProvider,
  createApiClient,
} from '@sir_yami/reviewd-ui';
import { FolderPickerDialog } from '../../../web/src/pages/FolderPickerDialog.js';
import { ErrorBoundary } from './ErrorBoundary.js';

export interface SettingsSectionProps {
  client?: ApiClient;
}

interface DraftRepository extends RepositorySetting {
  key: number;
}

interface DraftErrors {
  name?: string;
  path?: string;
}

interface PickerState {
  key: number;
  path: string;
}

const BRANCH_DEBOUNCE_MS = 300;

function readHostTheme(): 'light' | 'dark' {
  return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
}

function FolderGlyph(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5c0-.55.45-1 1-1h2.6c.27 0 .52.1.7.29l.72.71h5c.55 0 1 .45 1 1v5.5c0 .55-.45 1-1 1h-9c-.55 0-1-.45-1-1v-6.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface NativeBranchSelectProps {
  client: ApiClient;
  id: string;
  path: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function NativeBranchSelect({
  client,
  id,
  path,
  value,
  disabled,
  onChange,
}: NativeBranchSelectProps): JSX.Element {
  const [branches, setBranches] = useState<{ path: string; values: string[] } | null>(null);
  const [failure, setFailure] = useState<{ path: string; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const trimmedPath = path.trim();
  const values = branches?.path === trimmedPath ? branches.values : null;
  const error = failure?.path === trimmedPath ? failure.message : null;
  const loading = trimmedPath !== '' && values === null && error === null;

  useEffect(() => {
    if (trimmedPath === '') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client
        .listBranches(trimmedPath, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setBranches({ path: trimmedPath, values: result.branches });
          setFailure(null);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setBranches(null);
          setFailure({
            path: trimmedPath,
            message: caught instanceof Error ? caught.message : 'Could not load git branches.',
          });
        });
    }, BRANCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, trimmedPath, retryKey]);

  let options: Array<{ value: string; label: string }>;
  let selectDisabled = disabled;
  if (trimmedPath === '') {
    options = [{ value: '', label: 'No default branch' }];
    selectDisabled = true;
  } else if (loading) {
    options = [{ value, label: 'Loading branches…' }];
    selectDisabled = true;
  } else if (error !== null) {
    options = [{ value, label: value === '' ? 'Branches unavailable' : value }];
    selectDisabled = true;
  } else {
    const available = values ?? [];
    options = [{ value: '', label: 'No default branch' }];
    if (value !== '' && !available.includes(value)) {
      options.push({ value, label: `${value} (saved)` });
    }
    for (const branch of available) options.push({ value: branch, label: branch });
  }

  return (
    <div className="cr-dsh-field">
      <label className="cr-dsh-label" htmlFor={id}>
        Default branch
      </label>
      <div className="cr-dsh-inline">
        <select
          id={id}
          className="cr-dsh-input cr-dsh-select"
          value={value}
          disabled={selectDisabled}
          aria-invalid={error === null ? undefined : true}
          aria-busy={loading || undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error === null ? null : (
          <button
            type="button"
            className="cr-dsh-retry"
            disabled={disabled}
            title={`Could not load branches: ${error}`}
            onClick={() => {
              setFailure(null);
              setRetryKey((current) => current + 1);
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsSection({ client }: SettingsSectionProps): JSX.Element {
  const scopeRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const activeClient = useMemo(
    () => client ?? createApiClient({ baseUrl: '/api/code-review' }),
    [client],
  );
  const [drafts, setDrafts] = useState<DraftRepository[]>([]);
  const [errors, setErrors] = useState<Record<number, DraftErrors>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const nextKeyRef = useRef(1);
  const savingRef = useRef(false);

  function nextKey(): number {
    const key = nextKeyRef.current;
    nextKeyRef.current += 1;
    return key;
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void activeClient
      .listRepositories()
      .then((result) => {
        if (controller.signal.aborted) return;
        nextKeyRef.current = result.repositories.length + 1;
        setDrafts(
          result.repositories.map((repository, index) => ({
            ...repository,
            key: index + 1,
          })),
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load repositories.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeClient, reloadKey]);

  function update(key: number, patch: Partial<RepositorySetting>): void {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.key !== key) return draft;
        const pathChanged = patch.path !== undefined && patch.path !== draft.path;
        return {
          ...draft,
          ...patch,
          ...(pathChanged ? { defaultTarget: '' } : {}),
        };
      }),
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }

  function addRepository(): void {
    setDrafts((current) => [...current, { key: nextKey(), name: '', path: '', defaultTarget: '' }]);
    setNotice(null);
  }

  function chooseFolder(path: string, name: string): void {
    if (picker === null) return;
    const key = picker.key;
    setPicker(null);
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key
          ? {
              ...draft,
              path,
              ...(path === draft.path ? {} : { defaultTarget: '' }),
              name: draft.name.trim() === '' ? name : draft.name,
            }
          : draft,
      ),
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }

  function removeRepository(key: number): void {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  }

  async function save(): Promise<void> {
    if (savingRef.current) return;
    const nextErrors: Record<number, DraftErrors> = {};
    for (const draft of drafts) {
      const draftErrors: DraftErrors = {};
      if (draft.name.trim() === '') draftErrors.name = 'Repository name is required.';
      if (draft.path.trim() === '') draftErrors.path = 'Repository path is required.';
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
          ...(draft.defaultTarget === undefined || draft.defaultTarget.trim() === ''
            ? {}
            : { defaultTarget: draft.defaultTarget.trim() }),
        })),
      );
      setDrafts(
        result.repositories.map((repository, index) => ({
          ...repository,
          key: index + 1,
        })),
      );
      nextKeyRef.current = result.repositories.length + 1;
      setNotice('Repository settings saved.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save repository settings.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const saveDisabled = loading || saving || loadError !== null;

  return (
    <div
      ref={scopeRef}
      className="cr-native-scope cr-dsh-settings-scope"
      data-theme={readHostTheme()}
    >
      <ErrorBoundary title="Could not load repository settings">
        <ThemeProvider initialTheme={readHostTheme()} persist={false} targetRef={scopeRef}>
          <ToastProvider>
            <PortalContainerProvider container={portalRef}>
              <section className="cr-dsh-settings" aria-labelledby="cr-dsh-settings-title">
                <header className="cr-dsh-settings-head">
                  <div className="cr-dsh-settings-copy">
                    <h2 id="cr-dsh-settings-title">Repositories</h2>
                    <p>Local checkouts that reviewd may inspect. Paths resolve on the daemon.</p>
                  </div>
                  <button
                    type="button"
                    className="cr-dsh-button cr-dsh-button-primary"
                    disabled={saveDisabled}
                    onClick={() => void save()}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </header>

                {loadError !== null ? (
                  <div className="cr-dsh-banner cr-dsh-banner-error" role="alert">
                    <span>Could not load repositories: {loadError}</span>
                    <button
                      type="button"
                      className="cr-dsh-button"
                      onClick={() => setReloadKey((value) => value + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : loading ? (
                  <p className="cr-dsh-muted" role="status">
                    Loading repositories…
                  </p>
                ) : (
                  <form
                    className="cr-dsh-form"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save();
                    }}
                  >
                    {saveError !== null ? (
                      <p className="cr-dsh-banner cr-dsh-banner-error" role="alert">
                        Could not save repositories: {saveError}
                      </p>
                    ) : null}
                    {notice !== null ? (
                      <p className="cr-dsh-banner cr-dsh-banner-success" role="status">
                        {notice}
                      </p>
                    ) : null}

                    {drafts.length === 0 ? (
                      <div className="cr-dsh-empty">
                        <p>No repositories configured.</p>
                        <p className="cr-dsh-muted">
                          Add a checkout to start reviewing worktrees from it.
                        </p>
                      </div>
                    ) : (
                      <div className="cr-dsh-repos">
                        {drafts.map((draft, index) => {
                          const draftErrors = errors[draft.key] ?? {};
                          const label = draft.name.trim() || draft.path.trim() || index + 1;
                          return (
                            <div className="cr-dsh-repo" key={draft.key}>
                              <div className="cr-dsh-field">
                                <label className="cr-dsh-label" htmlFor={`repo-${draft.key}-name`}>
                                  Name
                                </label>
                                <input
                                  id={`repo-${draft.key}-name`}
                                  className="cr-dsh-input"
                                  value={draft.name}
                                  disabled={saving}
                                  placeholder="Checkout"
                                  onChange={(event) =>
                                    update(draft.key, { name: event.target.value })
                                  }
                                  aria-invalid={draftErrors.name === undefined ? undefined : true}
                                  aria-describedby={
                                    draftErrors.name === undefined
                                      ? undefined
                                      : `repo-${draft.key}-name-error`
                                  }
                                />
                                {draftErrors.name === undefined ? null : (
                                  <span
                                    className="cr-dsh-error"
                                    id={`repo-${draft.key}-name-error`}
                                    role="alert"
                                  >
                                    {draftErrors.name}
                                  </span>
                                )}
                              </div>

                              <div className="cr-dsh-field">
                                <label className="cr-dsh-label" htmlFor={`repo-${draft.key}-path`}>
                                  Path
                                </label>
                                <div className="cr-dsh-inline">
                                  <input
                                    id={`repo-${draft.key}-path`}
                                    className="cr-dsh-input cr-dsh-mono"
                                    value={draft.path}
                                    disabled={saving}
                                    placeholder="/srv/repos/checkout"
                                    autoComplete="off"
                                    spellCheck={false}
                                    onChange={(event) =>
                                      update(draft.key, { path: event.target.value })
                                    }
                                    aria-invalid={draftErrors.path === undefined ? undefined : true}
                                    aria-describedby={
                                      draftErrors.path === undefined
                                        ? undefined
                                        : `repo-${draft.key}-path-error`
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="cr-dsh-icon-button"
                                    aria-label={`Browse folders for repository ${label}`}
                                    title="Browse folders"
                                    disabled={saving}
                                    onClick={() =>
                                      setPicker({ key: draft.key, path: draft.path.trim() })
                                    }
                                  >
                                    <FolderGlyph />
                                  </button>
                                </div>
                                {draftErrors.path === undefined ? null : (
                                  <span
                                    className="cr-dsh-error"
                                    id={`repo-${draft.key}-path-error`}
                                    role="alert"
                                  >
                                    {draftErrors.path}
                                  </span>
                                )}
                              </div>

                              <NativeBranchSelect
                                client={activeClient}
                                id={`repo-${draft.key}-target`}
                                path={draft.path}
                                value={draft.defaultTarget ?? ''}
                                disabled={saving}
                                onChange={(value) => update(draft.key, { defaultTarget: value })}
                              />

                              <button
                                type="button"
                                className="cr-dsh-icon-button cr-dsh-remove"
                                aria-label={`Remove repository ${label}`}
                                title="Remove repository"
                                disabled={saving}
                                onClick={() => removeRepository(draft.key)}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="m4 4 8 8M12 4l-8 8"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button
                      type="button"
                      className="cr-dsh-add"
                      disabled={saving}
                      onClick={addRepository}
                    >
                      <span aria-hidden="true">+</span> Add repository
                    </button>
                  </form>
                )}
              </section>
              {picker !== null ? (
                <FolderPickerDialog
                  key={picker.key}
                  client={activeClient}
                  initialPath={picker.path === '' ? undefined : picker.path}
                  onClose={() => setPicker(null)}
                  onSelect={chooseFolder}
                />
              ) : null}
            </PortalContainerProvider>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
      <div ref={portalRef} />
    </div>
  );
}
