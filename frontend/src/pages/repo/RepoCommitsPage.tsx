import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { useRepoStore } from '../../store/repo.ts';

export function RepoCommitsPage() {
  const { repoId } = useParams();
  const { commits, fetchCommits, branches, fetchDiff, diff } = useRepoStore();
  const [branch, setBranch] = useState<string>('main');
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

  const branchKey = useMemo(() => branches.map((b) => b.name).join('|'), [branches]);

  useEffect(() => {
    if (!repoId) return;
    const defaultBranch = branches.find((item) => item.isCurrent)?.name ?? branches[0]?.name ?? 'main';
    setBranch(defaultBranch);
  }, [repoId, branchKey, branches]);

  useEffect(() => {
    if (!repoId) return;
    fetchCommits(repoId, branch).catch((error) => toast.error((error as Error).message));
  }, [repoId, branch, fetchCommits]);

  const handleSelectCommit = async (oid: string, parent?: string) => {
    if (!repoId) return;
    setSelectedCommit(oid);
    useRepoStore.setState({ diff: undefined });
    if (!parent) {
      toast('Первый коммит без diff');
      return;
    }
    try {
      await fetchDiff(repoId, parent, oid);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
      <aside className="h-[calc(100vh-320px)] overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-800/70 dark:bg-slate-900/60">
        <div className="mb-4 flex items-center gap-2">
          <select
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            className="w-full rounded-full border border-slate-200 bg-white px-3 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {branches.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <ul className="space-y-3 text-sm">
          {commits.map((commit) => (
            <li key={commit.oid}>
              <button
                onClick={() => handleSelectCommit(commit.oid, commit.parent)}
                className={`w-full rounded-2xl border px-3 py-2 text-left ${selectedCommit === commit.oid ? 'border-primary bg-primary/10 text-primary dark:text-primary-dark' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <p className="font-semibold">{commit.message}</p>
                <p className="text-xs text-slate-500">
                  {commit.author.name} · {new Date(commit.committedAt).toLocaleString('ru-RU')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-800/70 dark:bg-slate-900/60">
        <h4 className="mb-4 text-sm font-semibold">Diff выбранного коммита</h4>
        {diff ? (
          <pre className="max-h-[calc(100vh-360px)] overflow-auto rounded-xl bg-slate-900/5 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
            {diff}
          </pre>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Выберите коммит, чтобы увидеть изменения.</p>
        )}
      </section>
    </div>
  );
}
