import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import DiffViewer from 'react-diff-viewer-continued';
import { ArrowDownOnSquareIcon, ArrowDownTrayIcon, ArrowsRightLeftIcon, FolderPlusIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { RepoTree } from '../../components/RepoTree.tsx';
import { useRepoStore } from '../../store/repo.ts';

export function RepoCodePage() {
  const { repoId } = useParams();
  const {
    currentRepo,
    tree,
    branches,
    fetchTree,
    loadFile,
    selectedFile,
    saveFile,
    createFolder,
    createBranch,
    downloadArchive,
    fetchCommits
  } = useRepoStore();
  const storeBranch = useRepoStore((state) => state.currentBranch);
  const [branch, setBranch] = useState<string>('main');
  const [editorValue, setEditorValue] = useState('');
  const [diffMode, setDiffMode] = useState(false);
  const [mobileView, setMobileView] = useState<'tree' | 'editor'>('editor');

  const language = useMemo(() => detectLanguage(selectedFile?.path ?? 'text'), [selectedFile?.path]);

  useEffect(() => {
    if (!repoId) return;
    const defaultBranch = currentRepo?.defaultBranch ?? 'main';
    setBranch(defaultBranch);
  }, [repoId, currentRepo?.defaultBranch]);

  useEffect(() => {
    if (storeBranch) {
      setBranch(storeBranch);
    }
  }, [storeBranch]);

  useEffect(() => {
    if (!repoId) return;
    fetchTree(repoId, branch).catch((error) => toast.error((error as Error).message));
    useRepoStore.setState({ selectedFile: undefined });
    setEditorValue('');
    fetchCommits(repoId, branch).catch(() => undefined);
  }, [branch, repoId, fetchTree, fetchCommits]);

  useEffect(() => {
    if (selectedFile) {
      setEditorValue(selectedFile.content);
    }
  }, [selectedFile]);

  const handleSave = useCallback(async () => {
    if (!repoId || !selectedFile) return;
    try {
      await saveFile(repoId, {
        path: selectedFile.path,
        branch,
        content: editorValue,
        message: `Update ${selectedFile.path}`
      });
      toast.success('Файл сохранён');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [repoId, selectedFile, saveFile, branch, editorValue]);

  const handleNewFile = useCallback(() => {
    if (!repoId) return;
    const path = window.prompt('Введите путь нового файла');
    if (!path) return;
    setEditorValue('');
    useRepoStore.setState({ selectedFile: { path, content: '', branch } });
    setMobileView('editor');
  }, [repoId, branch]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handleNewFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleNewFile]);

  const hasChanges = useMemo(() => selectedFile && editorValue !== selectedFile.content, [selectedFile, editorValue]);

  const handleSelectFile = (path: string) => {
    if (!repoId) return;
    loadFile(repoId, branch, path).catch((error) => toast.error((error as Error).message));
    setMobileView('editor');
  };

  const handleCreateFolder = async () => {
    if (!repoId) return;
    const folder = window.prompt('Введите путь новой папки');
    if (!folder) return;
    try {
      await createFolder(repoId, { path: folder });
      toast.success('Папка создана');
      await fetchTree(repoId, branch);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleCreateBranch = async () => {
    if (!repoId || !currentRepo) return;
    const name = window.prompt('Название новой ветки');
    if (!name) return;
    try {
      await createBranch(repoId, { name, from: branch });
      toast.success('Ветка создана');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const leftPanel = (
    <aside className="h-[calc(100vh-280px)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Дерево файлов</h3>
        <div className="flex items-center gap-2">
          <button onClick={handleNewFile} className="rounded-full border border-slate-200 p-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            <PlusIcon className="h-4 w-4" />
          </button>
          <button onClick={handleCreateFolder} className="rounded-full border border-slate-200 p-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            <FolderPlusIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <RepoTree nodes={tree} selectedPath={selectedFile?.path} onSelect={handleSelectFile} />
    </aside>
  );

  const editorPanel = (
    <section className="flex h-[calc(100vh-280px)] flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {branches.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white shadow hover:bg-primary-dark disabled:opacity-50"
        >
          <ArrowDownOnSquareIcon className="h-4 w-4" />
          Сохранить (S)
        </button>
        <button
          onClick={() => setDiffMode((prev) => !prev)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${diffMode ? 'border-primary text-primary dark:text-primary-dark' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300'}`}
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
          Diff
        </button>
        <button
          onClick={handleCreateBranch}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Новая ветка
        </button>
        <button
          onClick={() => repoId && downloadArchive(repoId, branch)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Скачать ZIP
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-xl bg-slate-900/5 dark:bg-slate-950/40">
        {diffMode && selectedFile ? (
          <DiffViewer
            oldValue={selectedFile.content}
            newValue={editorValue}
            splitView
            hideLineNumbers={false}
            useDarkTheme
          />
        ) : (
          <Editor
            language={language}
            theme="vs-dark"
            value={editorValue}
            onChange={(value) => setEditorValue(value ?? '')}
            options={{ minimap: { enabled: false }, fontSize: 14 }}
          />
        )}
      </div>
    </section>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
      <div className="hidden lg:block">{leftPanel}</div>
      <div className="lg:hidden">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setMobileView('tree')}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${mobileView === 'tree' ? 'bg-primary text-white' : 'bg-white/70 dark:bg-slate-900/60'}`}
          >
            Дерево
          </button>
          <button
            onClick={() => setMobileView('editor')}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${mobileView === 'editor' ? 'bg-primary text-white' : 'bg-white/70 dark:bg-slate-900/60'}`}
          >
            Файл
          </button>
        </div>
        {mobileView === 'tree' ? leftPanel : editorPanel}
      </div>
      <div className="hidden lg:block">{editorPanel}</div>
    </div>
  );
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'css':
    case 'scss':
      return 'css';
    case 'html':
      return 'html';
    case 'py':
      return 'python';
    case 'java':
      return 'java';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'yml':
    case 'yaml':
      return 'yaml';
    default:
      return 'plaintext';
  }
}
