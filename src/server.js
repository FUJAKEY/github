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
fs.mkdirSync(REPO_ROOT, { recursive: true });

const legacyUploadsDir = path.join(SERVER_ROOT, 'uploads');
if (fs.existsSync(legacyUploadsDir)) {
  fs.rmSync(legacyUploadsDir, { recursive: true, force: true });
}

app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

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

async function extractZipArchive(zipBuffer, destinationPath) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const extractedItems = [];
  const seenFilePaths = new Set();

  for (const entry of entries) {
    const entryAbsolutePath = path.resolve(destinationPath, entry.entryName);
    const relativeToDestination = path.relative(destinationPath, entryAbsolutePath);
    if (relativeToDestination.startsWith('..') || path.isAbsolute(relativeToDestination)) {
      const error = new Error(`Небезопасный путь внутри архива: ${entry.entryName}`);
      error.statusCode = 400;
      throw error;
    }
    ensureInsideRepo(entryAbsolutePath);

    const normalizedAbsolutePath = path.normalize(entryAbsolutePath);
    if (!entry.isDirectory) {
      if (seenFilePaths.has(normalizedAbsolutePath)) {
        const duplicateError = new Error(`Архив содержит дублирующийся файл: ${entry.entryName}`);
        duplicateError.statusCode = 400;
        throw duplicateError;
      }
      seenFilePaths.add(normalizedAbsolutePath);
    }

    try {
      const stats = await fsPromises.stat(entryAbsolutePath);
      if (entry.isDirectory && stats.isDirectory()) {
        continue;
      }

      const conflictError = new Error(
        `Путь ${toRepoRelative(entryAbsolutePath)} уже существует. Удалите его перед распаковкой архива.`
      );
      conflictError.statusCode = 409;
      throw conflictError;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

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
        return res.status(400).json({ error: 'Параметр extract=true доступен только для ZIP-архивов.' });
      }

      const extractedEntries = await extractZipArchive(req.file.buffer, destinationPath);

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

    try {
      await fsPromises.access(finalAbsolutePath, fs.constants.F_OK);
      return res.status(409).json({
        error: `Файл ${toRepoRelative(finalAbsolutePath)} уже существует. Удалите его или выберите другое имя.`
      });
    } catch (accessError) {
      if (accessError.code !== 'ENOENT') {
        throw accessError;
      }
    }

    await fsPromises.mkdir(path.dirname(finalAbsolutePath), { recursive: true });
    await fsPromises.writeFile(finalAbsolutePath, req.file.buffer);

    return res.json({
      status: 'uploaded',
      originalName: req.file.originalname,
      storedAs: toRepoRelative(finalAbsolutePath)
    });
  } catch (error) {
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
