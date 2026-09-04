import * as core from '@actions/core';
import { readInputs } from './inputs.js';
import { removeAgenticFiles } from './remove.js';
import { reportResult } from './summary.js';

/** Entry point of the action. */
export async function run(): Promise<void> {
  const inputs = await readInputs();

  core.info(`Search root: ${inputs.root}`);
  if (inputs.agents.length > 0) {
    core.info(`Agents: ${inputs.agents.join(', ')}`);
  }

  if (inputs.patterns.length === 0) {
    core.warning(
      'No pattern is set. Use the agents input, the patterns input or the config input. ' +
        'The action removes nothing.',
    );
    core.setOutput('deleted-files', '[]');
    core.setOutput('deleted-count', 0);
    return;
  }

  core.startGroup(`Patterns (${inputs.patterns.length})`);
  for (const pattern of inputs.patterns) {
    core.info(pattern);
  }
  core.endGroup();

  const result = await removeAgenticFiles({
    root: inputs.root,
    patterns: inputs.patterns,
    dryRun: inputs.dryRun,
    followSymbolicLinks: inputs.followSymbolicLinks,
  });

  core.setOutput('deleted-files', JSON.stringify(result.deleted));
  core.setOutput('deleted-count', result.deleted.length);

  await reportResult(result, inputs.summary);

  if (inputs.failOnNoMatch) {
    const empty = result.patterns
      .filter((pattern) => pattern.matches.length === 0)
      .map((pattern) => pattern.pattern);
    if (empty.length > 0) {
      throw new Error(
        `These patterns found no match: ${empty.join(', ')}. ` +
          'Set fail-on-no-match to false to accept a pattern without a match.',
      );
    }
  }
}

/** Start the action and report an error to the runner. */
export async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
