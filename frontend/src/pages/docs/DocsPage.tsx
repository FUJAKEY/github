export function DocsPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <h2 className="text-xl font-semibold">Документация API</h2>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Полная спецификация OpenAPI доступна по ссылке{' '}
          <a href="/api/docs" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
            /api/docs
          </a>
          . В ней описаны все эндпоинты, параметры и примеры ответов.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <h3 className="text-lg font-semibold">Аутентификация</h3>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Для работы из браузера используется cookie-based авторизация. Для автоматизации запросов создавайте персональные токены
          в настройках репозитория. Токен предоставляется в формате <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">tokenId.secret</code>{' '}
          и отображается один раз при создании.
        </p>
        <div className="mt-4 space-y-2 rounded-xl bg-slate-100 p-4 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <p>{'// Пример запроса с токеном'}</p>
          <pre>
{String.raw`curl -H "X-Repo-Token: <tokenId.secret>" \
  "http://localhost:8000/api/repos/<repoId>/tree?branch=main"`}
          </pre>
          <p>{'// Альтернативный вариант с Authorization заголовком'}</p>
          <pre>
{String.raw`curl -H "Authorization: Token <tokenId.secret>" \
  "http://localhost:8000/api/repos/<repoId>/file?path=README.md&branch=main"`}
          </pre>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <h3 className="text-lg font-semibold">Права токена</h3>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Токены бывают двух типов: <strong>read</strong> и <strong>write</strong>. Первый предоставляет доступ к чтению дерева,
          веток, diff и скачиванию архива. Токен <strong>write</strong> дополнительно разрешает создание веток, папок, загрузку и удаление файлов.
          Ограничения приватности репозитория соблюдаются автоматически.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
          <li>Чтение: <code>GET /repos/:id/tree</code>, <code>GET /repos/:id/file</code>, <code>GET /repos/:id/commits</code>.</li>
          <li>Запись: <code>PUT /repos/:id/file</code>, <code>DELETE /repos/:id/file</code>, <code>POST /repos/:id/folder</code>.</li>
          <li>Все эндпоинты поддерживают заголовок <code>X-Repo-Token</code> или <code>Authorization: Token ...</code>.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <h3 className="text-lg font-semibold">Быстрый сценарий API</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
          <li>Зарегистрируйтесь и создайте репозиторий во вкладке <em>Settings → API токены</em>.</li>
          <li>Сохраните выданный секрет токена. Он требуется для всех дальнейших запросов.</li>
          <li>Используйте API для управления файлами (пример: загрузка файла показана ниже).</li>
        </ol>
        <div className="mt-4 rounded-xl bg-slate-100 p-4 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
{String.raw`curl -X PUT "http://localhost:8000/api/repos/<repoId>/file" \
  -H "X-Repo-Token: <tokenId.secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/index.ts",
    "content": "console.log(\"Hello from CI\");",
    "branch": "main",
    "message": "Automated update"
  }'`}
        </div>
      </section>
    </div>
  );
}
