import { useEffect, useRef, useState } from 'react';
import type { ApiClient, DirectoryListing } from '@dsh-code-review/ui';
import { Button, Dialog, Input } from '@dsh-code-review/ui';
import { ErrorPanel } from '../components.js';

export interface FolderPickerDialogProps {
  client: ApiClient;
  initialPath?: string | undefined;
  onClose: () => void;
  onSelect: (path: string, name: string) => void;
}

export function FolderPickerDialog({
  client,
  initialPath,
  onClose,
  onSelect,
}: FolderPickerDialogProps): JSX.Element {
  const [path, setPath] = useState<string | undefined>(
    initialPath !== undefined && initialPath.trim() !== '' ? initialPath.trim() : undefined,
  );
  const [typedPath, setTypedPath] = useState(initialPath?.trim() ?? '');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void client
      .listDirectories(path, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setListing(result);
        // Do not clobber a path the user is still typing while the listing loads.
        setTypedPath((current) =>
          document.activeElement === pathInputRef.current ? current : result.path,
        );
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setListing(null);
        setError(caught instanceof Error ? caught.message : 'Could not read this folder.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, path, requestKey]);

  function openTypedPath(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = typedPath.trim();
    if (next === '') {
      setPath(undefined);
      setRequestKey((value) => value + 1);
      return;
    }
    setPath(next);
    setRequestKey((value) => value + 1);
  }

  const isGitRepository = listing?.entries.some((entry) => entry.name === '.git') ?? false;
  const subfolders = listing?.entries.filter((entry) => entry.name !== '.git') ?? [];

  function selectCurrent(): void {
    if (listing === null) return;
    const last = listing.breadcrumbs[listing.breadcrumbs.length - 1]?.name;
    onSelect(listing.path, last === undefined || last === '/' ? '' : last);
  }

  return (
    <Dialog
      open
      title="Choose a repository folder"
      description="Browse folders on the daemon. A folder is valid when it contains a checkout with a .git entry."
      onClose={onClose}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={selectCurrent} disabled={listing === null || loading}>
            Use this folder
          </Button>
        </>
      }
    >
      <form className="cr-folder-path-form" onSubmit={openTypedPath}>
        <Input
          label="Folder path"
          ref={pathInputRef}
          value={typedPath}
          onChange={(event) => setTypedPath(event.target.value)}
          placeholder="/home/user/repositories"
          autoComplete="off"
          spellCheck={false}
          className="cr-mono"
        />
        <Button type="submit" variant="secondary">
          Open
        </Button>
      </form>

      <div className="cr-folder-nav">
        <Button
          type="button"
          size="small"
          variant="secondary"
          disabled={listing?.parent === null || listing?.parent === undefined}
          onClick={() => {
            if (listing?.parent !== null && listing?.parent !== undefined) {
              setPath(listing.parent);
            }
          }}
        >
          Up
        </Button>
        <nav className="cr-folder-breadcrumbs" aria-label="Breadcrumb">
          {listing?.breadcrumbs.map((crumb, index) => {
            const last = index === listing.breadcrumbs.length - 1;
            return (
              <span className="cr-folder-crumb" key={crumb.path}>
                {index > 0 ? (
                  <span aria-hidden="true" className="cr-folder-separator">
                    /
                  </span>
                ) : null}
                <button
                  type="button"
                  className="cr-folder-crumb-button"
                  aria-current={last ? 'location' : undefined}
                  onClick={() => setPath(crumb.path)}
                >
                  {crumb.name}
                </button>
              </span>
            );
          })}
        </nav>
        {isGitRepository ? <span className="cr-folder-git-badge">git repo</span> : null}
      </div>

      {error !== null ? (
        <ErrorPanel
          title="Could not open this folder"
          message={error}
          retryLabel="Go to home"
          onRetry={() => {
            setPath(undefined);
            setRequestKey((value) => value + 1);
          }}
        />
      ) : loading && listing === null ? (
        <p className="cr-muted" role="status">
          Reading folders…
        </p>
      ) : listing === null ? null : subfolders.length === 0 ? (
        <p className="cr-muted">This folder has no subfolders. You can still choose it.</p>
      ) : (
        <ul className="cr-folder-list" aria-label="Folders">
          {subfolders.map((entry) => (
            <li key={entry.path}>
              <button type="button" className="cr-folder-entry" onClick={() => setPath(entry.path)}>
                <span className="cr-folder-entry-name">{entry.name}</span>
                {entry.isGit ? <span className="cr-folder-git-badge">git repo</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {listing?.truncated === true ? (
        <p className="cr-hint">Showing the first 500 folders. Type a path to jump deeper.</p>
      ) : null}
    </Dialog>
  );
}
