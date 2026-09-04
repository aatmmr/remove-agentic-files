import { readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  buildRows,
  renderTextTable,
  reportResult,
  statusText,
  totalsText,
} from '../src/summary.js';
import type { RemoveResult } from '../src/remove.js';
import { makeFixture } from './helpers.js';

function makeResult(overrides: Partial<RemoveResult> = {}): RemoveResult {
  return {
    root: '/repo',
    dryRun: false,
    deleted: ['AGENTS.md', '.cursor'],
    patterns: [
      { pattern: '**/AGENTS.md', matches: ['AGENTS.md'], deleted: ['AGENTS.md'], skipped: [] },
      { pattern: '.cursor/', matches: ['.cursor'], deleted: ['.cursor'], skipped: [] },
      { pattern: 'CLAUDE.md', matches: [], deleted: [], skipped: [] },
    ],
    ...overrides,
  };
}

describe('statusText', () => {
  it('reports a pattern without a match', () => {
    expect(statusText({ pattern: 'a', matches: [], deleted: [], skipped: [] }, false)).toBe(
      'no match',
    );
  });

  it('reports a deletion', () => {
    expect(statusText({ pattern: 'a', matches: ['x'], deleted: ['x'], skipped: [] }, false)).toBe(
      '1 removed',
    );
  });

  it('reports the dry-run mode', () => {
    expect(statusText({ pattern: 'a', matches: ['x'], deleted: ['x'], skipped: [] }, true)).toBe(
      '1 to remove',
    );
  });

  it('reports a kept path', () => {
    const result = {
      pattern: 'a',
      matches: ['x', 'y'],
      deleted: ['x'],
      skipped: [{ path: 'y', reason: 'test' }],
    };
    expect(statusText(result, false)).toBe('1 removed, 1 kept');
  });
});

describe('buildRows and renderTextTable', () => {
  it('makes one row per pattern', () => {
    expect(buildRows(makeResult())).toEqual([
      { pattern: '**/AGENTS.md', matches: '1', result: '1 removed' },
      { pattern: '.cursor/', matches: '1', result: '1 removed' },
      { pattern: 'CLAUDE.md', matches: '0', result: 'no match' },
    ]);
  });

  it('aligns the columns', () => {
    const lines = renderTextTable(buildRows(makeResult())).split('\n');
    expect(lines[0]).toBe('Pattern       Matches  Result');
    expect(lines[2]).toBe('**/AGENTS.md        1  1 removed');
  });
});

describe('totalsText', () => {
  it('uses the singular form', () => {
    expect(totalsText(makeResult({ deleted: ['AGENTS.md'] }))).toBe('Removed 1 path.');
  });

  it('names the dry-run mode', () => {
    expect(totalsText(makeResult({ dryRun: true }))).toBe('Dry run: 2 paths would be removed.');
  });
});

describe('reportResult', () => {
  const roots: string[] = [];
  let stdout: MockInstance<typeof process.stdout.write>;
  let written: string;

  beforeEach(() => {
    written = '';
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written += String(chunk);
      return true;
    });
  });

  afterEach(async () => {
    stdout.mockRestore();
    delete process.env['GITHUB_STEP_SUMMARY'];
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it('writes the table to the log for the inline mode', async () => {
    await reportResult(makeResult(), 'inline');
    expect(written).toContain('Pattern');
    expect(written).toContain('**/AGENTS.md');
    expect(written).toContain('Removed 2 paths.');
  });

  it('writes nothing for the none mode', async () => {
    await reportResult(makeResult(), 'none');
    expect(written).toBe('');
  });

  it('writes the table to the job summary file', async () => {
    const root = await makeFixture({ 'summary.md': '' });
    roots.push(root);
    const file = path.join(root, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = file;

    await reportResult(makeResult(), 'job-summary');

    const content = await readFile(file, 'utf8');
    expect(content).toContain('<h3>Removed agentic files</h3>');
    expect(content).toContain('**/AGENTS.md');
    expect(content).toContain('Removed 2 paths.');
    expect(written).toBe('');
  });
});
