/**
 * Built-in pattern lists for the known coding agents.
 *
 * Each list uses a globstar prefix where a nested file is usual, for example
 * `AGENTS.md`. A trailing `/` limits a pattern to a directory.
 */
export interface AgentDefinition {
  /** Name for the report. */
  readonly name: string;
  /** Glob patterns, relative to the search root. */
  readonly patterns: readonly string[];
}

export const AGENTS: Readonly<Record<string, AgentDefinition>> = {
  agents: {
    name: 'Generic agent files',
    patterns: ['**/AGENTS.md', '**/AGENT.md'],
  },
  aider: {
    name: 'Aider',
    patterns: ['.aider.conf.yml', '.aiderignore', '.aider.model.settings.yml'],
  },
  amazonq: {
    name: 'Amazon Q Developer',
    patterns: ['.amazonq/'],
  },
  claude: {
    name: 'Claude Code',
    patterns: ['**/CLAUDE.md', '**/CLAUDE.local.md', '.claude/', '.mcp.json'],
  },
  cline: {
    name: 'Cline',
    patterns: ['.clinerules', '.clinerules/', '.clineignore'],
  },
  codex: {
    name: 'OpenAI Codex',
    patterns: ['**/AGENTS.md', '.codex/'],
  },
  continue: {
    name: 'Continue',
    patterns: ['.continue/', '.continuerules'],
  },
  copilot: {
    name: 'GitHub Copilot',
    patterns: [
      '**/AGENTS.md',
      '.github/copilot-instructions.md',
      '.github/instructions/',
      '.github/prompts/',
      '.github/chatmodes/',
      '.github/agents/',
      '.github/skills/',
      '.vscode/mcp.json',
    ],
  },
  cursor: {
    name: 'Cursor',
    patterns: ['.cursor/', '.cursorrules', '.cursorignore', '.cursorindexingignore'],
  },
  gemini: {
    name: 'Gemini CLI',
    patterns: ['**/GEMINI.md', '.gemini/'],
  },
  junie: {
    name: 'JetBrains Junie',
    patterns: ['.junie/'],
  },
  kiro: {
    name: 'Kiro',
    patterns: ['.kiro/'],
  },
  opencode: {
    name: 'OpenCode',
    patterns: ['.opencode/', 'opencode.json', 'opencode.jsonc'],
  },
  roo: {
    name: 'Roo Code',
    patterns: ['.roo/', '.roorules', '.roomodes'],
  },
  windsurf: {
    name: 'Windsurf',
    patterns: ['.windsurf/', '.windsurfrules', '.codeiumignore'],
  },
};

/** Alternative names for an agent key. */
const ALIASES: Readonly<Record<string, string>> = {
  'amazon-q': 'amazonq',
  'claude-code': 'claude',
  codeium: 'windsurf',
  'continue-dev': 'continue',
  'gemini-cli': 'gemini',
  'github-copilot': 'copilot',
  'open-code': 'opencode',
  'roo-code': 'roo',
  roocode: 'roo',
};

/** Value that selects every agent. */
export const ALL_AGENTS = 'all';

/** Sorted list of the known agent keys. */
export function agentKeys(): string[] {
  return Object.keys(AGENTS).sort();
}

/**
 * Convert an agent key to its canonical form.
 * Returns `undefined` if the key is unknown.
 */
export function canonicalAgentKey(key: string): string | undefined {
  const normalized = key.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(AGENTS, normalized)) {
    return normalized;
  }
  return Object.prototype.hasOwnProperty.call(ALIASES, normalized)
    ? ALIASES[normalized]
    : undefined;
}

/**
 * Convert the `agents` input into a list of agent keys.
 * The separator is a comma or a line break.
 *
 * @throws Error if a key is unknown.
 */
export function resolveAgentKeys(input: string): string[] {
  const tokens = input
    .split(/[,\r\n]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !token.startsWith('#'));

  if (tokens.length === 0) {
    return [];
  }

  const keys: string[] = [];
  const unknown: string[] = [];
  let wantsAll = false;

  for (const token of tokens) {
    if (token.toLowerCase() === ALL_AGENTS) {
      wantsAll = true;
      continue;
    }

    const key = canonicalAgentKey(token);
    if (!key) {
      unknown.push(token);
    } else if (!keys.includes(key)) {
      keys.push(key);
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent ${unknown.length === 1 ? 'key' : 'keys'}: ${unknown.join(', ')}. ` +
        `Known keys are: ${agentKeys().join(', ')}, ${ALL_AGENTS}.`,
    );
  }

  if (wantsAll) {
    return agentKeys();
  }

  return keys;
}

/** Collect the patterns of the given agent keys. */
export function patternsForAgents(keys: readonly string[]): string[] {
  const patterns: string[] = [];
  for (const key of keys) {
    const agent = AGENTS[key];
    if (!agent) {
      throw new Error(`Unknown agent key: ${key}.`);
    }
    patterns.push(...agent.patterns);
  }
  return patterns;
}
