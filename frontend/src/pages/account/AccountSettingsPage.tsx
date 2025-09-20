import { FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { useAccountStore } from '../../store/account.ts';

export function AccountSettingsPage() {
  const { tokens, loading, generatedToken, fetchTokens, createToken, deleteToken, clearGenerated } = useAccountStore();
  const [name, setName] = useState('');
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTokens().catch((error) => {
      toast.error((error as Error).message);
    });
    return () => clearGenerated();
  }, [fetchTokens, clearGenerated]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    setSubmitting(true);
    try {
      await createToken({ name: name.trim(), permission });
      toast.success('Токен создан');
      setName('');
      setPermission('read');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tokenId: string) => {
    if (!window.confirm('Удалить токен?')) return;
    try {
      await deleteToken(tokenId);
      toast.success('Токен удалён');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Скопировано');
    } catch (error) {
      toast.error('Не удалось скопировать');
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return '—';
    return new Date(value).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <h2 className="text-lg font-semibold">Персональные API токены</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Используйте эти токены для сценариев CI/CD и интеграций. Токен <strong>write</strong> позволяет изменять файлы и ветки,
          <strong>read</strong> ограничивается чтением.
        </p>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 md:grid-cols-[2fr,1fr,auto]">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Название</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Например, Deploy token"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Права</label>
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value as 'read' | 'write')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="read">Read — только чтение</option>
              <option value="write">Write — чтение и запись</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting || name.trim().length === 0 || loading}
            className="self-end rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-dark disabled:opacity-60"
          >
            Создать токен
          </button>
        </form>

        {generatedToken && (
          <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="font-semibold text-amber-700 dark:text-amber-300">Секрет токена отображается только один раз.</p>
            <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm dark:bg-slate-900">
              {generatedToken.secret}
            </code>
            <button
              onClick={() => handleCopy(generatedToken.secret)}
              className="rounded-full border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-100 dark:border-amber-500/60 dark:text-amber-200 dark:hover:bg-amber-500/20"
            >
              Скопировать токен
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Активные токены</h3>
          {loading && <span className="text-xs text-slate-400">Загрузка...</span>}
        </div>
        <div className="mt-4 space-y-3 text-sm">
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
                      <p className="text-xs text-slate-400 dark:text-slate-500">Создан: {formatDate(token.createdAt)}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Последнее использование: {formatDate(token.lastUsedAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => handleCopy(token.id)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Скопировать ID
                      </button>
                      <button
                        onClick={() => handleDelete(token.id)}
                        className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
