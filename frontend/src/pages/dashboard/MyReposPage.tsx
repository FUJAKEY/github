import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MagnifyingGlassIcon, LockClosedIcon, GlobeAmericasIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useRepoStore } from '../../store/repo.ts';
import toast from 'react-hot-toast';

dayjs.extend(relativeTime);
dayjs.locale('ru');

export function MyReposPage() {
  const { repos, reposLoading, fetchRepos } = useRepoStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchRepos().catch((error) => toast.error((error as Error).message));
  }, [fetchRepos]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return repos;
    return repos.filter((repo) => repo.name.toLowerCase().includes(term));
  }, [repos, query]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Мои репозитории</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Быстрый доступ к проектам и веткам</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
            className="w-full rounded-full border border-slate-200 bg-white/80 pl-10 pr-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {reposLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300/70 p-8 text-center">
          <p className="text-lg font-semibold">Репозиториев пока нет</p>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Создайте новый репозиторий и начните работу с ветками, файлами и ревью прямо из браузера.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((repo) => (
            <li key={repo.id}>
              <Link
                to={`/repos/${repo.id}/code`}
                className="block h-full rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800/80 dark:bg-slate-900/60"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{repo.name}</h3>
                  {repo.private ? (
                    <LockClosedIcon className="h-5 w-5 text-slate-400" />
                  ) : (
                    <GlobeAmericasIcon className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{repo.description || 'Без описания'}</p>
                <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
                  <span>Ветка: {repo.defaultBranch}</span>
                  <span>Создан {dayjs(repo.createdAt).fromNow()}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
