import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { GitHubProvider } from './contexts/GitHubContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Shell from './components/Shell';
import Welcome from './pages/Welcome';
import Tour from './pages/Tour';
import Auth from './pages/Auth';
import Connect from './pages/Connect';
import Dashboard from './pages/Dashboard';
import Repositories from './pages/Repositories';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { RepositoryDetailPage } from './pages/RepositoryDetailPage';
import PullRequests from './pages/PullRequests';
import { PullRequestsPage } from './pages/PullRequestsPage';
import { PRDetailPage } from './pages/PRDetailPage';
import Findings from './pages/Findings';
import Commits from './pages/Commits';
import Analytics from './pages/Analytics';
import ReviewHistory from './pages/ReviewHistory';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import Settings from './pages/Settings';

function AuthLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--background)',
      color: 'var(--muted-foreground)',
    }}>
      Completing secure sign-in…
    </div>
  );
}

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

function LoginRoute({ mode }: { mode: 'signin' | 'signup' }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Auth mode={mode} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <GitHubProvider>
        <BrowserRouter>
          <Routes>
            {/* Public / onboarding */}
            <Route path="/" element={<Welcome />} />
            <Route path="/welcome" element={<Navigate to="/" replace />} />
            <Route path="/tour" element={<Tour />} />
            <Route path="/login" element={<LoginRoute mode="signin" />} />
            <Route path="/signup" element={<LoginRoute mode="signup" />} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />

            {/* Authenticated application */}
            <Route element={<ProtectedRoute />}>
              <Route path="/connect" element={<Connect />} />

              <Route element={<Shell />}>
                {/* Primary dynamic functional pages */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/repositories" element={<RepositoriesPage />} />
                <Route path="/pull-requests" element={<PullRequests />} />
                <Route path="/findings" element={<Findings />} />
                <Route path="/commits" element={<Commits />} />
                <Route path="/commit-analysis" element={<Commits />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/review-history" element={<ReviewHistory />} />
                <Route path="/settings" element={<Settings />} />

                {/* Existing functional/detail routes retained from the VS Code project */}
                <Route path="/repositories/connect" element={<Navigate to="/connect" replace />} />
                <Route path="/repositories/:repoId" element={<RepositoryDetailPage />} />
                <Route path="/repositories/:repoId/pull-requests" element={<PullRequestsPage />} />
                <Route path="/pull-requests/:id" element={<PRDetailPage />} />
                <Route path="/review-queue" element={<ReviewQueuePage />} />

                {/* Alternate / demo routes */}
                <Route path="/repositories/list" element={<RepositoriesPage />} />
                <Route path="/repositories/demo" element={<Repositories />} />
              </Route>

            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </GitHubProvider>
      </AppProvider>
    </AuthProvider>
  );
}
