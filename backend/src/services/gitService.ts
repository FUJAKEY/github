import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import stream from 'stream';
import { promisify } from 'util';

import archiver from 'archiver';
import { createTwoFilesPatch } from 'diff';
import {
  Errors as gitErrors,
  TREE as gitTree,
  WORKDIR as gitWorkdir,
  add as gitAdd,
  branch as gitBranch,
  checkout as gitCheckout,
  commit as gitCommit,
  currentBranch as gitCurrentBranch,
  deleteBranch as gitDeleteBranch,
  listBranches as gitListBranches,
  listFiles as gitListFiles,
  log as gitLog,
  remove as gitRemove,
  walk as gitWalk
} from 'isomorphic-git';
import type { WalkerEntry } from 'isomorphic-git';

import { MAX_FILE_SIZE_BYTES, MAX_REPO_SIZE_BYTES } from '../config/constants.js';
import { RepoMetadata } from '../types/domain.js';
import { withRepoLock } from '../utils/locks.js';
import { ensureDir, pathExists } from '../utils/fs.js';

const pipeline = promisify(stream.pipeline);

export interface BranchInfo {
  name: string;
  isDefault: boolean;
  isCurrent: boolean;
}

export async function listBranches(repoDir: string, current: string): Promise<BranchInfo[]> {
  const branches = await gitListBranches({ fs, dir: repoDir });
  return branches.map((name) => ({
    name,
    isDefault: name === 'main',
    isCurrent: name === current
  }));
}

export async function getCurrentBranch(repoDir: string): Promise<string> {
  const current = await gitCurrentBranch({ fs, dir: repoDir, fullname: false });
  return current ?? 'main';
}

export async function createBranch(repo: RepoMetadata, repoDir: string, branch: string, from = repo.defaultBranch): Promise<void> {
  await withRepoLock(repo.id, async () => {
    await gitCheckout({ fs, dir: repoDir, ref: from });
    await gitBranch({ fs, dir: repoDir, ref: branch, checkout: false });
  });
}

export async function deleteBranch(repo: RepoMetadata, repoDir: string, branch: string): Promise<void> {
  if (branch === repo.defaultBranch) {
    throw new Error('Cannot delete default branch');
  }
  await withRepoLock(repo.id, async () => {
    await gitDeleteBranch({ fs, dir: repoDir, ref: branch });
  });
}

export async function checkoutBranch(repo: RepoMetadata, repoDir: string, branch: string): Promise<void> {
  await withRepoLock(repo.id, async () => {
    await gitCheckout({ fs, dir: repoDir, ref: branch });
  });
}

export interface CommitInfo {
  oid: string;
  message: string;
  author: { name: string; email: string };
  committer: { name: string; email: string };
  committedAt: string;
  parent?: string;
}

export async function listCommits(repoDir: string, branch: string, limit = 50): Promise<CommitInfo[]> {
  const log = await gitLog({ fs, dir: repoDir, ref: branch, depth: limit });
  return log.map((entry) => ({
    oid: entry.oid,
    message: entry.commit.message,
    author: entry.commit.author as CommitInfo['author'],
    committer: entry.commit.committer as CommitInfo['committer'],
    committedAt: new Date(entry.commit.author.timestamp * 1000).toISOString(),
    parent: entry.commit.parent?.[0]
  }));
}

export async function getDiff(repoDir: string, from: string, to: string): Promise<string> {
  return diffBetweenTrees(repoDir, from, to);
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
  size?: number;
}

export async function getTree(repoDir: string, branch: string, targetPath = ''): Promise<TreeNode[]> {
  const files = await gitListFiles({ fs, dir: repoDir, ref: branch });
  const normalized = targetPath ? targetPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
  const prefix = normalized ? `${normalized}/` : '';
  const treeMap = new Map<string, TreeNode>();

  const relevant = normalized
    ? files.filter((file) => file === normalized || file.startsWith(prefix))
    : files;

  for (const file of relevant) {
    const relative = normalized ? file.slice(prefix.length) : file;
    if (!relative) {
      continue;
    }
    const segments = relative.split('/');
    let currentPath = normalized;
    let parentKey = normalized || '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const key = currentPath;
      if (!treeMap.has(key)) {
        const node: TreeNode = {
          name: segment,
          path: currentPath,
          type: i === segments.length - 1 ? 'file' : 'dir',
          children: i === segments.length - 1 ? undefined : []
        };
        treeMap.set(key, node);
        if (parentKey) {
          const parent = treeMap.get(parentKey);
          if (parent) {
            parent.children = parent.children ?? [];
            parent.children.push(node);
          }
        }
      }
      parentKey = key;
    }
  }

  const roots = normalized
    ? treeMap.get(normalized)?.children ?? []
    : Array.from(treeMap.values()).filter((node) => !node.path.includes('/'));

  return roots.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFile(repoDir: string, branch: string, filePath: string): Promise<string> {
  let content: string | null = null;
  await gitWalk({
    fs,
    dir: repoDir,
    trees: [gitTree({ ref: branch })],
    map: async (filepath, entries) => {
      const [entry] = entries;
      if (!entry || filepath !== filePath) {
        return;
      }
      if ((await entry.type()) !== 'blob') {
        return;
      }
      content = await readEntryContent(entry);
    }
  });

  if (content === null) {
    throw new Error('File not found');
  }

  return content;
}

interface CommitOptions {
  message: string;
  author: { name: string; email: string };
}

async function calculateRepoSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === '.git') {
      continue;
    }
    if (entry.isDirectory()) {
      total += await calculateRepoSize(fullPath);
    } else {
      const stat = await fsp.stat(fullPath);
      total += stat.size;
    }
  }
  return total;
}

async function ensureFileSize(content: string): Promise<void> {
  const size = Buffer.byteLength(content, 'utf8');
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds maximum allowed size');
  }
}

export async function writeFileToRepo(
  repo: RepoMetadata,
  repoDir: string,
  filePath: string,
  content: string,
  branch: string,
  options: CommitOptions
): Promise<void> {
  await ensureFileSize(content);
  await withRepoLock(repo.id, async () => {
    await checkoutForWrite(repo, repoDir, branch);
    const target = path.join(repoDir, filePath);
    await ensureDir(path.dirname(target));
    const exists = await pathExists(target);
    let previousSize = 0;
    if (exists) {
      const stat = await fsp.stat(target);
      previousSize = stat.size;
    }
    const currentSize = await calculateRepoSize(repoDir);
    const newSize = currentSize - previousSize + Buffer.byteLength(content, 'utf8');
    if (newSize > MAX_REPO_SIZE_BYTES) {
      throw new Error('Repository size limit exceeded');
    }
    await fsp.writeFile(target, content, 'utf8');
    await gitAdd({ fs, dir: repoDir, filepath: filePath });
    await gitCommit({
      fs,
      dir: repoDir,
      message: options.message,
      author: options.author,
      committer: options.author
    });
  });
}

export async function deleteFileFromRepo(
  repo: RepoMetadata,
  repoDir: string,
  filePath: string,
  branch: string,
  options: CommitOptions
): Promise<void> {
  await withRepoLock(repo.id, async () => {
    await checkoutForWrite(repo, repoDir, branch);
    const target = path.join(repoDir, filePath);
    await fsp.rm(target, { force: true });
    await gitRemove({ fs, dir: repoDir, filepath: filePath });
    await gitCommit({
      fs,
      dir: repoDir,
      message: options.message,
      author: options.author,
      committer: options.author
    });
  });
}

export async function createFolder(repo: RepoMetadata, repoDir: string, folderPath: string): Promise<void> {
  await withRepoLock(repo.id, async () => {
    const target = path.join(repoDir, folderPath);
    await ensureDir(target);
  });
}

export async function streamArchive(
  repo: RepoMetadata,
  repoDir: string,
  branch: string,
  output: NodeJS.WritableStream
): Promise<void> {
  await withRepoLock(repo.id, async () => {
    await checkoutForWrite(repo, repoDir, branch);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.directory(repoDir, false, (entry) => {
      if (entry.name.startsWith('.git')) {
        return false;
      }
      return entry;
    });
    archive.on('error', (error) => {
      throw error;
    });
    archive.finalize();
    await pipeline(archive, output);
  });
}

export async function getDiffBetweenRefs(repoDir: string, from: string, to: string): Promise<string> {
  return diffBetweenTrees(repoDir, from, to);
}

export async function getWorkingDiff(repoDir: string, branch: string): Promise<string> {
  return diffUsingWalk(repoDir, branch, 'WORKDIR', [gitTree({ ref: branch }), gitWorkdir()]);
}

async function diffBetweenTrees(repoDir: string, from: string, to: string): Promise<string> {
  return diffUsingWalk(repoDir, from, to, [gitTree({ ref: from }), gitTree({ ref: to })]);
}

type WalkerList = Parameters<typeof gitWalk>[0]['trees'];

async function diffUsingWalk(
  repoDir: string,
  fromLabel: string,
  toLabel: string,
  trees: WalkerList
): Promise<string> {
  const patches: string[] = [];
  await gitWalk({
    fs,
    dir: repoDir,
    trees,
    map: async (filepath: string, entries: (WalkerEntry | null)[]) => {
      const fromEntry = entries[0] ?? null;
      const toEntry = entries[1] ?? null;
      if (!filepath || filepath === '.git') {
        return;
      }

      const [fromType, toType] = await Promise.all([fromEntry?.type?.(), toEntry?.type?.()]);
      const isFromBlob = fromType === 'blob';
      const isToBlob = toType === 'blob';

      if (!isFromBlob && !isToBlob) {
        return;
      }

      const fromContent = isFromBlob && fromEntry ? await readEntryContent(fromEntry) : '';
      const toContent = isToBlob && toEntry ? await readEntryContent(toEntry) : '';

      if (fromContent === toContent) {
        return;
      }

      const patch = createTwoFilesPatch(
        isFromBlob ? `a/${filepath}` : '/dev/null',
        isToBlob ? `b/${filepath}` : '/dev/null',
        fromContent,
        toContent,
        fromLabel,
        toLabel,
        { context: 3 }
      );
      patches.push(patch);
    }
  });

  return patches.join('\n');
}

async function readEntryContent(entry: WalkerEntry): Promise<string> {
  const raw = (await entry.content?.()) ?? new Uint8Array();
  return Buffer.from(raw).toString('utf8');
}

async function checkoutForWrite(repo: RepoMetadata, repoDir: string, branch: string): Promise<void> {
  try {
    await gitCheckout({ fs, dir: repoDir, ref: branch });
  } catch (error) {
    if (error instanceof gitErrors.NotFoundError && branch === repo.defaultBranch) {
      return;
    }
    throw error;
  }
}
