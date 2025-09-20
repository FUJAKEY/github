import { AsyncLocalStorage } from 'async_hooks';

class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

const repoLocks = new Map<string, AsyncMutex>();

export async function withRepoLock<T>(repoKey: string, fn: () => Promise<T>): Promise<T> {
  let mutex = repoLocks.get(repoKey);
  if (!mutex) {
    mutex = new AsyncMutex();
    repoLocks.set(repoKey, mutex);
  }
  const release = await mutex.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

const requestContext = new AsyncLocalStorage<{ userId: string | null }>();

export function setRequestUser(userId: string | null): void {
  const store = requestContext.getStore();
  if (store) {
    store.userId = userId;
  }
}

export function getRequestUser(): string | null {
  return requestContext.getStore()?.userId ?? null;
}

export function runWithRequestContext<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requestContext.run({ userId }, async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}
