import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

/** Description of a fixture tree. A value of `null` makes a directory. */
export type FixtureTree = Record<string, string | null>;

/** Make a temporary directory with the given files and directories. */
export async function makeFixture(tree: FixtureTree): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'raf-'));
  for (const [relative, content] of Object.entries(tree)) {
    const target = path.join(root, relative);
    if (content === null) {
      await mkdir(target, { recursive: true });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

/** Make a symbolic link inside a fixture. */
export async function makeLink(root: string, from: string, to: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, from)), { recursive: true });
  await symlink(to, path.join(root, from));
}
