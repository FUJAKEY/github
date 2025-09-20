import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

import lockfile from 'proper-lockfile';

import { logger } from './logger.js';

const LOCK_OPTIONS = {
  retries: {
    retries: 5,
    factor: 2,
    minTimeout: 50
  }
} as const;

export async function ensureDir(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true });
}

export async function ensureFile(filePath: string, fallbackContent = '[]'): Promise<void> {
  await ensureDir(path.dirname(filePath));
  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch (error) {
    await fsp.writeFile(filePath, fallbackContent, 'utf8');
  }
}

async function createBackup(filePath: string, maxBackups = 5): Promise<void> {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      return;
    }
  } catch (error) {
    return;
  }

  const backupDir = path.join(path.dirname(filePath), 'backups');
  await ensureDir(backupDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`);
  await fsp.copyFile(filePath, backupPath);

  const files = await fsp.readdir(backupDir);
  const backups = await Promise.all(
    files
      .filter((file) => file.startsWith(path.basename(filePath)))
      .map(async (file) => ({
        file,
        time: (await fsp.stat(path.join(backupDir, file))).mtimeMs
      })),
  );
  const expired = backups.sort((a, b) => b.time - a.time).slice(maxBackups);
  await Promise.all(expired.map((backup) => fsp.unlink(path.join(backupDir, backup.file))));
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  await ensureFile(filePath, JSON.stringify(fallback, null, 2));
  const release = await lockfile.lock(filePath, LOCK_OPTIONS);
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } finally {
    await release();
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureFile(filePath, JSON.stringify(data, null, 2));
  const release = await lockfile.lock(filePath, LOCK_OPTIONS);
  try {
    await createBackup(filePath);
    const tmpPath = `${filePath}.tmp`;
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmpPath, filePath);
  } finally {
    try {
      await release();
    } catch (error) {
      logger.error({ error }, 'Failed to release lock for %s', filePath);
    }
  }
}

export async function updateJsonFile<T>(filePath: string, fallback: T, mutate: (data: T) => void): Promise<T> {
  await ensureFile(filePath, JSON.stringify(fallback, null, 2));
  const release = await lockfile.lock(filePath, LOCK_OPTIONS);
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    const json = content.trim().length ? (JSON.parse(content) as T) : fallback;
    mutate(json);
    await createBackup(filePath);
    const tmpPath = `${filePath}.tmp`;
    await fsp.writeFile(tmpPath, JSON.stringify(json, null, 2), 'utf8');
    await fsp.rename(tmpPath, filePath);
    return json;
  } finally {
    await release();
  }
}

export async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureFile(filePath, '');
  const release = await lockfile.lock(filePath, LOCK_OPTIONS);
  try {
    await fsp.appendFile(filePath, `${line}\n`, 'utf8');
  } finally {
    await release();
  }
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}
