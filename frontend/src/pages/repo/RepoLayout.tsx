import { useEffect, useMemo } from 'react';
import { NavLink, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useRepoStore } from '../../store/repo.ts';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';

const tabs = [
  { path: 'code', label: 'Code' },
  { path: 'branches', label: 'Branches' },
  { path: 'commits', label: 'Commits' },
  { path: 'settings', label: 'Settings' }
];

export function RepoLayout() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentRepo, branches, loadRepo, fetchBranches, fetchTree, fetchCommits } = useRepoStore();

  useEffect(() => {
    if (!repoId) return;
    const bootstrap = async () => {
      try {
        await loadRepo(repoId);
        const branch = useRepoStore.getState().currentRepo?.defaultBranch ?? 'main';
        await Promise.all([
          fetchBranches(repoId),
          fetchTree(repoId, branch),
          fetchCommits(repoId, branch)
        ]);
      } catch (error) {
        toast.error((error as Error).message);
        navigate('/', { replace: true });
      }
    };
    void bootstrap();
  }, [repoId, loadRepo, fetchBranches, fetchTree, fetchCommits, navigate]);

  const title = currentRepo ? `${currentRepo.name}` : 'Загрузка...';

  const activeTab = useMemo(() => {
    const match = tabs.find((tab) => location.pathname.endsWith(tab.path));
    return match?.path ?? 'code';
  }, [location.pathname]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="hidden rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 lg:inline-flex"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl font-semibold">{title}</h2>
            {currentRepo && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Доступ: {currentRepo.permission === 'owner' ? 'Владелец' : currentRepo.permission === 'write' ? 'Редактор' : 'Читатель'}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          {branches.slice(0, 3).map((branch) => (
            <span
              key={branch.name}
              className={`rounded-full border px-3 py-1 ${branch.isCurrent ? 'border-primary text-primary dark:text-primary-dark' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}
            >
              {branch.name}
            </span>
          ))}
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm font-medium">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `rounded-full px-4 py-2 transition ${isActive || activeTab === tab.path ? 'bg-primary text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
