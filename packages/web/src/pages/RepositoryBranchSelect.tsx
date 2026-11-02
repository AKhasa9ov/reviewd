import { useEffect, useState } from 'react';
import type { ApiClient, SelectOption } from '@sir_yami/reviewd-ui';
import { Button } from '@sir_yami/reviewd-ui';

const BRANCH_DEBOUNCE_MS = 300;

interface BranchData {
  path: string;
  branches: string[];
}

interface BranchError {
  path: string;
  message: string;
}

export interface RepositoryBranchSelectProps {
  client: ApiClient;
  id: string;
  path: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function RepositoryBranchSelect({
  client,
  id,
  path,
  value,
  disabled = false,
  onChange,
}: RepositoryBranchSelectProps): JSX.Element {
  const [data, setData] = useState<BranchData | null>(null);
  const [errorState, setErrorState] = useState<BranchError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const trimmedPath = path.trim();
  const branches = data?.path === trimmedPath ? data.branches : null;
  const error = errorState?.path === trimmedPath ? errorState.message : null;
  // Derived rather than effect-driven so a saved repo never flashes an enabled,
  // empty select before the first branch request starts.
  const loading = trimmedPath !== '' && branches === null && error === null;

  useEffect(() => {
    if (trimmedPath === '') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client
        .listBranches(trimmedPath, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setData({ path: trimmedPath, branches: result.branches });
          setErrorState(null);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setData(null);
          setErrorState({
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

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  let hint: string;
  let options: SelectOption[];
  let selectDisabled = disabled;

  if (trimmedPath === '') {
    hint = 'Choose a repository folder or enter its path first.';
    options = [{ value: '', label: 'Select a repository first' }];
    selectDisabled = true;
  } else if (loading) {
    hint = 'Loading git branches…';
    options = [{ value, label: 'Loading branches…' }];
    selectDisabled = true;
  } else if (error !== null) {
    hint = 'Could not load git branches.';
    options = [{ value, label: value === '' ? 'Branches unavailable' : value }];
    selectDisabled = true;
  } else {
    const available = branches ?? [];
    options = [{ value: '', label: 'No default branch' }];
    if (value !== '' && !available.includes(value)) {
      options.push({ value, label: `${value} (saved)` });
    }
    for (const branch of available) options.push({ value: branch, label: branch });
    hint =
      available.length === 0
        ? 'This repository has no branches yet.'
        : 'Preselected when starting a review.';
  }

  return (
    <div className="cr-field">
      <label className="cr-label" htmlFor={id}>
        Default target branch
      </label>
      <select
        id={id}
        className="cr-select cr-mono"
        value={value}
        disabled={selectDisabled}
        aria-invalid={error === null ? undefined : true}
        aria-busy={loading || undefined}
        aria-describedby={error === null ? hintId : errorId}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error === null ? (
        <span className="cr-hint" id={hintId}>
          {hint}
        </span>
      ) : (
        <div className="cr-branch-feedback">
          <span className="cr-error" id={errorId} role="alert">
            {hint} {error}
          </span>
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setErrorState(null);
              setRetryKey((current) => current + 1);
            }}
          >
            Retry branches
          </Button>
        </div>
      )}
    </div>
  );
}
