import { useState } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { useRepoStore } from '../../store/repo.ts';

export function RepoBranchesPage() {
  const { repoId } = useParams();
  const { branches, currentRepo, createBranch, deleteBranch, checkoutBranch, fetchTree, fetchCommits } = useRepoStore();
  const [creating, setCreating] = useState(false);
  const [branchName, setBranchName] = useState('');

  if (!repoId) {
    return null;
  }

  const handleCreate = async () => {
    if (!branchName.trim()) {
      toast.error('Введите название ветки');
      return;
    }
    try {
      await createBranch(repoId, { name: branchName.trim(), from: currentRepo?.defaultBranch });
      toast.success('Ветка создана');
      setBranchName('');
      setCreating(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Удалить ветку ${name}?`)) return;
    try {
      await deleteBranch(repoId, name);
      toast.success('Ветка удалена');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleCheckout = async (name: string) => {
    try {
      await checkoutBranch(repoId, name);
      await Promise.all([fetchTree(repoId, name), fetchCommits(repoId, name)]);
      toast.success(`Активная ветка: ${name}`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Управление ветками</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Создавайте, переключайте и удаляйте ветки</p>
        </div>
        <div className="flex items-center gap-2">
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="feature/refactor"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                onClick={handleCreate}
                className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Создать
              </button>
              <button onClick={() => setCreating(false)} className="text-sm text-slate-500">
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Новая ветка
            </button>
          )}
        </div>
      </div>

      <ul className="space-y-3">
        {branches.map((branch) => (
          <li
            key={branch.name}
            className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-sm font-semibold">{branch.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {branch.isDefault ? 'Основная ветка' : branch.isCurrent ? 'Текущая ветка' : 'Ветка'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {!branch.isCurrent && (
                <button
                  onClick={() => handleCheckout(branch.name)}
                  className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Сделать активной
                </button>
              )}
              {!branch.isDefault && (
                <button
                  onClick={() => handleDelete(branch.name)}
                  className="rounded-full border border-red-200 px-3 py-1 text-red-600 hover:bg-red-50"
                >
                  Удалить
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
