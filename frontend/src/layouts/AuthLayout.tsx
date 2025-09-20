import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../store/theme.tsx';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';

export function AuthLayout() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const isLogin = location.pathname.endsWith('login');

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-sm"
        >
          {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          <span className="hidden sm:inline">{theme === 'dark' ? 'Светлая' : 'Тёмная'} тема</span>
        </button>
      </div>
      <main className="mx-auto w-full max-w-md rounded-3xl bg-white/70 dark:bg-slate-900/60 shadow-xl shadow-primary/10 backdrop-blur p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Mini GitHub</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Файловое git-хранилище с веб-интерфейсом</p>
        </div>
        <Outlet />
        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {isLogin ? (
            <span>
              Нет аккаунта?{' '}
              <Link className="text-primary dark:text-primary-dark font-semibold" to="/auth/register">
                Зарегистрироваться
              </Link>
            </span>
          ) : (
            <span>
              Уже есть аккаунт?{' '}
              <Link className="text-primary dark:text-primary-dark font-semibold" to="/auth/login">
                Войти
              </Link>
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
