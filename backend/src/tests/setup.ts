import path from 'path';
import fsp from 'fs/promises';

import { beforeAll } from 'vitest';

const testRoot = path.join(process.cwd(), 'test-data');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.REPOS_ROOT = path.join(testRoot, 'data');
process.env.PORT = '0';

async function removeDir(target: string): Promise<void> {
  try {
    await fsp.rm(target, { recursive: true, force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return;
    }
    if (code === 'ENOTEMPTY') {
      const entries = await fsp.readdir(target, { withFileTypes: true });
      await Promise.all(
        entries.map((entry) => removeDir(path.join(target, entry.name)))
      );
      await fsp.rm(target, { recursive: true, force: true });
      return;
    }
    throw error;
  }
}

async function clean() {
  await removeDir(testRoot);
}

beforeAll(async () => {
  await clean();
});
