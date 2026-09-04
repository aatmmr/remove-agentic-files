import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SUMMARY_MODES,
  collectPatterns,
  parseSummaryMode,
  readConfigFile,
  resolvePath,
} from '../src/inputs.js';
import { patternsForAgents } from '../src/agents.js';
import { makeFixture } from './helpers.js';

const roots: string[] = [];

async function fixture(tree: Parameters<typeof makeFixture>[0]): Promise<string> {
  const root = await makeFixture(tree);
  roots.push(root);
  return root;
}

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

describe('parseSummaryMode', () => {
  it('accepts every known mode', () => {
    for (const mode of SUMMARY_MODES) {
      expect(parseSummaryMode(mode)).toBe(mode);
    }
  });

  it('gives inline for an empty value', () => {
    expect(parseSummaryMode('')).toBe('inline');
    expect(parseSummaryMode('  ')).toBe('inline');
  });

  it('accepts a capital letter', () => {
    expect(parseSummaryMode('Job-Summary')).toBe('job-summary');
  });

  it('fails on an unknown value and names the known values', () => {
    expect(() => parseSummaryMode('table')).toThrow(/inline, job-summary, none/);
  });
});

describe('resolvePath', () => {
  it('resolves a relative path against the base', () => {
    expect(resolvePath('/base', 'src')).toBe(path.resolve('/base', 'src'));
  });

  it('gives the base for an empty value', () => {
    expect(resolvePath('/base', '  ')).toBe(path.resolve('/base'));
  });

  it('keeps an absolute path', () => {
    const absolute = process.platform === 'win32' ? 'C:\\work' : '/work';
    expect(resolvePath('/base', absolute)).toBe(path.normalize(absolute));
  });
});

describe('collectPatterns', () => {
  it('gives an empty list without a source', () => {
    expect(collectPatterns({})).toEqual({ agents: [], patterns: [] });
  });

  it('uses the built-in list of an agent', () => {
    const result = collectPatterns({ agents: 'cursor' });
    expect(result.agents).toEqual(['cursor']);
    expect(result.patterns).toEqual(patternsForAgents(['cursor']));
  });

  it('merges the three sources in sequence', () => {
    const result = collectPatterns({
      agents: 'agents',
      configText: '# comment\nfrom-config.md\n',
      patterns: 'from-input.md',
    });
    expect(result.patterns).toEqual([
      '**/AGENTS.md',
      '**/AGENT.md',
      'from-config.md',
      'from-input.md',
    ]);
  });

  it('removes a duplicate across the sources', () => {
    const result = collectPatterns({
      agents: 'codex',
      patterns: '**/AGENTS.md\nextra.md',
    });
    expect(result.patterns).toEqual(['**/AGENTS.md', '.codex/', 'extra.md']);
  });

  it('fails on an unknown agent key', () => {
    expect(() => collectPatterns({ agents: 'nope' })).toThrow(/Unknown agent key/);
  });
});

describe('readConfigFile', () => {
  it('reads the file', async () => {
    const root = await fixture({ '.agentic-files': 'AGENTS.md\n' });
    await expect(readConfigFile(path.join(root, '.agentic-files'))).resolves.toBe('AGENTS.md\n');
  });

  it('fails if the file is missing', async () => {
    const root = await fixture({ 'keep.md': 'a' });
    await expect(readConfigFile(path.join(root, 'missing.txt'))).rejects.toThrow(/does not exist/);
  });
});
