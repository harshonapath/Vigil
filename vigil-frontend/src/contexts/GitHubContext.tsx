import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { request } from '../services/api';

interface GitHubStatus {
  connected: boolean;
  installation_id: number | null;
  app_id: string | null;
}

interface GitHubContextValue {
  /** Whether the GitHub App is connected and has an active installation */
  connected: boolean;
  /** The GitHub App installation ID, or null if not connected */
  installationId: number | null;
  /** Whether the status is still loading from the backend */
  loading: boolean;
  /** Refresh the GitHub connection status */
  refresh: () => void;
}

const GitHubContext = createContext<GitHubContextValue | null>(null);

export function GitHubProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    request<GitHubStatus>('/github/status')
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled)
          setStatus({ connected: false, installation_id: null, app_id: null });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const value = useMemo<GitHubContextValue>(
    () => ({
      connected: status?.connected ?? false,
      installationId: status?.installation_id ?? null,
      loading,
      refresh: () => setTick((t) => t + 1),
    }),
    [status, loading],
  );

  return (
    <GitHubContext.Provider value={value}>
      {children}
    </GitHubContext.Provider>
  );
}

export function useGitHub(): GitHubContextValue {
  const ctx = useContext(GitHubContext);
  if (!ctx) throw new Error('useGitHub must be used within GitHubProvider');
  return ctx;
}
