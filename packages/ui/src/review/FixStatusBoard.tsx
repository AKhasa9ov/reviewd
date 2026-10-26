import type { FixGroup } from './model.js';
import { FIX_GROUPS } from './model.js';

export interface FixStatusBoardProps {
  counts: Record<FixGroup, number>;
  active: FixGroup | 'all';
  onFilter: (filter: FixGroup | 'all') => void;
  compact?: boolean;
}

export function FixStatusBoard({
  counts,
  active,
  onFilter,
  compact = false,
}: FixStatusBoardProps): JSX.Element {
  return (
    <div
      className={['cr-fix-board', compact ? 'cr-fix-board-compact' : ''].filter(Boolean).join(' ')}
    >
      <div className="cr-card-head">
        <span className="cr-card-title">Fix status</span>
        <span className="cr-meta">human + agent signals</span>
      </div>
      <div className="cr-fix-grid" role="group" aria-label="Filter comments by fix status">
        {FIX_GROUPS.map((group) => {
          const selected = active === group.id;
          return (
            <button
              type="button"
              key={group.id}
              className="cr-fix-cell"
              data-group={group.id}
              aria-pressed={selected}
              aria-label={`${group.label}: ${counts[group.id]} comments`}
              title={group.description}
              onClick={() => onFilter(selected ? 'all' : group.id)}
            >
              <span className="cr-fix-count">{counts[group.id]}</span>
              <span className="cr-fix-label">{group.label}</span>
            </button>
          );
        })}
      </div>
      {active !== 'all' ? (
        <button type="button" className="cr-link-button" onClick={() => onFilter('all')}>
          Clear filter
        </button>
      ) : null}
      {!compact ? (
        <p className="cr-meta cr-fix-note">
          Claims and reviewer verification are shown side by side. A human decision wins when set.
        </p>
      ) : null}
    </div>
  );
}
