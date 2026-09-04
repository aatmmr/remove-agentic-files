# remove-agentic-files

A GitHub Action that removes agentic files from a repository that is checked out on a runner.
Use it in a build job, so that files such as `AGENTS.md`, `CLAUDE.md` or `.cursor/` do not go into
an artifact or a deployment.

The action runs on Linux, Windows and macOS. It uses one code path on all three systems, because it
does the search and the deletion in Node, and not in a shell.

## What the action does

1. It makes one pattern list from three sources: the `agents` input, the `config` file and the
   `patterns` input.
2. It searches for each pattern below the search root.
3. It deletes each match. A directory goes away with all of its content.
4. If a pattern finds nothing, the action writes an information message. It then continues with the
   next pattern.
5. It writes a report and sets the outputs.

## Quick start

```yaml
- uses: actions/checkout@v7

- name: Remove the agentic files
  uses: aatmmr/remove-agentic-files@v1
  with:
    agents: all
```

The `agents` input is empty by default. The action then removes nothing. You must name the agents,
give a pattern list, or give a config file.

## Usage

### Select the built-in list of an agent

```yaml
- uses: aatmmr/remove-agentic-files@v1
  with:
    agents: copilot, claude, cursor
```

Use `all` to select every known agent. A comma or a line break separates the keys.

### Give your own patterns

```yaml
- uses: aatmmr/remove-agentic-files@v1
  with:
    patterns: |
      # a comment line
      AGENTS.md
      **/CLAUDE.md
      .cursor/
      !vendor/**
```

### Use a config file

Put a file in the repository, for example `.agentic-files`:

```text
# One glob pattern per line. A line that starts with # is a comment.
**/AGENTS.md
**/CLAUDE.md
.cursor/
.claude/

# A line that starts with ! protects its matches.
!vendor/**
!third_party/**
```

Then name the file:

```yaml
- uses: aatmmr/remove-agentic-files@v1
  with:
    config: .agentic-files
```

### Combine the three sources

```yaml
- uses: aatmmr/remove-agentic-files@v1
  with:
    agents: all
    config: .agentic-files
    patterns: |
      docs/internal-notes.md
```

The action puts the patterns together in this sequence: the agent patterns, the config file
patterns, and then the `patterns` input. It removes a duplicate pattern.

### Look first, delete later

```yaml
- uses: aatmmr/remove-agentic-files@v1
  id: preview
  with:
    agents: all
    dry-run: true

- run: echo "The action would remove ${{ steps.preview.outputs.deleted-count }} paths."
```

## Inputs

| Input                   | Default  | Function                                                                                                                                                                                   |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agents`                | `''`     | Coding agents whose built-in pattern list the action uses. Separate the keys with a comma or a line break. Use `all` for every known agent.                                                |
| `patterns`              | `''`     | Additional glob patterns, one per line. `#` starts a comment. `!` protects the matches of the pattern.                                                                                     |
| `config`                | `''`     | Path to a plain text file with one glob pattern per line. The action resolves a relative path against `GITHUB_WORKSPACE`. The action fails if the path is set but the file does not exist. |
| `working-directory`     | `.`      | Root of the search. The action resolves a relative path against `GITHUB_WORKSPACE`.                                                                                                        |
| `dry-run`               | `false`  | Report the matches, but delete nothing.                                                                                                                                                    |
| `fail-on-no-match`      | `false`  | Fail if a pattern finds no match.                                                                                                                                                          |
| `follow-symbolic-links` | `false`  | Follow a symbolic link during the search.                                                                                                                                                  |
| `summary`               | `inline` | Location of the report. Use `inline`, `job-summary` or `none`.                                                                                                                             |

## Outputs

| Output          | Function                                                         |
| --------------- | ---------------------------------------------------------------- |
| `deleted-files` | JSON array with every deleted path, relative to the search root. |
| `deleted-count` | Number of the deleted paths.                                     |

```yaml
- uses: aatmmr/remove-agentic-files@v1
  id: clean
  with:
    agents: all

- run: |
    echo "Count: ${{ steps.clean.outputs.deleted-count }}"
    echo "Files: ${{ steps.clean.outputs.deleted-files }}"
```

## The report

The `summary` input selects the location of the report.

- `inline` (default) writes a table to the step log.
- `job-summary` writes the same table to the job summary page.
- `none` writes no table.

An unknown value fails the action. The action always writes the deleted paths to the log, and it
always sets the outputs.

```text
Pattern                          Matches  Result
-------------------------------  -------  ------
**/AGENTS.md                           2  2 removed
.github/copilot-instructions.md        1  1 removed
.cursor/                               1  1 removed
.cursorrules                           0  no match

Removed 4 paths.
```

## Pattern syntax

The action uses [`@actions/glob`](https://github.com/actions/toolkit/tree/main/packages/glob).

| Element      | Function                                            |
| ------------ | --------------------------------------------------- |
| `*`          | Any characters inside one path segment.             |
| `**`         | Any characters across more than one path segment.   |
| `?`          | One character.                                      |
| `[abc]`      | One character from the set.                         |
| trailing `/` | The pattern matches a directory only.               |
| `!` prefix   | The pattern protects its matches from the deletion. |
| `#` prefix   | The line is a comment.                              |

### The action does not add a recursion

A pattern works from the search root. The action adds nothing to a pattern that you write.

| Pattern        | Result                                               |
| -------------- | ---------------------------------------------------- |
| `AGENTS.md`    | Only the file in the root.                           |
| `**/AGENTS.md` | The file in the root and in every subdirectory.      |
| `.cursor/`     | Only the directory in the root.                      |
| `**/.cursor/`  | The directory in the root and in every subdirectory. |

A built-in agent list already uses `**/` where a nested file is usual, for example `**/AGENTS.md`
and `**/CLAUDE.md`.

## Safety rules

- A pattern must stay inside the search root. An absolute pattern, a pattern with `..`, and a
  pattern that starts with `~` fail the action.
- The action resolves the real path of each match. If the path is outside of the search root, the
  action stops.
- The action never deletes the search root.
- The action never deletes a path that contains a `.git` segment. It writes a warning instead.
- The action does not follow a symbolic link by default. It deletes the link, and it keeps the
  target of the link.

## Known agents

| Key        | Agent               | Patterns                                                                                                                                                                       |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agents`   | Generic agent files | `**/AGENTS.md`, `**/AGENT.md`                                                                                                                                                  |
| `aider`    | Aider               | `.aider.conf.yml`, `.aiderignore`, `.aider.model.settings.yml`                                                                                                                 |
| `amazonq`  | Amazon Q Developer  | `.amazonq/`                                                                                                                                                                    |
| `claude`   | Claude Code         | `**/CLAUDE.md`, `**/CLAUDE.local.md`, `.claude/`, `.mcp.json`                                                                                                                  |
| `cline`    | Cline               | `.clinerules`, `.clinerules/`, `.clineignore`                                                                                                                                  |
| `codex`    | OpenAI Codex        | `**/AGENTS.md`, `.codex/`                                                                                                                                                      |
| `continue` | Continue            | `.continue/`, `.continuerules`                                                                                                                                                 |
| `copilot`  | GitHub Copilot      | `**/AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`, `.github/chatmodes/`, `.github/agents/`, `.github/skills/`, `.vscode/mcp.json` |
| `cursor`   | Cursor              | `.cursor/`, `.cursorrules`, `.cursorignore`, `.cursorindexingignore`                                                                                                           |
| `gemini`   | Gemini CLI          | `**/GEMINI.md`, `.gemini/`                                                                                                                                                     |
| `junie`    | JetBrains Junie     | `.junie/`                                                                                                                                                                      |
| `kiro`     | Kiro                | `.kiro/`                                                                                                                                                                       |
| `opencode` | OpenCode            | `.opencode/`, `opencode.json`, `opencode.jsonc`                                                                                                                                |
| `roo`      | Roo Code            | `.roo/`, `.roorules`, `.roomodes`                                                                                                                                              |
| `windsurf` | Windsurf            | `.windsurf/`, `.windsurfrules`, `.codeiumignore`                                                                                                                               |

These aliases also work: `amazon-q`, `claude-code`, `codeium`, `continue-dev`, `gemini-cli`,
`github-copilot`, `open-code`, `roo-code`, `roocode`.

An unknown key fails the action. The error message lists the known keys.

## Development

```bash
npm ci          # install the dependencies
npm test        # run the unit tests
npm run lint    # run the linter
npm run build   # make the dist bundle
npm run all     # do all of the above
```

The runner uses `dist/index.js`. You must commit the bundle after a source change. The `check-dist`
job of the CI workflow fails if the bundle is not current.

## Licence

MIT. See [LICENSE](LICENSE).
