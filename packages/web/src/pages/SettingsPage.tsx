import { useEffect, useRef, useState } from 'react';
import type { ApiClient, RepositorySetting } from '@dsh-code-review/ui';
import { Button, FolderIcon, IconButton, Tooltip } from '@dsh-code-review/ui';
import { ErrorPanel, PageHeader } from '../components.js';
import { FolderPickerDialog } from './FolderPickerDialog.js';
import { RepositoryBranchSelect } from './RepositoryBranchSelect.js';

interface DraftRepository extends RepositorySetting {
  key: number;
}

interface DraftErrors {
  name?: string;
  path?: string;
}

export interface SettingsPageProps {
  client: ApiClient;
}

export function SettingsPage({ client }: SettingsPageProps): JSX.Element {
  const [drafts, setDrafts] = useState<DraftRepository[]>([]);
  const [errors, setErrors] = useState<Record<number, DraftErrors>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [picker, setPicker] = useState<{ key: number; path: string } | null>(null);
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
    void client
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
  }, [client, reloadKey]);

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
      const result = await client.saveRepositories(
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

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Repositories"
        description="Register the local checkouts that reviewd may inspect. Paths are resolved on the daemon."
        actions={
          <Button
            type="button"
            loading={saving}
            disabled={loading || saving || loadError !== null}
            onClick={() => void save()}
          >
            Save repositories
          </Button>
        }
      />

      {loadError !== null ? (
        <ErrorPanel
          title="Could not load repositories"
          message={loadError}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <p className="cr-muted" role="status">
          Loading repositories…
        </p>
      ) : (
        <form
          className="cr-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          noValidate
        >
          {saveError !== null ? (
            <ErrorPanel title="Could not save repositories" message={saveError} />
          ) : null}
          {notice !== null ? (
            <p className="cr-settings-notice" role="status">
              {notice}
            </p>
          ) : null}
          {drafts.length === 0 ? (
            <div className="cr-empty">
              <h2>No repositories yet</h2>
              <p>Add a checkout to start reviewing merge requests from it.</p>
              <Button type="button" variant="secondary" onClick={addRepository}>
                Add repository
              </Button>
            </div>
          ) : (
            <ol className="cr-repo-list">
              {drafts.map((draft, index) => {
                const draftErrors = errors[draft.key] ?? {};
                return (
                  <li className="cr-repo-row" key={draft.key}>
                    <div className="cr-repo-fields">
                      <div className="cr-field">
                        <label className="cr-label" htmlFor={`repo-${draft.key}-name`}>
                          Repository name
                        </label>
                        <input
                          id={`repo-${draft.key}-name`}
                          className="cr-input"
                          value={draft.name}
                          disabled={saving}
                          onChange={(event) => update(draft.key, { name: event.target.value })}
                          placeholder="Checkout"
                          aria-invalid={draftErrors.name === undefined ? undefined : true}
                          aria-describedby={
                            draftErrors.name === undefined
                              ? undefined
                              : `repo-${draft.key}-name-error`
                          }
                        />
                        {draftErrors.name !== undefined ? (
                          <span
                            className="cr-error"
                            id={`repo-${draft.key}-name-error`}
                            role="alert"
                          >
                            {draftErrors.name}
                          </span>
                        ) : null}
                      </div>
                      <div className="cr-field">
                        <label className="cr-label" htmlFor={`repo-${draft.key}-path`}>
                          Path on daemon
                        </label>
                        <div className="cr-path-control">
                          <input
                            id={`repo-${draft.key}-path`}
                            className="cr-input cr-mono"
                            value={draft.path}
                            disabled={saving}
                            onChange={(event) => update(draft.key, { path: event.target.value })}
                            placeholder="/srv/repos/checkout"
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={draftErrors.path === undefined ? undefined : true}
                            aria-describedby={
                              draftErrors.path === undefined
                                ? undefined
                                : `repo-${draft.key}-path-error`
                            }
                          />
                          <Tooltip label="Browse folders">
                            <IconButton
                              label={`Browse folders for repository ${
                                draft.name.trim() || draft.path.trim() || index + 1
                              }`}
                              className="cr-path-browse"
                              disabled={saving}
                              onClick={() => setPicker({ key: draft.key, path: draft.path.trim() })}
                            >
                              <FolderIcon />
                            </IconButton>
                          </Tooltip>
                        </div>
                        {draftErrors.path !== undefined ? (
                          <span
                            className="cr-error"
                            id={`repo-${draft.key}-path-error`}
                            role="alert"
                          >
                            {draftErrors.path}
                          </span>
                        ) : null}
                      </div>
                      <RepositoryBranchSelect
                        client={client}
                        id={`repo-${draft.key}-target`}
                        path={draft.path}
                        value={draft.defaultTarget ?? ''}
                        disabled={saving}
                        onChange={(value) => update(draft.key, { defaultTarget: value })}
                      />
                    </div>
                    <Button
                      type="button"
                      className="cr-repo-remove"
                      variant="secondary"
                      onClick={() => removeRepository(draft.key)}
                      disabled={saving}
                      aria-label={`Remove repository ${draft.name.trim() || draft.path.trim() || index + 1}`}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
          {drafts.length > 0 ? (
            <Button type="button" variant="secondary" onClick={addRepository} disabled={saving}>
              Add repository
            </Button>
          ) : null}
        </form>
      )}
      {picker !== null ? (
        <FolderPickerDialog
          key={picker.key}
          client={client}
          initialPath={picker.path === '' ? undefined : picker.path}
          onClose={() => setPicker(null)}
          onSelect={chooseFolder}
        />
      ) : null}
    </>
  );
}
