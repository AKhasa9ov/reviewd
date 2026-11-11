import { useEffect, useRef, useState } from 'react';
import type { ApiClient, DirectoryListing } from '@sir_yami/reviewd-ui';

export interface NativeFolderPickerProps {
  client: ApiClient;
  initialPath?: string | undefined;
  onClose: () => void;
  onSelect: (path: string, name: string) => void;
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

export function NativeFolderPicker({
  client,
  initialPath,
  onClose,
  onSelect,
}: NativeFolderPickerProps): JSX.Element {
  const [path, setPath] = useState<string | undefined>(
    initialPath !== undefined && initialPath.trim() !== '' ? initialPath.trim() : undefined,
  );
  const [typedPath, setTypedPath] = useState(initialPath?.trim() ?? '');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
    <div
      className="cr-dsh-picker-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="cr-dsh-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cr-dsh-picker-title"
        tabIndex={-1}
      >
        <header className="cr-dsh-picker-head">
          <div>
            <h2 id="cr-dsh-picker-title">Choose a repository folder</h2>
            <p>A folder is valid when it contains a checkout with a .git entry.</p>
          </div>
          <button
            type="button"
            className="cr-dsh-icon-button"
            aria-label="Close folder picker"
            title="Close"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="m4 4 8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form className="cr-dsh-picker-path" onSubmit={openTypedPath}>
          <label className="cr-dsh-label" htmlFor="cr-dsh-picker-path">
            Path
          </label>
          <div className="cr-dsh-inline">
            <input
              id="cr-dsh-picker-path"
              ref={pathInputRef}
              className="cr-dsh-input cr-dsh-mono"
              value={typedPath}
              onChange={(event) => setTypedPath(event.target.value)}
              placeholder="/home/user/repositories"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="cr-dsh-button">
              Open
            </button>
          </div>
        </form>

        <div className="cr-dsh-picker-nav">
          <button
            type="button"
            className="cr-dsh-button cr-dsh-button-quiet"
            disabled={listing?.parent === null || listing?.parent === undefined}
            onClick={() => {
              if (listing?.parent !== null && listing?.parent !== undefined) {
                setPath(listing.parent);
              }
            }}
          >
            Up
          </button>
          <nav className="cr-dsh-breadcrumbs" aria-label="Breadcrumb">
            {listing?.breadcrumbs.map((crumb, index) => {
              const last = index === listing.breadcrumbs.length - 1;
              return (
                <span className="cr-dsh-crumb" key={crumb.path}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="cr-dsh-crumb-separator">
                      /
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="cr-dsh-crumb-button"
                    aria-current={last ? 'location' : undefined}
                    onClick={() => setPath(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                </span>
              );
            })}
          </nav>
          {isGitRepository ? <span className="cr-dsh-badge">git repo</span> : null}
        </div>

        <div className="cr-dsh-picker-list">
          {error !== null ? (
            <div className="cr-dsh-picker-state" role="alert">
              <span>Could not open this folder: {error}</span>
              <button
                type="button"
                className="cr-dsh-button"
                onClick={() => {
                  setPath(undefined);
                  setRequestKey((value) => value + 1);
                }}
              >
                Go to home
              </button>
            </div>
          ) : loading && listing === null ? (
            <p className="cr-dsh-muted" role="status">
              Reading folders…
            </p>
          ) : listing === null ? null : subfolders.length === 0 ? (
            <p className="cr-dsh-muted">This folder has no subfolders. You can still choose it.</p>
          ) : (
            <ul className="cr-dsh-picker-entries" aria-label="Folders">
              {subfolders.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    className="cr-dsh-picker-entry"
                    onClick={() => setPath(entry.path)}
                  >
                    <FolderGlyph />
                    <span className="cr-dsh-picker-entry-name">{entry.name}</span>
                    {entry.isGit ? <span className="cr-dsh-badge">git repo</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {listing?.truncated === true ? (
          <p className="cr-dsh-muted cr-dsh-picker-hint">
            Showing the first 500 folders. Type a path to jump deeper.
          </p>
        ) : null}

        <footer className="cr-dsh-picker-actions">
          <button type="button" className="cr-dsh-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cr-dsh-button cr-dsh-button-primary"
            disabled={listing === null || loading}
            onClick={selectCurrent}
          >
            Use this folder
          </button>
        </footer>
      </div>
    </div>
  );
}
