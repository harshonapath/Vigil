import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, CheckCircle, Loader, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useGitHub } from '../contexts/GitHubContext';
import { repositoryService } from '../services/repositoryService';
import type { RepositoryRead } from '../types';

interface RepoItem {
  name: string;
  org: string;
  private: boolean;
  full_name: string;
  id: string;
}

export default function Connect() {
  const navigate = useNavigate();
  const { setGithubConnected } = useApp();
  const { connected: ghConnected, installationId, loading: ghLoading, refresh: refreshGH } = useGitHub();
  const [stage, setStage] = useState<'connect' | 'select' | 'done'>('connect');
  const [connecting, setConnecting] = useState(false);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [connectError, setConnectError] = useState('');

  // If GitHub is already connected, skip to select stage
  useEffect(() => {
    if (!ghLoading && ghConnected && stage === 'connect') {
      setStage('select');
    }
  }, [ghLoading, ghConnected, stage]);

  // Load repos from backend when entering select stage
  useEffect(() => {
    if (stage !== 'select') return;
    let cancelled = false;
    setLoadingRepos(true);

    repositoryService
      .getMyRepositories(1, 50, installationId)
      .then((res) => {
        if (cancelled) return;
        const items: RepoItem[] = res.items.map((r: RepositoryRead) => ({
          name: r.name,
          org: r.owner_login,
          private: r.private,
          full_name: r.full_name,
          id: r.id,
        }));
        setRepos(items);
        // Auto-select all repos
        setSelected(new Set(items.map((r) => r.name)));
      })
      .catch(() => {
        if (!cancelled) setRepos([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRepos(false);
      });

    return () => { cancelled = true; };
  }, [stage, installationId]);

  const handleConnect = () => {
    setConnectError('');
    setConnecting(true);
    // Refresh GitHub status from backend
    refreshGH();
    setTimeout(() => {
      setConnecting(false);
      if (!navigator.onLine) {
        setConnectError('GitHub connection failed. Check your network connection and retry.');
        return;
      }
      setStage('select');
    }, 1600);
  };

  const toggleRepo = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleFinish = () => {
    setSyncing(true);
    setTimeout(() => {
      setGithubConnected(true);
      navigate('/dashboard');
    }, 1400);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: '540px', width: '100%' }}>
        {/* Steps indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '48px' }}>
          {['Authenticate', 'Connect GitHub', 'Select Repos'].map((s, i) => {
            const done = (stage === 'select' && i === 0) || (stage === 'done' && i <= 1);
            const active = (stage === 'connect' && i === 1) || (stage === 'select' && i === 2);
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  opacity: done || active ? 1 : 0.4,
                }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: done ? 'var(--accent)' : active ? 'var(--primary)' : 'var(--secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done
                      ? <CheckCircle size={12} color="#000" />
                      : <span style={{ fontSize: '0.7rem', color: 'var(--primary-foreground)', fontWeight: '600' }}>{i + 1}</span>
                    }
                  </div>
                  <span style={{ fontSize: '0.8rem', color: active ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{s}</span>
                </div>
                {i < 2 && <div style={{ width: '24px', height: '1px', background: 'var(--border)' }} />}
              </div>
            );
          })}
        </div>

        {stage === 'connect' && (
          <div className="page-transition">
            <GitBranch size={36} style={{ color: 'var(--foreground)', marginBottom: '24px' }} strokeWidth={1.5} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 12px', letterSpacing: '-0.018em' }}>
              Connect GitHub
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted-foreground)', lineHeight: '1.7', margin: '0 0 32px' }}>
              Vigil needs read access to your repositories to analyze pull requests. We request the minimum permissions required — no write access, ever.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
              {[
                ['Read pull requests and code diffs', true],
                ['Read repository metadata', true],
                ['Push code or make changes', false],
                ['Access private messages or notifications', false],
              ].map(([perm, granted]) => (
                <div key={perm as string} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px',
                  background: 'var(--secondary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                }}>
                  {granted
                    ? <CheckCircle size={14} style={{ color: 'var(--accent)' }} />
                    : <AlertCircle size={14} style={{ color: 'var(--muted-foreground)' }} />
                  }
                  <span style={{ fontSize: '0.875rem', color: granted ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                    {perm as string}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: '600',
                    color: granted ? 'var(--accent)' : 'var(--muted-foreground)',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {granted ? 'Requested' : 'Not requested'}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                padding: '13px', background: 'var(--card)', color: 'var(--foreground)',
                border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '500',
                cursor: connecting ? 'not-allowed' : 'pointer',
              }}
            >
              {connecting ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <GitBranch size={16} />}
              {connecting ? 'Connecting to GitHub...' : 'Authorize with GitHub'}
            </button>
            {connectError && (
              <div role="alert" style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'color-mix(in srgb, var(--status-critical) 7%, var(--card))',
                border: '1px solid color-mix(in srgb, var(--status-critical) 20%, var(--border))',
                borderRadius: 6,
                color: 'var(--status-critical)',
                fontSize: '0.8rem',
              }}>
                {connectError}
              </div>
            )}
          </div>
        )}

        {stage === 'select' && (
          <div className="page-transition">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <CheckCircle size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: '500' }}>
                GitHub connected{repos.length > 0 ? ` — ${repos[0].org}` : ''}
              </span>
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px', letterSpacing: '-0.018em' }}>
              Select repositories to analyze
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: '0 0 24px' }}>
              Select the repositories you want Vigil to monitor. You can change this later in Settings.
            </p>

            {loadingRepos ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                <div>Loading repositories from GitHub…</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {repos.map((r) => (
                  <div
                    key={r.id || r.name}
                    onClick={() => toggleRepo(r.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 16px',
                      background: selected.has(r.name) ? 'color-mix(in srgb, var(--primary) 8%, var(--secondary))' : 'var(--secondary)',
                      border: `1px solid ${selected.has(r.name) ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 150ms',
                    }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '4px',
                      border: `2px solid ${selected.has(r.name) ? 'var(--primary)' : 'var(--border)'}`,
                      background: selected.has(r.name) ? 'var(--primary)' : 'transparent',
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected.has(r.name) && <CheckCircle size={11} color="#fff" />}
                    </div>
                    <GitBranch size={14} style={{ color: 'var(--muted-foreground)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)' }}>
                          {r.full_name || `${r.org}/${r.name}`}
                        </span>
                        {r.private && <Lock size={11} style={{ color: 'var(--muted-foreground)' }} />}
                      </div>
                    </div>
                  </div>
                ))}
                {repos.length === 0 && !loadingRepos && (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                    No repositories found. Make sure the GitHub App has access to at least one repository.
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleFinish}
              disabled={selected.size === 0 || syncing}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '13px', background: 'var(--primary)', color: 'var(--primary-foreground)',
                border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '500',
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.5 : 1,
                transition: 'opacity 150ms',
              }}
            >
              {syncing ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {syncing ? 'Setting up your workspace...' : `Analyze ${selected.size} ${selected.size === 1 ? 'repository' : 'repositories'}`}
              {!syncing && <ArrowRight size={14} />}
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
