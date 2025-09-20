import { Outlet, NavLink } from 'react-router-dom';
import { Fragment, useState } from 'react';
import { useTheme } from '../store/theme.tsx';
import { useAuthStore } from '../store/auth.ts';
import { Bars3Icon, MoonIcon, PlusIcon, SunIcon } from '@heroicons/react/24/outline';
import { Dialog, Transition } from '@headlessui/react';
import { CreateRepoForm } from '../pages/dashboard/CreateRepoForm.tsx';

const navItems = [
  { to: '/', label: 'Мои репозитории' }
];

export function AppLayout() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuthStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [createRepoOpen, setCreateRepoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="sm:hidden" onClick={() => setMobileNavOpen(true)}>
              <Bars3Icon className="h-6 w-6" />
            </button>
            <span className="text-lg font-semibold">Mini GitHub</span>
            <nav className="hidden sm:flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `rounded-full px-3 py-1 font-medium transition ${isActive ? 'bg-primary/10 text-primary dark:text-primary-dark' : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/70'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateRepoOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 rounded-full bg-primary text-white px-3 py-1 text-sm shadow hover:bg-primary-dark"
            >
              <PlusIcon className="h-4 w-4" />
              Создать репозиторий
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 p-2"
            >
              {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>
            <div className="text-right">
              <div className="text-sm font-semibold">{user?.email}</div>
              <button className="text-xs text-primary dark:text-primary-dark" onClick={logout}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      </header>

      <Transition show={mobileNavOpen} as={Fragment}>
        <Dialog onClose={() => setMobileNavOpen(false)} className="relative z-50 sm:hidden">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Навигация</h2>
            <nav className="space-y-2 text-sm">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2 font-medium ${isActive ? 'bg-primary/10 text-primary dark:text-primary-dark' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <button
                onClick={() => {
                  setMobileNavOpen(false);
                  setCreateRepoOpen(true);
                }}
                className="w-full rounded-xl bg-primary text-white py-2 font-semibold"
              >
                Создать репозиторий
              </button>
            </nav>
          </div>
        </Dialog>
      </Transition>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      <Transition show={createRepoOpen} as={Fragment}>
        <Dialog onClose={() => setCreateRepoOpen(false)} className="relative z-50">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl">
                <Dialog.Title className="text-xl font-semibold mb-4">Новый репозиторий</Dialog.Title>
                <CreateRepoForm onSuccess={() => setCreateRepoOpen(false)} />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      <BottomNav onCreate={() => setCreateRepoOpen(true)} />
    </div>
  );
}

function BottomNav({ onCreate }: { onCreate: () => void }) {
  return (
    <nav className="sm:hidden fixed inset-x-0 bottom-0 border-t border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
      <div className="flex items-center justify-around py-2 text-sm">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 ${isActive ? 'text-primary dark:text-primary-dark' : 'text-slate-500'}`
            }
          >
            <span className="text-xs">{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={onCreate}
          className="flex flex-col items-center gap-1 text-primary dark:text-primary-dark"
        >
          <PlusIcon className="h-5 w-5" />
          <span className="text-xs">Создать</span>
        </button>
      </div>
    </nav>
  );
}
