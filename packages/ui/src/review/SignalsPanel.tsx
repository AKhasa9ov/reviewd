import { Badge, EmptyState } from '../primitives/Feedback.js';
import type { ReviewSignal } from './model.js';

export interface SignalsPanelProps {
  signals: readonly ReviewSignal[];
  onJump: (signal: ReviewSignal) => void;
}

function toneLabel(tone: ReviewSignal['tone']): string {
  if (tone === 'danger') return 'high';
  if (tone === 'warning') return 'medium';
  return 'info';
}

export function SignalsPanel({ signals, onJump }: SignalsPanelProps): JSX.Element {
  if (signals.length === 0) {
    return (
      <EmptyState
        title="No signals"
        description="No deterministic risk patterns were found in this diff: tests, migrations, secrets, lockfiles and binary changes are checked."
      />
    );
  }
  return (
    <div className="cr-signals">
      <div className="cr-signals-head">
        <h2 className="cr-card-title">Deterministic signals</h2>
        <span className="cr-meta">{signals.length} patterns found</span>
      </div>
      <p className="cr-meta cr-signals-note">
        Signals are heuristics, not verdicts. Use them to decide where to look first.
      </p>
      <ul className="cr-signal-list" aria-label="Review signals">
        {signals.map((signal) => (
          <li className="cr-signal" key={signal.id} data-tone={signal.tone}>
            <span className="cr-signal-mark" aria-hidden="true">
              {signal.tone === 'danger' ? '!' : signal.tone === 'warning' ? '▲' : '•'}
            </span>
            <div className="cr-signal-main">
              <div className="cr-signal-title-row">
                <strong>{signal.label}</strong>
                <Badge
                  tone={
                    signal.tone === 'danger'
                      ? 'danger'
                      : signal.tone === 'warning'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {toneLabel(signal.tone)}
                </Badge>
              </div>
              <p className="cr-meta">{signal.detail}</p>
            </div>
            {signal.file !== undefined ? (
              <button type="button" className="cr-link-button" onClick={() => onJump(signal)}>
                {signal.file}
                {signal.line !== undefined ? `:${signal.line}` : ''}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
