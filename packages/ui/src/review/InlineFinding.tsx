import { useId, useState } from 'react';
import type { Finding, FindingDecision } from '@sir_yami/reviewd-core';
import { Badge } from '../primitives/Feedback.js';
import { FindingDecisionControls } from './FindingDecisionControls.js';
import type { FindingDecisionControlsProps } from './FindingDecisionControls.js';

export function severityLetter(severity: Finding['severity']): string {
  return severity === 'blocker'
    ? 'B'
    : severity === 'major'
      ? 'M'
      : severity === 'minor'
        ? 'm'
        : 'n';
}

export function severityTone(
  severity: Finding['severity'],
): 'danger' | 'warning' | 'info' | 'neutral' {
  return severity === 'blocker'
    ? 'danger'
    : severity === 'major'
      ? 'warning'
      : severity === 'minor'
        ? 'info'
        : 'neutral';
}

export interface InlineFindingProps {
  finding: Finding;
  decision?: FindingDecision | undefined;
  readOnly?: boolean;
  pending?: boolean;
  error?: string | null;
  onDecide?: FindingDecisionControlsProps['onDecide'];
  onOpenFinding?: ((finding: Finding) => void) | undefined;
}

export function InlineFinding({
  finding,
  decision,
  readOnly = false,
  pending = false,
  error,
  onDecide,
  onOpenFinding,
}: InlineFindingProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `finding-body-${useId()}`;
  const lines =
    finding.lineStart === finding.lineEnd
      ? `line ${finding.lineStart}`
      : `lines ${finding.lineStart}–${finding.lineEnd}`;

  return (
    <article
      role="cell"
      className={[
        'cr-inline-finding',
        `cr-risk-${finding.severity}`,
        expanded ? 'cr-inline-finding-expanded' : 'cr-inline-finding-collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${finding.severity} finding: ${finding.title}`}
    >
      <button
        type="button"
        className="cr-inline-finding-header"
        aria-expanded={expanded}
        aria-controls={expanded ? bodyId : undefined}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} finding ${finding.title}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="cr-inline-finding-toggle" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="cr-inline-finding-severity" aria-hidden="true">
          {severityLetter(finding.severity)}
        </span>
        <span className="cr-inline-finding-main">
          <span className="cr-inline-finding-head">
            <strong>{finding.title}</strong>
            <span className="cr-meta">
              {finding.category} · {lines} · agent
            </span>
          </span>
        </span>
      </button>
      {expanded ? (
        <div className="cr-inline-finding-body" id={bodyId}>
          <p className="cr-inline-finding-rationale">{finding.rationale}</p>
          {finding.evidence.trim() !== '' || finding.suggestion !== undefined ? (
            <details className="cr-inline-finding-details">
              <summary>Evidence and suggestion</summary>
              {finding.evidence.trim() !== '' ? (
                <pre className="cr-inline-finding-evidence">{finding.evidence}</pre>
              ) : null}
              {finding.suggestion !== undefined ? (
                <div className="cr-inline-finding-suggestion">
                  <span className="cr-suggestion-caption">Suggested change</span>
                  <pre>{finding.suggestion.replacement}</pre>
                </div>
              ) : null}
            </details>
          ) : null}
          <div className="cr-inline-finding-actions">
            <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
            {onOpenFinding !== undefined ? (
              <button
                type="button"
                className="cr-link-button"
                onClick={() => onOpenFinding(finding)}
              >
                Open in report
              </button>
            ) : null}
          </div>
          {onDecide !== undefined ? (
            <FindingDecisionControls
              finding={finding}
              decision={decision}
              readOnly={readOnly}
              pending={pending}
              error={error ?? null}
              onDecide={onDecide}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
