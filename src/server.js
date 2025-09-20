const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const SERVER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.join(SERVER_ROOT, 'Repo');
const UPLOAD_DIR = path.join(SERVER_ROOT, '.uploads');

fs.mkdirSync(REPO_ROOT, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    cb(null, `${timestamp}-${sanitizedOriginal}`);
  }
});

const upload = multer({ storage });

function ensureInsideRepo(absolutePath) {
  const relative = path.relative(REPO_ROOT, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('Запрошенный путь выходит за пределы директории Repo.');
    error.statusCode = 400;
    throw error;
  }
  return absolutePath;
}

function resolveRepoPath(target = '.') {
  const normalized = target && typeof target === 'string' ? target.trim() : '.';
  const absolutePath = path.resolve(REPO_ROOT, normalized || '.');
  return ensureInsideRepo(absolutePath);
}

function toRepoRelative(absolutePath) {
  const relative = path.relative(REPO_ROOT, absolutePath);
  return relative || '.';
}

function isTruthy(value) {
  if (value === undefined || value === null) {
    return false;
  }
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function extractZipArchive(zipFilePath, destinationPath) {
  const zip = new AdmZip(zipFilePath);
  const entries = zip.getEntries();
  const extractedItems = [];

  for (const entry of entries) {
    const entryAbsolutePath = path.resolve(destinationPath, entry.entryName);
    const relativeToDestination = path.relative(destinationPath, entryAbsolutePath);
    if (relativeToDestination.startsWith('..') || path.isAbsolute(relativeToDestination)) {
      const error = new Error(`Небезопасный путь внутри архива: ${entry.entryName}`);
      error.statusCode = 400;
      throw error;
    }
    ensureInsideRepo(entryAbsolutePath);

    if (entry.isDirectory) {
      await fsPromises.mkdir(entryAbsolutePath, { recursive: true });
      extractedItems.push(toRepoRelative(entryAbsolutePath));
    } else {
      await fsPromises.mkdir(path.dirname(entryAbsolutePath), { recursive: true });
      const data = entry.getData();
      await fsPromises.writeFile(entryAbsolutePath, data);
      extractedItems.push(toRepoRelative(entryAbsolutePath));
    }
  }

  return extractedItems;
}

async function buildTree(currentPath) {
  const dirents = await fsPromises.readdir(currentPath, { withFileTypes: true });
  const children = [];

  for (const dirent of dirents) {
    if (['node_modules', '.git'].includes(dirent.name)) {
      continue;
    }

    const childAbsolute = path.join(currentPath, dirent.name);
    const childRelative = toRepoRelative(childAbsolute);

    if (dirent.isSymbolicLink()) {
      continue;
    }

    if (dirent.isDirectory()) {
      children.push({
        name: dirent.name,
        path: childRelative,
        type: 'directory',
        children: await buildTree(childAbsolute)
      });
    } else if (dirent.isFile()) {
      children.push({
        name: dirent.name,
        path: childRelative,
        type: 'file'
      });
    } else {
      children.push({
        name: dirent.name,
        path: childRelative,
        type: 'other'
      });
    }
  }

  children.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }

    if (a.type === 'directory') {
      return -1;
    }

    if (b.type === 'directory') {
      return 1;
    }

    return a.name.localeCompare(b.name);
  });

  return children;
}

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Файловый API запущен',
    repositoryRoot: `/${path.basename(REPO_ROOT)}`,
    routes: {
      downloadArchive: '/download',
      apiBase: '/api',
      upload: '/api/upload',
      tree: '/api/tree',
      apiDownload: '/api/download',
      delete: '/api/delete'
    }
  });
});

app.post('/api/upload', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл для загрузки не найден.' });
  }

  const destinationInput = req.body.destination ?? req.query.destination ?? '.';
  const shouldExtract = isTruthy(req.query.extract ?? req.body.extract);

  try {
    const destinationPath = resolveRepoPath(destinationInput || '.');
    await fsPromises.mkdir(destinationPath, { recursive: true });

    if (shouldExtract) {
      const extension = path.extname(req.file.originalname).toLowerCase();
      if (extension !== '.zip') {
        await fsPromises.rm(req.file.path, { force: true });
        return res.status(400).json({ error: 'Параметр extract=true доступен только для ZIP-архивов.' });
      }

      const extractedEntries = await extractZipArchive(req.file.path, destinationPath);
      await fsPromises.rm(req.file.path, { force: true });

      return res.json({
        status: 'extracted',
        originalName: req.file.originalname,
        destination: toRepoRelative(destinationPath),
        items: extractedEntries
      });
    }

    const finalFileName = path.basename(req.file.originalname);
    const finalDestination = path.join(destinationPath, finalFileName);
    const finalAbsolutePath = ensureInsideRepo(finalDestination);

    await fsPromises.mkdir(path.dirname(finalAbsolutePath), { recursive: true });
    await fsPromises.rename(req.file.path, finalAbsolutePath);

    return res.json({
      status: 'uploaded',
      originalName: req.file.originalname,
      storedAs: toRepoRelative(finalAbsolutePath)
    });
  } catch (error) {
    await fsPromises.rm(req.file.path, { force: true }).catch(() => {});
    next(error);
  }
});

async function handleArchiveDownload(req, res, next) {
  try {
    const requestedPath = req.query.path ?? '.';
    const absoluteTarget = resolveRepoPath(requestedPath || '.');
    const stats = await fsPromises.stat(absoluteTarget);
    const baseName = stats.isDirectory()
      ? path.basename(absoluteTarget) || path.basename(REPO_ROOT)
      : path.basename(absoluteTarget);

    res.attachment(`${baseName}.zip`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => next(err));
    archive.pipe(res);

    if (stats.isDirectory()) {
      const rootFolderName = path.relative(REPO_ROOT, absoluteTarget) || baseName;
      archive.directory(absoluteTarget, rootFolderName);
    } else {
      archive.file(absoluteTarget, { name: path.basename(absoluteTarget) });
    }

    archive.finalize().catch((error) => next(error));
  } catch (error) {
    next(error);
  }
}

app.get('/download', handleArchiveDownload);
app.get('/api/download', handleArchiveDownload);

app.get('/api/tree', async (req, res, next) => {
  try {
    const tree = await buildTree(REPO_ROOT);
    res.json({
      name: path.basename(REPO_ROOT),
      path: '.',
      type: 'directory',
      children: tree
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/delete', async (req, res, next) => {
  const { targetPath } = req.body || {};
  if (!targetPath || typeof targetPath !== 'string') {
    return res.status(400).json({ error: 'Параметр targetPath обязателен.' });
  }

  try {
    const absoluteTarget = resolveRepoPath(targetPath);

    if (absoluteTarget === REPO_ROOT) {
      return res.status(400).json({ error: 'Удаление корневой директории Repo запрещено.' });
    }

    let entityType = 'unknown';
    try {
      const stats = await fsPromises.stat(absoluteTarget);
      if (stats.isDirectory()) {
        entityType = 'directory';
      } else if (stats.isFile()) {
        entityType = 'file';
      }
    } catch (statError) {
      if (statError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Указанный путь не существует.' });
      }
      throw statError;
    }

    await fsPromises.rm(absoluteTarget, { recursive: true, force: true });

    res.json({
      status: 'deleted',
      type: entityType,
      path: toRepoRelative(absoluteTarget)
    });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Внутренняя ошибка сервера.'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
  });
}

module.exports = app;
