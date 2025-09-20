# Mini GitHub

Полноценное мини-воплощение GitHub с адаптивным фронтендом на React 18 + Vite + Tailwind и бэкендом на Node.js 20 + Express + TypeScript. Все данные и Git-репозитории хранятся локально в файловой системе (`./data`).

## Возможности

- 🔐 **Аутентификация:** email + пароль, bcrypt, JWT в HttpOnly cookies, обновление/выход, управление refresh-токенами.
- 📁 **Репозитории:** создание/редактирование/удаление, приватность, приглашения по коду, роли owner/collaborator.
- 🌳 **Git-операции:** ветки, checkout, коммиты, дерево файлов, редактирование через Monaco Editor, предпросмотр diff, загрузка ZIP.
- 👥 **Коллаборация:** список и управление коллабораторами, приглашение по коду, разграничение прав.
- 📊 **UI:** темная/светлая темы, адаптивность 360/768/1024/1440, мобильная нижняя навигация, горячие клавиши (S — сохранить, N — новый файл).
- 📜 **Документация:** OpenAPI (Swagger UI доступен по `/api/docs`).
- 🧪 **Качество:** ESLint + Prettier, Vitest, Supertest, Playwright e2e, Husky pre-commit.
- 🪪 **API токены:** создавайте read/write ключи для CI/CD и автоматизации прямо из настроек репозитория.

## Структура монорепозитория

```
frontend/  # React + Vite + Tailwind + Zustand + Monaco
backend/   # Express + isomorphic-git + zod + pino
docs/      # Скриншоты и артефакты
```

## Запуск локально

```bash
pnpm install
pnpm dev
```

- Фронтенд: http://localhost:5173
- API: http://localhost:8000 (health-check: `/api/health`)

## Основной сценарий (UI)

1. Зарегистрируйте нового пользователя.
2. Создайте репозиторий (по умолчанию ветка `main`).
3. Создайте ветку из интерфейса (вкладка Branches или кнопка в Code).
4. Откройте `Code` → создайте файл (горячая клавиша `N` или кнопка `+`) → сохраните (`S`).
5. Проверьте diff (переключатель Diff).
6. Зайдите во вкладку `Commits`, выберите коммит, посмотрите diff.
7. Скачайте ZIP нужной ветки (кнопка «Скачать ZIP»).

## API токены и документация

- Вкладка **Settings → API токены** позволяет создавать ключи с правами `read` и `write`. Секрет отображается один раз, храните его в безопасном месте.
- Для запросов из автоматизации передавайте секрет в заголовке `X-Repo-Token: <tokenId.secret>` или `Authorization: Token <tokenId.secret>`.
- Встроенная страница `/docs` описывает основные сценарии использования и примеры `curl`; полная OpenAPI-спека доступна по `/api/docs`.
- Токен с правами `write` может создавать ветки, папки и коммиты; `read` ограничен операциями чтения (дерево, ветки, diff, архив).

## Скриншоты

Снимки экранов для адаптивности и пользовательского сценария вынесены из репозитория, чтобы упростить работу с Git.
Их можно пересоздать локально с помощью встроенных инструментов браузера (режим адаптивного просмотра) и сценария из
раздела «Основной сценарий (UI)» выше.

## Проверки качества

| Команда | Назначение |
| --- | --- |
| `pnpm lint` | Lint фронтенда и бэкенда (ESLint + Prettier) |
| `pnpm test` | Vitest + Supertest + Playwright e2e |
| `pnpm build` | Vite build + `tsc -p` для бэкенда |
| `pnpm start` | Запуск собранного backend (Express + выдача статики фронтенда) |

### Детали тестов

- **Unit/Integration:** Vitest (`backend/src/tests`, `frontend` при необходимости).
- **API:** Supertest (регистрация, login, CRUD репозитория, git-операции).
- **E2E:** Playwright (`backend/src/tests/e2e/api.e2e.spec.ts`) — полный сценарий API.

## Переменные окружения

См. `.env.example`:

```
PORT=8000
FRONTEND_URL=http://localhost:5173
JWT_SECRET=секрет >= 32 символа
REPOS_ROOT=./data
```

Если `JWT_SECRET` не задан (например, в Docker-контейнере без `.env`), бекенд автоматически сгенерирует криптографически стойкий секрет и сохранит его в `data/auth/jwt-secret`, чтобы при следующих запусках использовать тот же ключ.

## Файловое хранилище

```
/data
  /users/users.json
  /auth/refresh-tokens.json
  /repos/{ownerId}/{slug}/
    repo.json
    .git/
  /audit/log.ndjson
```

- Атомарные записи (tmp + rename), блокировки (`proper-lockfile`), бэкапы `.bak`.
- Git-операции через `isomorphic-git`.

## Docker

Собрать и запустить контейнер:

```bash
docker build -t mini-github .
docker run -p 8000:8000 -v $(pwd)/data:/app/data mini-github
```

Контейнер запускает Express на `:8000`, раздаёт фронтенд из `/frontend/dist`, создаёт структуру `/app/data`. HEALTHCHECK → `GET /api/health`.

## Husky

`pnpm prepare` автоматически устанавливает Husky. Прехук запускает `pnpm lint`.

## Проверка целостности FS

Реализована блокировка на уровне файлов + мьютексы репозитория. Тесты (`backend/src/tests/repo.test.ts`) создают репо и коммитят файл, e2e прогоняет последовательные git-операции. Параллельная запись защищена через `proper-lockfile`.

## Дополнительно

- Swagger UI: http://localhost:8000/api/docs
- Логи: Pino (`logs` в stdout).
- Audit trail: `data/audit/log.ndjson` (формат NDJSON).

Удачной разработки! 🚀
