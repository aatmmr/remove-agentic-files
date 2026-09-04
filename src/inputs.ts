import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as core from '@actions/core';
import { patternsForAgents, resolveAgentKeys } from './agents.js';
import { dedupePatterns, parsePatternList } from './patterns.js';

/** Location of the report. */
export type SummaryMode = 'inline' | 'job-summary' | 'none';

/** The known values of the `summary` input. */
export const SUMMARY_MODES: readonly SummaryMode[] = ['inline', 'job-summary', 'none'];

/** The inputs of the action, after the validation. */
export interface ActionInputs {
  /** The canonical agent keys. */
  readonly agents: string[];
  /** The merged pattern list, without a duplicate. */
  readonly patterns: string[];
  /** The absolute search root. */
  readonly root: string;
  /** True to report the matches, but to delete nothing. */
  readonly dryRun: boolean;
  /** True to fail if a pattern finds no match. */
  readonly failOnNoMatch: boolean;
  /** True to follow a symbolic link during the search. */
  readonly followSymbolicLinks: boolean;
  /** The location of the report. */
  readonly summary: SummaryMode;
}

/** The base directory of the checked out repository. */
export function workspaceRoot(): string {
  const workspace = process.env['GITHUB_WORKSPACE'];
  return workspace && workspace.length > 0 ? workspace : process.cwd();
}

/** Make an absolute path from a user path. */
export function resolvePath(base: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return path.resolve(base);
  }
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(base, trimmed);
}

/** Check the value of the `summary` input. */
export function parseSummaryMode(value: string): SummaryMode {
  const normalized = value.trim().toLowerCase() || 'inline';
  if ((SUMMARY_MODES as readonly string[]).includes(normalized)) {
    return normalized as SummaryMode;
  }
  throw new Error(
    `The summary input has the unknown value "${value}". Use one of: ${SUMMARY_MODES.join(', ')}.`,
  );
}

/** Sources of the pattern list. */
export interface PatternSources {
  /** The value of the `agents` input. */
  readonly agents?: string;
  /** The value of the `patterns` input. */
  readonly patterns?: string;
  /** The content of the config file. */
  readonly configText?: string;
}

/** Result of {@link collectPatterns}. */
export interface CollectedPatterns {
  /** The canonical agent keys. */
  readonly agents: string[];
  /** The merged pattern list, without a duplicate. */
  readonly patterns: string[];
}

/**
 * Make one pattern list from the three sources.
 *
 * The sequence is: the agent patterns, the config file patterns, and then the
 * patterns of the `patterns` input.
 */
export function collectPatterns(sources: PatternSources): CollectedPatterns {
  const agents = resolveAgentKeys(sources.agents ?? '');
  const patterns = [
    ...patternsForAgents(agents),
    ...parsePatternList(sources.configText ?? ''),
    ...parsePatternList(sources.patterns ?? ''),
  ];
  return { agents, patterns: dedupePatterns(patterns) };
}

/** Read the config file. */
export async function readConfigFile(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`The config file "${file}" does not exist.`);
    }
    throw error;
  }
}

/** Read and check every input of the action. */
export async function readInputs(): Promise<ActionInputs> {
  const base = workspaceRoot();
  const root = resolvePath(base, core.getInput('working-directory') || '.');

  const configInput = core.getInput('config').trim();
  let configText = '';
  if (configInput.length > 0) {
    const configFile = resolvePath(base, configInput);
    configText = await readConfigFile(configFile);
    core.info(`Read the pattern list from "${configFile}".`);
  }

  const { agents, patterns } = collectPatterns({
    agents: core.getInput('agents'),
    patterns: core.getInput('patterns'),
    configText,
  });

  return {
    agents,
    patterns,
    root,
    dryRun: core.getBooleanInput('dry-run'),
    failOnNoMatch: core.getBooleanInput('fail-on-no-match'),
    followSymbolicLinks: core.getBooleanInput('follow-symbolic-links'),
    summary: parseSummaryMode(core.getInput('summary')),
  };
}
