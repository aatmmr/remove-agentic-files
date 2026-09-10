import { describe, expect, it } from 'vitest';
import {
  assertRelativePattern,
  dedupePatterns,
  isNegated,
  parsePatternList,
  splitPatterns,
  stripNegation,
  toAbsolutePattern,
} from '../src/patterns.js';

describe('parsePatternList', () => {
  it('removes an empty line and a comment line', () => {
    const text = ['# a comment', '', '  ', 'AGENTS.md', '  .cursor/  ', '#another'].join('\n');
    expect(parsePatternList(text)).toEqual(['AGENTS.md', '.cursor/']);
  });

  it('accepts a Windows line break', () => {
    expect(parsePatternList('AGENTS.md\r\nCLAUDE.md')).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });
});

describe('dedupePatterns', () => {
  it('keeps the sequence', () => {
    expect(dedupePatterns(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });
});

describe('negation', () => {
  it('finds a negation pattern', () => {
    expect(isNegated('!vendor/**')).toBe(true);
    expect(isNegated('vendor/**')).toBe(false);
  });

  it('removes the prefix', () => {
    expect(stripNegation('!vendor/**')).toBe('vendor/**');
    expect(stripNegation('!! vendor/**')).toBe('vendor/**');
  });

  it('divides the list', () => {
    expect(splitPatterns(['a', '!b', 'c'])).toEqual({ includes: ['a', 'c'], excludes: ['!b'] });
  });
});

describe('assertRelativePattern', () => {
  it('accepts a relative pattern', () => {
    expect(() => assertRelativePattern('**/AGENTS.md')).not.toThrow();
    expect(() => assertRelativePattern('!vendor/**')).not.toThrow();
    expect(() => assertRelativePattern('.github/instructions/')).not.toThrow();
  });

  it('rejects an empty pattern', () => {
    expect(() => assertRelativePattern('!')).toThrow(/empty/);
  });

  it('rejects a home directory pattern', () => {
    expect(() => assertRelativePattern('~/AGENTS.md')).toThrow(/~/);
  });

  it('rejects an absolute pattern', () => {
    expect(() => assertRelativePattern('/etc/passwd')).toThrow(/absolute path/);
    expect(() => assertRelativePattern('\\Windows\\System32')).toThrow(/absolute path/);
    expect(() => assertRelativePattern('C:/Windows')).toThrow(/absolute path/);
    expect(() => assertRelativePattern('!/etc/passwd')).toThrow(/absolute path/);
  });

  it('rejects a pattern with ..', () => {
    expect(() => assertRelativePattern('../AGENTS.md')).toThrow(/\.\./);
    expect(() => assertRelativePattern('a/../../b')).toThrow(/\.\./);
    expect(() => assertRelativePattern('a\\..\\b')).toThrow(/\.\./);
  });
});

describe('toAbsolutePattern', () => {
  it('joins the root and the pattern', () => {
    expect(toAbsolutePattern('/repo', '**/AGENTS.md')).toBe('/repo/**/AGENTS.md');
  });

  it('keeps a trailing separator', () => {
    expect(toAbsolutePattern('/repo', '.cursor/')).toBe('/repo/.cursor/');
  });

  it('keeps the negation prefix in front', () => {
    expect(toAbsolutePattern('/repo', '!vendor/**')).toBe('!/repo/vendor/**');
  });

  it('normalizes a Windows root', () => {
    expect(toAbsolutePattern('C:\\repo\\', 'AGENTS.md')).toBe('C:/repo/AGENTS.md');
  });

  it('escapes glob metacharacters in the root path', () => {
    expect(toAbsolutePattern('/tmp/repo[1]/pkg*', 'AGENTS.md')).toBe(
      '/tmp/repo\\[1\\]/pkg\\*/AGENTS.md',
    );
  });
});
