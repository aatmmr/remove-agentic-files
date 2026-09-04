import { describe, expect, it } from 'vitest';
import {
  AGENTS,
  agentKeys,
  canonicalAgentKey,
  patternsForAgents,
  resolveAgentKeys,
} from '../src/agents.js';

describe('agents', () => {
  it('gives an empty list for an empty input', () => {
    expect(resolveAgentKeys('')).toEqual([]);
    expect(resolveAgentKeys('   \n  ')).toEqual([]);
  });

  it('reads a comma list and a line list', () => {
    expect(resolveAgentKeys('copilot, claude')).toEqual(['copilot', 'claude']);
    expect(resolveAgentKeys('copilot\nclaude')).toEqual(['copilot', 'claude']);
  });

  it('gives every key for the value all', () => {
    expect(resolveAgentKeys('all')).toEqual(agentKeys());
    expect(resolveAgentKeys('claude, all')).toEqual(agentKeys());
  });

  it('accepts an alias and a capital letter', () => {
    expect(resolveAgentKeys('GitHub-Copilot')).toEqual(['copilot']);
    expect(canonicalAgentKey('claude-code')).toBe('claude');
  });

  it('removes a duplicate key', () => {
    expect(resolveAgentKeys('copilot, github-copilot, copilot')).toEqual(['copilot']);
  });

  it('fails on an unknown key and names the known keys', () => {
    expect(() => resolveAgentKeys('copilot, nope')).toThrow(/Unknown agent key: nope/);
    expect(() => resolveAgentKeys('nope')).toThrow(/Known keys are/);
  });

  it('collects the patterns of the keys', () => {
    const patterns = patternsForAgents(['cursor']);
    expect(patterns).toEqual(AGENTS['cursor']?.patterns);
  });

  it('has a name and at least one pattern for every agent', () => {
    for (const key of agentKeys()) {
      const agent = AGENTS[key];
      expect(agent?.name.length).toBeGreaterThan(0);
      expect(agent?.patterns.length).toBeGreaterThan(0);
    }
  });
});
