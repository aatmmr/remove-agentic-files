import * as core from '@actions/core';
import type { SummaryMode } from './inputs.js';
import type { PatternResult, RemoveResult } from './remove.js';

/** One row of the report table. */
export interface ReportRow {
  readonly pattern: string;
  readonly matches: string;
  readonly result: string;
}

/** Make the result text of one pattern. */
export function statusText(result: PatternResult, dryRun: boolean): string {
  if (result.matches.length === 0) {
    return 'no match';
  }

  const parts: string[] = [];
  if (result.deleted.length > 0) {
    parts.push(dryRun ? `${result.deleted.length} to remove` : `${result.deleted.length} removed`);
  }
  if (result.skipped.length > 0) {
    parts.push(`${result.skipped.length} kept`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no change';
}

/** Make the rows of the report table. */
export function buildRows(result: RemoveResult): ReportRow[] {
  return result.patterns.map((pattern) => ({
    pattern: pattern.pattern,
    matches: String(pattern.matches.length),
    result: statusText(pattern, result.dryRun),
  }));
}

/** Make a plain text table with aligned columns. */
export function renderTextTable(rows: readonly ReportRow[]): string {
  const header: ReportRow = { pattern: 'Pattern', matches: 'Matches', result: 'Result' };
  const all = [header, ...rows];
  const widthPattern = Math.max(...all.map((row) => row.pattern.length));
  const widthMatches = Math.max(...all.map((row) => row.matches.length));

  const line = (row: ReportRow): string =>
    ` ${row.pattern.padEnd(widthPattern)}  ${row.matches.padStart(widthMatches)}  ${row.result}`;

  const separator = ` ${'-'.repeat(widthPattern)}  ${'-'.repeat(widthMatches)}  ------`;
  return [line(header), separator, ...rows.map(line)].join('\n');
}

/** Make the final line of the report. */
export function totalsText(result: RemoveResult): string {
  const count = result.deleted.length;
  const noun = count === 1 ? 'path' : 'paths';
  if (result.dryRun) {
    return `Dry run: ${count} ${noun} would be removed.`;
  }
  return `Removed ${count} ${noun}.`;
}

/** Write the report to the selected location. */
export async function reportResult(result: RemoveResult, mode: SummaryMode): Promise<void> {
  if (mode === 'none') {
    return;
  }

  const rows = buildRows(result);

  if (mode === 'inline') {
    if (rows.length > 0) {
      core.info('');
      core.info(renderTextTable(rows));
      core.info('');
    }
    core.info(totalsText(result));
    return;
  }

  core.summary.addHeading('Removed agentic files', 3);
  if (rows.length > 0) {
    core.summary.addTable([
      [
        { data: 'Pattern', header: true },
        { data: 'Matches', header: true },
        { data: 'Result', header: true },
      ],
      ...rows.map((row) => [row.pattern, row.matches, row.result]),
    ]);
  }
  core.summary.addRaw(totalsText(result), true);
  await core.summary.write();
}
