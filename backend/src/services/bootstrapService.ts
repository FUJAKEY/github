import path from 'path';

import { appEnv } from '../config/env.js';
import { ensureDir, ensureFile } from '../utils/fs.js';

const requiredFiles: Array<{ path: string; initial: string }> = [
  { path: path.join(appEnv.reposRoot, 'users', 'users.json'), initial: '[]' },
  { path: path.join(appEnv.reposRoot, 'auth', 'refresh-tokens.json'), initial: '[]' },
  { path: path.join(appEnv.reposRoot, 'audit', 'log.ndjson'), initial: '' }
];

const requiredDirs = [
  path.join(appEnv.reposRoot, 'repos')
];

export async function bootstrapStorage(): Promise<void> {
  await Promise.all(requiredDirs.map((dir) => ensureDir(dir)));
  await Promise.all(requiredFiles.map((file) => ensureFile(file.path, file.initial)));
}
