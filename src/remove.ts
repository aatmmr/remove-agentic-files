import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as glob from '@actions/glob';
import {
  assertRelativePattern,
  splitPatterns,
  stripNegation,
  toAbsolutePattern,
} from './patterns.js';

/** Result of one search pattern. */
export interface PatternResult {
  /** The pattern, as the user wrote it. */
  readonly pattern: string;
  /** Every path that the pattern found, relative to the root. */
  readonly matches: string[];
  /** Every path that the action deleted, relative to the root. */
  readonly deleted: string[];
  /** Every path that the action kept, with the reason. */
  readonly skipped: { path: string; reason: string }[];
}

/** Result of the full operation. */
export interface RemoveResult {
  /** The search root. */
  readonly root: string;
  /** One entry per search pattern. */
  readonly patterns: PatternResult[];
  /** Every deleted path, relative to the root, without a duplicate. */
  readonly deleted: string[];
  /** True if the action deleted nothing, because of the dry-run mode. */
  readonly dryRun: boolean;
}

/** Options for {@link removeAgenticFiles}. */
export interface RemoveOptions {
  /** The search root. The path must exist. */
  readonly root: string;
  /** The pattern list. A pattern with a `!` prefix protects its matches. */
  readonly patterns: readonly string[];
  /** True to report the matches, but to delete nothing. */
  readonly dryRun?: boolean;
  /** True to follow a symbolic link during the search. */
  readonly followSymbolicLinks?: boolean;
}

/** Directory name that the action never deletes. */
const PROTECTED_SEGMENT = '.git';

/** Make a path relative to the root, and always use `/` as the separator. */
function toRelativePosix(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/** True if `child` is below `parent`. */
function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  if (relative.length === 0) {
    return false;
  }
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** True if the error is a "file does not exist" error. */
function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/**
 * Resolve the real path of a match, but keep a final symbolic link.
 *
 * The function resolves the parent directory only. A symbolic link that the
 * pattern found stays a symbolic link. The action then deletes the link, and
 * not the target of the link.
 */
async function resolveKeepLink(target: string): Promise<string | undefined> {
  const parent = path.dirname(target);
  try {
    const realParent = await fs.realpath(parent);
    return path.join(realParent, path.basename(target));
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

/** True if the relative path contains the protected segment. */
function containsProtectedSegment(relativePath: string): boolean {
  return relativePath.split('/').includes(PROTECTED_SEGMENT);
}

/** True if a path has a protected path segment. */
function pathHasProtectedSegment(target: string): boolean {
  return path
    .normalize(target)
    .split(path.sep)
    .filter((segment) => segment.length > 0)
    .includes(PROTECTED_SEGMENT);
}

/** Find every path that a negation pattern protects. */
async function collectExcludedPaths(
  root: string,
  patterns: readonly string[],
  followSymbolicLinks: boolean,
): Promise<Set<string>> {
  const excluded = new Set<string>();

  for (const pattern of patterns) {
    const globber = await glob.create(stripNegation(pattern), {
      followSymbolicLinks,
      implicitDescendants: false,
      matchDirectories: true,
      omitBrokenSymbolicLinks: false,
    });
    const matches = await globber.glob();
    for (const match of matches) {
      const resolved = await resolveKeepLink(match);
      if (resolved && isInside(root, resolved)) {
        excluded.add(resolved);
      }
    }
  }

  return excluded;
}

/** True if an excluded path is equal to `target` or below it. */
function hasExcludedDescendant(target: string, excluded: ReadonlySet<string>): boolean {
  for (const candidate of excluded) {
    if (candidate === target || isInside(target, candidate)) {
      return true;
    }
  }
  return false;
}

/** True if the directory tree contains a protected segment. */
async function hasProtectedDescendant(target: string): Promise<boolean> {
  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === PROTECTED_SEGMENT) {
      return true;
    }
    if (entry.isDirectory()) {
      const found = await hasProtectedDescendant(path.join(target, entry.name));
      if (found) {
        return true;
      }
    }
  }
  return false;
}

/** Delete a file, a directory or a symbolic link. */
async function deletePath(target: string): Promise<void> {
  try {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EACCES') {
      throw error;
    }
    // A read-only file on Windows needs a new mode before the deletion.
    await fs.chmod(target, 0o666);
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

/**
 * Find the files and the directories that the patterns select, and delete them.
 *
 * A pattern that finds nothing gives an information message. The function then
 * continues with the next pattern.
 */
export async function removeAgenticFiles(options: RemoveOptions): Promise<RemoveResult> {
  const dryRun = options.dryRun ?? false;
  const followSymbolicLinks = options.followSymbolicLinks ?? false;

  const rootStats = await fs.stat(options.root).catch((error: unknown) => {
    if (isNotFound(error)) {
      throw new Error(`The search root "${options.root}" does not exist.`);
    }
    throw error;
  });
  if (!rootStats.isDirectory()) {
    throw new Error(`The search root "${options.root}" is not a directory.`);
  }
  const lexicalRoot = path.resolve(options.root);
  if (pathHasProtectedSegment(lexicalRoot)) {
    throw new Error(`The search root "${options.root}" contains "${PROTECTED_SEGMENT}".`);
  }
  const root = await fs.realpath(options.root);
  if (pathHasProtectedSegment(root)) {
    throw new Error(`The search root "${options.root}" contains "${PROTECTED_SEGMENT}".`);
  }

  for (const pattern of options.patterns) {
    assertRelativePattern(pattern);
  }

  const { includes, excludes } = splitPatterns(options.patterns);
  const absoluteExcludes = excludes.map((pattern) => toAbsolutePattern(root, pattern));
  const excludedPaths = await collectExcludedPaths(root, absoluteExcludes, followSymbolicLinks);

  const results: PatternResult[] = [];
  const deleted: string[] = [];
  const handled = new Set<string>();

  for (const pattern of includes) {
    const result: PatternResult = { pattern, matches: [], deleted: [], skipped: [] };
    results.push(result);

    const search = [toAbsolutePattern(root, pattern), ...absoluteExcludes].join('\n');
    const globber = await glob.create(search, {
      followSymbolicLinks,
      implicitDescendants: false,
      matchDirectories: true,
      omitBrokenSymbolicLinks: false,
    });
    const matches = (await globber.glob()).sort();

    for (const match of matches) {
      const resolved = await resolveKeepLink(match);
      if (!resolved) {
        continue;
      }

      if (!isInside(root, resolved)) {
        throw new Error(
          `The pattern "${pattern}" found the path "${match}", which is outside of the search ` +
            `root "${root}". The action stops for safety.`,
        );
      }

      const relative = toRelativePosix(root, resolved);
      result.matches.push(relative);

      if (containsProtectedSegment(relative)) {
        result.skipped.push({ path: relative, reason: `the path contains "${PROTECTED_SEGMENT}"` });
        core.warning(`Kept "${relative}", because the path contains "${PROTECTED_SEGMENT}".`);
        continue;
      }

      if (handled.has(resolved)) {
        continue;
      }
      handled.add(resolved);

      try {
        const stats = await fs.lstat(resolved);

        if (
          stats.isDirectory() &&
          !stats.isSymbolicLink() &&
          (hasExcludedDescendant(resolved, excludedPaths) ||
            (await hasProtectedDescendant(resolved)))
        ) {
          result.skipped.push({
            path: relative,
            reason:
              'the directory contains protected matches from a negation pattern or a ".git" segment',
          });
          core.warning(
            `Kept "${relative}", because it contains protected matches from a negation pattern ` +
              `or a "${PROTECTED_SEGMENT}" segment.`,
          );
          continue;
        }
      } catch (error) {
        if (isNotFound(error)) {
          result.skipped.push({ path: relative, reason: 'the path was already removed' });
          continue;
        }
        throw error;
      }

      if (dryRun) {
        result.deleted.push(relative);
        deleted.push(relative);
        core.info(`Would remove ${JSON.stringify(relative)}.`);
        continue;
      }

      await deletePath(resolved);
      result.deleted.push(relative);
      deleted.push(relative);
      core.info(`Removed ${JSON.stringify(relative)}.`);
    }

    if (result.matches.length === 0) {
      core.info(`No match for "${pattern}". The action continues with the next pattern.`);
    }
  }

  return { root, patterns: results, deleted, dryRun };
}
