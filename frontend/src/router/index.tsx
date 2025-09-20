import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout.tsx';
import { LoginPage } from '../pages/auth/LoginPage.tsx';
import { RegisterPage } from '../pages/auth/RegisterPage.tsx';
import { ProtectedRoute } from '../components/ProtectedRoute.tsx';
import { AppLayout } from '../layouts/AppLayout.tsx';
import { MyReposPage } from '../pages/dashboard/MyReposPage.tsx';
import { RepoLayout } from '../pages/repo/RepoLayout.tsx';
import { RepoCodePage } from '../pages/repo/RepoCodePage.tsx';
import { RepoBranchesPage } from '../pages/repo/RepoBranchesPage.tsx';
import { RepoCommitsPage } from '../pages/repo/RepoCommitsPage.tsx';
import { RepoSettingsPage } from '../pages/repo/RepoSettingsPage.tsx';
import { DocsPage } from '../pages/docs/DocsPage.tsx';
import { AccountSettingsPage } from '../pages/account/AccountSettingsPage.tsx';

export const router = createBrowserRouter([
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { index: true, element: <Navigate to="/auth/login" replace /> }
    ]
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <MyReposPage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'account', element: <AccountSettingsPage /> },
      {
        path: 'repos/:repoId',
        element: <RepoLayout />,
        children: [
          { index: true, element: <Navigate to="code" replace /> },
          { path: 'code', element: <RepoCodePage /> },
          { path: 'branches', element: <RepoBranchesPage /> },
          { path: 'commits', element: <RepoCommitsPage /> },
          { path: 'settings', element: <RepoSettingsPage /> }
        ]
      }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
]);
