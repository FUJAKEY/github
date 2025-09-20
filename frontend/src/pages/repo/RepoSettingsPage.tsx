import { FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { useRepoStore } from '../../store/repo.ts';

export function RepoSettingsPage() {
  const { repoId } = useParams();
  const { currentRepo, updateRepo, removeCollaborator } = useRepoStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentRepo) {
      setName(currentRepo.name);
      setDescription(currentRepo.description);
      setIsPrivate(currentRepo.private);
    }
  }, [currentRepo]);

  if (!repoId || !currentRepo) {
    return <p className="text-sm text-slate-500">Загрузка настроек...</p>;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await updateRepo(repoId, { name, description, private: isPrivate });
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRotateInviteCode = async () => {
    try {
      await updateRepo(repoId, { rotateInviteCode: true });
      toast.success('Код приглашения обновлён');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    if (!window.confirm('Удалить коллаборатора?')) return;
    try {
      await removeCollaborator(repoId, userId);
      toast.success('Коллаборатор удалён');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleCopyInvite = async () => {
    if (!currentRepo.inviteCode) return;
    try {
      await navigator.clipboard.writeText(currentRepo.inviteCode);
      toast.success('Код скопирован в буфер обмена');
    } catch (error) {
      toast.error('Не удалось скопировать код');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/70 dark:bg-slate-900/60">
        <h3 className="text-lg font-semibold">Основные настройки</h3>
        <div>
          <label className="mb-1 block text-sm font-semibold">Название</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Описание</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
          Приватный репозиторий
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          Сохранить изменения
        </button>
      </form>

      <div className="space-y-4">
        {currentRepo.permission === 'owner' && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/70 dark:bg-slate-900/60">
            <h4 className="text-sm font-semibold">Код приглашения</h4>
            <p className="mt-2 break-all rounded-xl bg-slate-100 px-3 py-2 text-xs font-mono dark:bg-slate-800">
              {currentRepo.inviteCode ?? 'Недоступен'}
            </p>
            <div className="mt-3 flex gap-2 text-sm">
              <button onClick={handleCopyInvite} className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                Скопировать
              </button>
              <button onClick={handleRotateInviteCode} className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                Обновить
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/70 dark:bg-slate-900/60">
          <h4 className="text-sm font-semibold">Коллабораторы</h4>
          {currentRepo.collaborators.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Пока никто не подключён.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {currentRepo.collaborators.map((collaborator) => (
                <li key={collaborator.userId} className="flex items-center justify-between rounded-xl border border-slate-200/60 px-3 py-2 dark:border-slate-800/60">
                  <div>
                    <p className="font-semibold">{collaborator.userId}</p>
                    <p className="text-xs text-slate-500">Роль: {collaborator.role}</p>
                  </div>
                  {currentRepo.permission === 'owner' && (
                    <button
                      onClick={() => handleRemoveCollaborator(collaborator.userId)}
                      className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Удалить
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
