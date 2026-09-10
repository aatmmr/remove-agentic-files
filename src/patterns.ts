/**
 * Helper functions for the pattern lists.
 */

/** A pattern that removes matches from the result set starts with `!`. */
const NEGATE_PREFIX = '!';

/**
 * Split a text block into a pattern list.
 *
 * The function removes empty lines and comment lines. A comment line starts
 * with `#`. The function keeps the sequence of the remaining lines.
 */
export function parsePatternList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** Remove the duplicate patterns, but keep the sequence. */
export function dedupePatterns(patterns: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const pattern of patterns) {
    if (!seen.has(pattern)) {
      seen.add(pattern);
      result.push(pattern);
    }
  }
  return result;
}

/** True if the pattern removes matches from the result set. */
export function isNegated(pattern: string): boolean {
  return pattern.startsWith(NEGATE_PREFIX);
}

/** Remove the leading `!` characters from a pattern. */
export function stripNegation(pattern: string): string {
  let result = pattern;
  while (result.startsWith(NEGATE_PREFIX)) {
    result = result.slice(1).trim();
  }
  return result;
}

/**
 * Divide the pattern list into the search patterns and the protection patterns.
 */
export function splitPatterns(patterns: readonly string[]): {
  includes: string[];
  excludes: string[];
} {
  const includes: string[] = [];
  const excludes: string[] = [];
  for (const pattern of patterns) {
    if (isNegated(pattern)) {
      excludes.push(pattern);
    } else {
      includes.push(pattern);
    }
  }
  return { includes, excludes };
}

/**
 * Make sure that a pattern stays inside the search root.
 *
 * @throws Error if the pattern is absolute, if it goes up with `..`, or if it
 *   starts with `~`.
 */
export function assertRelativePattern(pattern: string): void {
  const body = stripNegation(pattern);

  if (body.length === 0) {
    throw new Error(`The pattern "${pattern}" is empty.`);
  }

  if (body.startsWith('~')) {
    throw new Error(
      `The pattern "${pattern}" starts with "~". Use a path that is relative to the search root.`,
    );
  }

  if (body.startsWith('/') || body.startsWith('\\') || /^[A-Za-z]:[\\/]?/.test(body)) {
    throw new Error(
      `The pattern "${pattern}" is an absolute path. Use a path that is relative to the search root.`,
    );
  }

  const segments = body.split(/[\\/]+/);
  if (segments.includes('..')) {
    throw new Error(
      `The pattern "${pattern}" contains "..". A pattern must stay inside the search root.`,
    );
  }
}

/**
 * Make an absolute glob pattern from a search root and a relative pattern.
 *
 * The function keeps a trailing separator, because a trailing separator limits
 * the pattern to a directory. The function keeps the `!` prefix in front of the
 * absolute path.
 */
export function toAbsolutePattern(root: string, pattern: string): string {
  const negated = isNegated(pattern);
  const body = stripNegation(pattern);
  const normalizedRoot = root.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const escapedRoot = normalizedRoot.replace(/[\\*?[\]{}()+!@]/g, '\\$&');
  const escapedAbsolute = `${escapedRoot}/${body.replace(/^[\\/]+/, '')}`;
  return negated ? `${NEGATE_PREFIX}${escapedAbsolute}` : escapedAbsolute;
}
