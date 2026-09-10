import { access, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeAgenticFiles } from '../src/remove.js';
import { makeFixture, makeLink } from './helpers.js';

const roots: string[] = [];

async function fixture(tree: Parameters<typeof makeFixture>[0]): Promise<string> {
  const root = await makeFixture(tree);
  roots.push(root);
  return root;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

describe('removeAgenticFiles', () => {
  it('removes a file in the root', async () => {
    const root = await fixture({ 'AGENTS.md': 'a', 'README.md': 'b' });

    const result = await removeAgenticFiles({ root, patterns: ['AGENTS.md'] });

    expect(result.deleted).toEqual(['AGENTS.md']);
    expect(await exists(path.join(root, 'AGENTS.md'))).toBe(false);
    expect(await exists(path.join(root, 'README.md'))).toBe(true);
  });

  it('finds a nested file with a recursive pattern', async () => {
    const root = await fixture({
      'AGENTS.md': 'a',
      'packages/api/AGENTS.md': 'b',
      'packages/web/deep/AGENTS.md': 'c',
      'packages/web/keep.md': 'd',
    });

    const result = await removeAgenticFiles({ root, patterns: ['**/AGENTS.md'] });

    expect(result.deleted).toEqual([
      'AGENTS.md',
      'packages/api/AGENTS.md',
      'packages/web/deep/AGENTS.md',
    ]);
    expect(await exists(path.join(root, 'packages/web/keep.md'))).toBe(true);
  });

  it('accepts a child path segment that starts with ".."', async () => {
    const root = await fixture({
      '..cache/AGENTS.md': 'a',
      'packages/api/AGENTS.md': 'b',
    });

    const result = await removeAgenticFiles({ root, patterns: ['**/AGENTS.md'] });

    expect(result.deleted).toEqual(['..cache/AGENTS.md', 'packages/api/AGENTS.md']);
  });

  it('does not add a recursion to a plain file name', async () => {
    const root = await fixture({ 'AGENTS.md': 'a', 'packages/api/AGENTS.md': 'b' });

    const result = await removeAgenticFiles({ root, patterns: ['AGENTS.md'] });

    expect(result.deleted).toEqual(['AGENTS.md']);
    expect(await exists(path.join(root, 'packages/api/AGENTS.md'))).toBe(true);
  });

  it('removes a directory and its content', async () => {
    const root = await fixture({
      '.cursor/rules/one.mdc': 'a',
      '.cursor/rules/two.mdc': 'b',
      'src/index.ts': 'c',
    });

    const result = await removeAgenticFiles({ root, patterns: ['.cursor/'] });

    expect(result.deleted).toEqual(['.cursor']);
    expect(await exists(path.join(root, '.cursor'))).toBe(false);
    expect(await exists(path.join(root, 'src/index.ts'))).toBe(true);
  });

  it('matches a directory only when the pattern ends with a separator', async () => {
    const root = await fixture({ '.clinerules': 'a' });

    const result = await removeAgenticFiles({ root, patterns: ['.clinerules/'] });

    expect(result.deleted).toEqual([]);
    expect(await exists(path.join(root, '.clinerules'))).toBe(true);
  });

  it('continues after a pattern without a match', async () => {
    const root = await fixture({ 'CLAUDE.md': 'a' });

    const result = await removeAgenticFiles({
      root,
      patterns: ['MISSING.md', '.does-not-exist/', 'CLAUDE.md'],
    });

    expect(result.patterns.map((entry) => entry.matches.length)).toEqual([0, 0, 1]);
    expect(result.deleted).toEqual(['CLAUDE.md']);
  });

  it('keeps a match of a negation pattern', async () => {
    const root = await fixture({
      'AGENTS.md': 'a',
      'docs/AGENTS.md': 'b',
      'vendor/AGENTS.md': 'c',
    });

    const result = await removeAgenticFiles({
      root,
      patterns: ['**/AGENTS.md', '!vendor/**'],
    });

    expect(result.deleted).toEqual(['AGENTS.md', 'docs/AGENTS.md']);
    expect(await exists(path.join(root, 'vendor/AGENTS.md'))).toBe(true);
  });

  it('deletes nothing in the dry-run mode', async () => {
    const root = await fixture({ 'AGENTS.md': 'a', '.claude/settings.json': 'b' });

    const result = await removeAgenticFiles({
      root,
      patterns: ['AGENTS.md', '.claude/'],
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.deleted).toEqual(['AGENTS.md', '.claude']);
    expect(await exists(path.join(root, 'AGENTS.md'))).toBe(true);
    expect(await exists(path.join(root, '.claude'))).toBe(true);
  });

  it('never removes the .git directory', async () => {
    const root = await fixture({ '.git/config': 'a', '.git/AGENTS.md': 'b', 'AGENTS.md': 'c' });

    const result = await removeAgenticFiles({ root, patterns: ['**/AGENTS.md', '.git/'] });

    expect(result.deleted).toEqual(['AGENTS.md']);
    expect(await exists(path.join(root, '.git/config'))).toBe(true);
    expect(await exists(path.join(root, '.git/AGENTS.md'))).toBe(true);
  });

  it('fails when the search root contains a .git segment', async () => {
    const workspace = await fixture({ '.git/config': 'a', '.git/AGENTS.md': 'b' });

    await expect(
      removeAgenticFiles({ root: path.join(workspace, '.git'), patterns: ['**/AGENTS.md'] }),
    ).rejects.toThrow(/contains "\.git"/);
  });

  it('removes a duplicate path only one time', async () => {
    const root = await fixture({ 'AGENTS.md': 'a' });

    const result = await removeAgenticFiles({
      root,
      patterns: ['AGENTS.md', '**/AGENTS.md', '*.md'],
    });

    expect(result.deleted).toEqual(['AGENTS.md']);
  });

  it('rejects a pattern that goes up with ..', async () => {
    const root = await fixture({ 'AGENTS.md': 'a' });

    await expect(removeAgenticFiles({ root, patterns: ['../AGENTS.md'] })).rejects.toThrow(/\.\./);
    expect(await exists(path.join(root, 'AGENTS.md'))).toBe(true);
  });

  it('rejects an absolute pattern', async () => {
    const root = await fixture({ 'AGENTS.md': 'a' });
    const absolute = process.platform === 'win32' ? 'C:\\temp\\AGENTS.md' : '/tmp/AGENTS.md';

    await expect(removeAgenticFiles({ root, patterns: [absolute] })).rejects.toThrow(
      /absolute path/,
    );
  });

  it('rejects a pattern that starts with a tilde', async () => {
    const root = await fixture({ 'AGENTS.md': 'a' });

    await expect(removeAgenticFiles({ root, patterns: ['~/AGENTS.md'] })).rejects.toThrow(/~/);
  });

  it('fails if the search root does not exist', async () => {
    const root = await fixture({ 'AGENTS.md': 'a' });

    await expect(
      removeAgenticFiles({ root: path.join(root, 'nope'), patterns: ['AGENTS.md'] }),
    ).rejects.toThrow(/does not exist/);
  });

  it('removes a symbolic link, but keeps the target', async () => {
    const root = await fixture({ 'real/notes.md': 'a' });
    await makeLink(root, 'AGENTS.md', path.join(root, 'real', 'notes.md'));

    const result = await removeAgenticFiles({ root, patterns: ['AGENTS.md'] });

    expect(result.deleted).toEqual(['AGENTS.md']);
    expect(await exists(path.join(root, 'real/notes.md'))).toBe(true);
  });

  it('removes a broken symbolic link', async () => {
    const root = await fixture({ 'real/notes.md': 'a' });
    await makeLink(root, 'AGENTS.md', path.join(root, 'real', 'notes.md'));
    await rm(path.join(root, 'real/notes.md'));

    const result = await removeAgenticFiles({ root, patterns: ['AGENTS.md'] });

    expect(result.deleted).toEqual(['AGENTS.md']);
    expect(await exists(path.join(root, 'AGENTS.md'))).toBe(false);
  });

  it('keeps a directory that contains a protected .git descendant', async () => {
    const root = await fixture({
      'vendor/.git/config': 'a',
      'vendor/.git/HEAD': 'b',
      'vendor/AGENTS.md': 'c',
    });

    const result = await removeAgenticFiles({ root, patterns: ['vendor/'] });

    expect(result.deleted).toEqual([]);
    expect(result.patterns[0]?.skipped).toEqual([
      {
        path: 'vendor',
        reason:
          'the directory contains protected matches from a negation pattern or a ".git" segment',
      },
    ]);
    expect(await exists(path.join(root, 'vendor/.git/config'))).toBe(true);
    expect(await exists(path.join(root, 'vendor/AGENTS.md'))).toBe(true);
  });

  it('keeps a directory that contains negation matches', async () => {
    const root = await fixture({
      'vendor/keep/AGENTS.md': 'a',
      'vendor/remove/AGENTS.md': 'b',
    });

    const result = await removeAgenticFiles({
      root,
      patterns: ['vendor/', '!vendor/keep/**'],
    });

    expect(result.deleted).toEqual([]);
    expect(result.patterns[0]?.skipped).toEqual([
      {
        path: 'vendor',
        reason:
          'the directory contains protected matches from a negation pattern or a ".git" segment',
      },
    ]);
    expect(await exists(path.join(root, 'vendor/keep/AGENTS.md'))).toBe(true);
    expect(await exists(path.join(root, 'vendor/remove/AGENTS.md'))).toBe(true);
  });

  it('reports the kept paths of the .git guard', async () => {
    const root = await fixture({ '.git/AGENTS.md': 'a' });

    const result = await removeAgenticFiles({ root, patterns: ['**/AGENTS.md'] });

    expect(result.patterns[0]?.skipped).toEqual([
      { path: '.git/AGENTS.md', reason: 'the path contains ".git"' },
    ]);
  });
});
