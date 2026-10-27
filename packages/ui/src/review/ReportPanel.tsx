import { useState } from 'react';
import type {
  AgentReport,
  Finding,
  FindingDecision,
  FindingDecisionState,
} from '@dsh-code-review/core';
import { Badge, EmptyState } from '../primitives/Feedback.js';
import { Select } from '../primitives/Field.js';
import { FindingDecisionControls } from './FindingDecisionControls.js';
import { findingCounts, filterFindings } from './model.js';

const SEVERITIES: Array<Finding['severity'] | 'all'> = ['all', 'blocker', 'major', 'minor', 'nit'];
const CATEGORIES: Array<Finding['category'] | 'all'> = [
  'all',
  'security',
  'correctness',
  'tests',
  'performance',
  'maintainability',
  'api',
  'concurrency',
  'docs',
  'other',
];

function severityTone(severity: Finding['severity']): 'danger' | 'warning' | 'info' | 'neutral' {
  if (severity === 'blocker') return 'danger';
  if (severity === 'major') return 'warning';
  if (severity === 'minor') return 'info';
  return 'neutral';
}

function riskTone(risk: string): 'danger' | 'warning' | 'success' | 'neutral' {
  if (risk === 'critical') return 'danger';
  if (risk === 'high') return 'warning';
  if (risk === 'low') return 'success';
  return 'neutral';
}

export interface ReportPanelProps {
  report: AgentReport | null | undefined;
  onJump: (location: { file: string; lineStart: number; lineEnd: number }) => void;
  onJumpComment?: (commentId: string) => void;
  decisions?: ReadonlyMap<string, FindingDecision>;
  canDecide?: boolean;
  onDecide?: (finding: Finding, state: FindingDecisionState) => void;
}

const EMPTY_DECISIONS = new Map<string, FindingDecision>();

export function ReportPanel({
  report,
  onJump,
  onJumpComment,
  decisions = EMPTY_DECISIONS,
  canDecide = false,
  onDecide,
}: ReportPanelProps): JSX.Element {
  const [severity, setSeverity] = useState<Finding['severity'] | 'all'>('all');
  const [category, setCategory] = useState<Finding['category'] | 'all'>('all');

  if (report === null || report === undefined) {
    return (
      <EmptyState
        title="No reviewer report"
        description="The reviewer has not produced a report for this review. Findings appear here when the agent finishes."
      />
    );
  }

  const findings = filterFindings(report.findings, severity, category);
  const counts = findingCounts(report);
  const filtered = severity !== 'all' || category !== 'all';

  return (
    <div className="cr-report">
      <section className="cr-report-summary" aria-label="Reviewer summary">
        <div className="cr-report-summary-head">
          <h2 className="cr-card-title">Reviewer summary</h2>
          <Badge tone={riskTone(report.riskLevel)}>{report.riskLevel} risk</Badge>
          {report.skipped === true ? <Badge tone="neutral">skipped</Badge> : null}
        </div>
        <p className="cr-report-copy">{report.summary}</p>
        <div className="cr-report-counts">
          {counts.blocker > 0 ? <Badge tone="danger">{counts.blocker} blocker</Badge> : null}
          {counts.major > 0 ? <Badge tone="warning">{counts.major} major</Badge> : null}
          {counts.minor > 0 ? <Badge tone="info">{counts.minor} minor</Badge> : null}
          {counts.nit > 0 ? <Badge tone="neutral">{counts.nit} nit</Badge> : null}
          {report.tests.ran ? (
            <Badge
              tone={
                report.tests.commands.some((item) => item.result === 'fail') ? 'danger' : 'success'
              }
            >
              tests ran
            </Badge>
          ) : (
            <Badge tone="neutral">tests not run</Badge>
          )}
        </div>
        {report.dirtyWorktree === true ? (
          <p className="cr-notice cr-notice-warning">
            The reviewer changed the worktree during the run. Inspect it before merging.
          </p>
        ) : null}
        {report.warnings.length > 0 ? (
          <ul className="cr-report-warnings" aria-label="Reviewer warnings">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="cr-report-toolbar">
        <Select
          label="Severity"
          options={SEVERITIES.map((value) => ({
            value,
            label: value === 'all' ? 'All severities' : value,
          }))}
          value={severity}
          onChange={(event) => setSeverity(event.target.value as Finding['severity'] | 'all')}
        />
        <Select
          label="Category"
          options={CATEGORIES.map((value) => ({
            value,
            label: value === 'all' ? 'All categories' : value,
          }))}
          value={category}
          onChange={(event) => setCategory(event.target.value as Finding['category'] | 'all')}
        />
        <span className="cr-meta" aria-live="polite">
          {findings.length} of {report.findings.length} findings
        </span>
        {filtered ? (
          <button
            type="button"
            className="cr-link-button"
            onClick={() => {
              setSeverity('all');
              setCategory('all');
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {findings.length === 0 ? (
        <EmptyState
          title={filtered ? 'No findings match these filters' : 'No findings'}
          description={
            filtered
              ? 'Clear the severity or category filter to see the reviewer report.'
              : 'The reviewer did not report any issues for this round.'
          }
        />
      ) : (
        <ol className="cr-findings" aria-label="Reviewer findings">
          {findings.map((finding) => (
            <li className="cr-finding" key={finding.id} id={`finding-${finding.id}`} tabIndex={-1}>
              <div className="cr-finding-head">
                <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
                <Badge tone="neutral">{finding.category}</Badge>
                {finding.kind !== 'issue' ? <Badge tone="info">{finding.kind}</Badge> : null}
                <button
                  type="button"
                  className="cr-finding-location"
                  onClick={() => onJump(finding)}
                  aria-label={`Jump to ${finding.file} line ${finding.lineStart}`}
                >
                  {finding.file}:{finding.lineStart}
                </button>
                <span className="cr-meta">{finding.confidence} confidence</span>
              </div>
              <h3 className="cr-finding-title">{finding.title}</h3>
              <p className="cr-finding-copy">{finding.rationale}</p>
              {finding.evidence !== '' ? (
                <pre className="cr-evidence" aria-label="Evidence">
                  {finding.evidence}
                </pre>
              ) : null}
              {finding.suggestion !== undefined ? (
                <div className="cr-suggestion" aria-label="Finding suggestion">
                  <div className="cr-suggestion-head">
                    <span className="cr-suggestion-label">Suggested change</span>
                    {finding.unanchored === true ? <Badge tone="warning">unanchored</Badge> : null}
                  </div>
                  <div className="cr-suggestion-block cr-suggestion-old">
                    <span className="cr-suggestion-caption">Before</span>
                    <pre>{finding.suggestion.original}</pre>
                  </div>
                  <div className="cr-suggestion-block cr-suggestion-new">
                    <span className="cr-suggestion-caption">After</span>
                    <pre>{finding.suggestion.replacement}</pre>
                  </div>
                </div>
              ) : null}
              <FindingDecisionControls
                finding={finding}
                decision={decisions.get(finding.id)}
                readOnly={!canDecide || onDecide === undefined}
                onDecide={onDecide ?? (() => undefined)}
              />
            </li>
          ))}
        </ol>
      )}

      {report.questions.length > 0 ? (
        <section className="cr-report-section" aria-label="Open questions">
          <h2 className="cr-card-title">Questions</h2>
          <ul className="cr-question-list">
            {report.questions.map((question) => (
              <li key={question.id}>
                <button
                  type="button"
                  className="cr-link-button"
                  onClick={() =>
                    onJump({
                      file: question.file,
                      lineStart: question.line,
                      lineEnd: question.line,
                    })
                  }
                >
                  {question.file}:{question.line}
                </button>
                <strong>{question.question}</strong>
                <p className="cr-meta">{question.why}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.verification.length > 0 ? (
        <section className="cr-report-section" aria-label="Reviewer verification">
          <h2 className="cr-card-title">Verification</h2>
          <ul className="cr-verification-list">
            {report.verification.map((item) => (
              <li key={item.commentId}>
                <Badge
                  tone={
                    item.status === 'fixed'
                      ? 'success'
                      : item.status === 'not-fixed'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {item.status}
                </Badge>
                {onJumpComment !== undefined ? (
                  <button
                    type="button"
                    className="cr-link-button"
                    onClick={() => onJumpComment(item.commentId)}
                  >
                    {item.commentId}
                  </button>
                ) : (
                  <span className="cr-mono">{item.commentId}</span>
                )}
                <span className="cr-meta">{item.evidence}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.tests.commands.length > 0 ? (
        <section className="cr-report-section" aria-label="Reviewer test commands">
          <h2 className="cr-card-title">Tests</h2>
          <ul className="cr-test-list">
            {report.tests.commands.map((command) => (
              <li key={command.command}>
                <Badge
                  tone={
                    command.result === 'pass'
                      ? 'success'
                      : command.result === 'fail'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {command.result}
                </Badge>
                <span className="cr-mono">{command.command}</span>
                <span className="cr-meta">{command.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
