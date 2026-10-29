/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { createReviewReportTool, REVIEW_REPORT_TOOL_NAME } from '../src/report-tool.js';

describe('review_report tool', () => {
  it('publishes a tolerant schema for the complete report shape', () => {
    const tool = createReviewReportTool(vi.fn());
    expect(tool.name).toBe(REVIEW_REPORT_TOOL_NAME);
    expect(tool.parameters.required).toEqual(['summary', 'riskLevel', 'findings']);
    expect(tool.parameters.additionalProperties).toBe(true);
    expect(tool.parameters.properties.schemaVersion).toMatchObject({ type: 'integer', enum: [1] });
    expect(tool.parameters.properties.findings.items.required).toEqual([
      'severity',
      'file',
      'lineStart',
      'title',
      'evidence',
    ]);
    expect(tool.parameters.properties.findings.items.properties.severity.enum).toEqual([
      'blocker',
      'major',
      'minor',
      'nit',
    ]);
  });

  it('captures the typed report and normalizes a missing schemaVersion', async () => {
    const capture = vi.fn();
    const tool = createReviewReportTool(capture);

    const result = await tool.execute(
      { summary: 'looks good', riskLevel: 'low', findings: [] },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({ ok: true });
    expect(capture).toHaveBeenCalledWith({
      schemaVersion: 1,
      summary: 'looks good',
      riskLevel: 'low',
      findings: [],
    });
  });

  it('renders a short receipt instead of echoing the report', async () => {
    const tool = createReviewReportTool(vi.fn());
    const value = await tool.execute(
      { schemaVersion: 1, summary: 'ok', riskLevel: 'low', findings: [] },
      { signal: new AbortController().signal },
    );
    const rendered = tool.output.render({}, value) as Array<{ text: string }>;
    expect(JSON.parse(rendered[0]!.text)).toEqual({ ok: true, received: true });
  });
});
