import { FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { useRepoStore } from '../../store/repo.ts';

export function RepoSettingsPage() {
  const { repoId } = useParams();
  const { currentRepo, updateRepo, removeCollaborator, tokens, fetchTokens, createToken, deleteToken, generatedToken } =
    useRepoStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [tokenPermission, setTokenPermission] = useState<'read' | 'write'>('read');
  const [tokenLoading, setTokenLoading] = useState(false);

  useEffect(() => {
    if (currentRepo) {
      setName(currentRepo.name);
      setDescription(currentRepo.description);
      setIsPrivate(currentRepo.private);
    }
  }, [currentRepo]);

  useEffect(() => {
    if (repoId && currentRepo?.permission === 'owner') {
      fetchTokens(repoId).catch(() => {
        toast.error('Не удалось загрузить токены');
      });
    }
  }, [repoId, currentRepo?.permission, fetchTokens]);

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

  const handleCreateToken = async (event: FormEvent) => {
    event.preventDefault();
    if (!repoId || tokenName.trim().length === 0) return;
    setTokenLoading(true);
    try {
      await createToken(repoId, { name: tokenName.trim(), permission: tokenPermission });
      setTokenName('');
      setTokenPermission('read');
      toast.success('Токен создан');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    if (!repoId) return;
    if (!window.confirm('Удалить токен?')) return;
    try {
      await deleteToken(repoId, tokenId);
      toast.success('Токен удалён');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleCopySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Токен скопирован в буфер обмена');
    } catch (error) {
      toast.error('Не удалось скопировать токен');
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return '—';
    return new Date(value).toLocaleString();
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

        {currentRepo.permission === 'owner' && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/70 dark:bg-slate-900/60">
            <h4 className="text-sm font-semibold">API токены</h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Используйте токены для обращения к API без авторизации по cookie. Токен со scope `write` позволяет изменять файлы и
              структуры репозитория.
            </p>
            <form onSubmit={handleCreateToken} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Название токена</label>
                <input
                  value={tokenName}
                  onChange={(event) => setTokenName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Например, CI/CD"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Права</label>
                <select
                  value={tokenPermission}
                  onChange={(event) => setTokenPermission(event.target.value as 'read' | 'write')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="read">Read — только чтение</option>
                  <option value="write">Write — чтение и запись</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={tokenLoading || tokenName.trim().length === 0}
                className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
              >
                Создать токен
              </button>
            </form>

            {generatedToken && (
              <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="font-semibold text-amber-700 dark:text-amber-300">Секрет токена — сохраните его сейчас!</p>
                <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm dark:bg-slate-900">
                  {generatedToken.secret}
                </code>
                <button
                  onClick={() => handleCopySecret(generatedToken.secret)}
                  className="rounded-full border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-100 dark:border-amber-500/60 dark:text-amber-200 dark:hover:bg-amber-500/20"
                >
                  Скопировать токен
                </button>
              </div>
            )}

            <div className="mt-4 space-y-3 text-xs">
              {tokens.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">Токены пока не созданы.</p>
              ) : (
                <ul className="space-y-3">
                  {tokens.map((token) => (
                    <li key={token.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800/70">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{token.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Права: {token.permission === 'write' ? 'write (чтение и запись)' : 'read (только чтение)'}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            Создан: {formatDate(token.createdAt)}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            Последнее использование: {formatDate(token.lastUsedAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteToken(token.id)}
                          className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
