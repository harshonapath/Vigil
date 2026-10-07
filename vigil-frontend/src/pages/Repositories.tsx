import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Eye,
  GitBranch,
  GitFork,
  GitCommitHorizontal,
  GitPullRequest,
  LoaderCircle,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Unlock,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useApp } from '../contexts/AppContext';

type Status = 'critical' | 'medium' | 'low' | 'clean' | 'pending';

interface Repository {
  name: string;
  org: string;
  private: boolean;
  language: string;
  openPRs: number;
  findings: number;
  findingCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  status: Status;
  lastAnalyzed: string;
  branch: string;
  commits: number;
  description: string;
}

const REPOSITORIES: Repository[] = [
  {
    name: 'api-gateway',
    org: 'acme-corp',
    private: true,
    language: 'Go',
    openPRs: 3,
    findings: 4,
    findingCounts: { critical: 2, high: 1, medium: 1, low: 0 },
    status: 'critical',
    lastAnalyzed: '2 hours ago',
    branch: 'main',
    commits: 847,
    description: 'Public API gateway, authentication middleware, and request policy enforcement.',
  },
  {
    name: 'auth-service',
    org: 'acme-corp',
    private: true,
    language: 'Python',
    openPRs: 1,
    findings: 2,
    findingCounts: { critical: 0, high: 1, medium: 1, low: 0 },
    status: 'medium',
    lastAnalyzed: '6 hours ago',
    branch: 'main',
    commits: 423,
    description: 'Identity, session, and access-control service for the Acme platform.',
  },
  {
    name: 'web-frontend',
    org: 'acme-corp',
    private: false,
    language: 'TypeScript',
    openPRs: 2,
    findings: 1,
    findingCounts: { critical: 0, high: 0, medium: 0, low: 1 },
    status: 'low',
    lastAnalyzed: '1 day ago',
    branch: 'main',
    commits: 1204,
    description: 'Customer-facing React application and shared web components.',
  },
  {
    name: 'data-pipeline',
    org: 'acme-corp',
    private: true,
    language: 'Python',
    openPRs: 0,
    findings: 0,
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    status: 'clean',
    lastAnalyzed: '3 hours ago',
    branch: 'production',
    commits: 289,
    description: 'Secure ingestion and transformation jobs for analytics workloads.',
  },
  {
    name: 'mobile-app',
    org: 'acme-labs',
    private: false,
    language: 'Swift',
    openPRs: 0,
    findings: 0,
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    status: 'pending',
    lastAnalyzed: 'Not analyzed',
    branch: 'develop',
    commits: 567,
    description: 'Native iOS client for the Acme platform.',
  },
  {
    name: 'infrastructure',
    org: 'acme-corp',
    private: true,
    language: 'HCL',
    openPRs: 1,
    findings: 0,
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    status: 'pending',
    lastAnalyzed: 'Analysis queued',
    branch: 'main',
    commits: 134,
    description: 'Terraform modules and cloud platform configuration.',
  },
];

const AVAILABLE_REPOSITORIES = [
  { name: 'payments-service', org: 'acme-corp', private: true, language: 'Kotlin', description: 'Payment orchestration and ledger events' },
  { name: 'customer-portal', org: 'acme-corp', private: true, language: 'TypeScript', description: 'Customer account management portal' },
  { name: 'design-system', org: 'acme-labs', private: false, language: 'TypeScript', description: 'Shared product components and tokens' },
  { name: 'ml-inference', org: 'acme-labs', private: true, language: 'Python', description: 'Production model inference services' },
];

const RECENT_COMMITS = [
  { hash: 'a3f9c12', title: 'fix: sanitize user input in search endpoint', author: 'Priya Sharma', time: '1h ago', flagged: true },
  { hash: 'd4e1b89', title: 'docs: update API reference', author: 'Rohan Mehta', time: '8h ago', flagged: false },
  { hash: 'bf287a1', title: 'chore: rotate staging credentials', author: 'Dev Kapoor', time: '1d ago', flagged: false },
];

const RECENT_PRS = [
  { id: 47, title: 'feat: add user authentication via JWT', author: 'Priya Sharma', findings: 2, state: 'Review required' },
  { id: 44, title: 'fix: enforce request size limits', author: 'Anita Bose', findings: 0, state: 'AI reviewed' },
  { id: 41, title: 'chore: update Go dependencies', author: 'Dev Kapoor', findings: 1, state: 'Review required' },
];

function pluralizeFindings(count: number, severity: string) {
  return `${count} ${severity} ${count === 1 ? 'finding' : 'findings'}`;
}

function findingsSummary(repo: Repository) {
  if (repo.status === 'pending') return 'Awaiting analysis';
  if (repo.findings === 0) return 'No active findings';

  return ([
    ['Critical', repo.findingCounts.critical],
    ['High', repo.findingCounts.high],
    ['Medium', repo.findingCounts.medium],
    ['Low', repo.findingCounts.low],
  ] as const)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${count} ${severity}`)
    .join(' · ');
}

function statusLabel(repo: Repository) {
  if (repo.status === 'critical') return pluralizeFindings(repo.findingCounts.critical, 'Critical');
  if (repo.status === 'medium' && repo.findingCounts.high) return pluralizeFindings(repo.findingCounts.high, 'High');
  if (repo.status === 'medium') return pluralizeFindings(repo.findingCounts.medium, 'Medium');
  if (repo.status === 'low') return pluralizeFindings(repo.findingCounts.low, 'Low');
  if (repo.status === 'clean') return 'No active findings';
  return repo.lastAnalyzed;
}

function RepoBadge({ repo }: { repo: Repository }) {
  return (
    <span className={`repo-status repo-tone-${repo.status}`}>
      <span className="dot" />
      {statusLabel(repo)}
    </span>
  );
}

function EmptyRepositories({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="repo-empty">
      <div className="repo-empty-icon"><GitBranch size={22} /></div>
      <div className="empty-title">No repositories connected</div>
      <div className="empty-sub">
        Connect GitHub to let Vigil securely analyze pull requests and surface security risks before merge.
      </div>
      <button className="btn btn-primary" onClick={onConnect}>
        <GitFork size={14} /> Connect GitHub
      </button>
      <div className="repo-readonly-note"><Eye size={11} /> You control which repositories are connected to Vigil.</div>
    </div>
  );
}

function RepositoryCard({ repo, onOpen }: { repo: Repository; onOpen: () => void }) {
  return (
    <article className="repo-card">
      <div className={`repo-card-stripe repo-tone-${repo.status}`} />
      <div className="repo-card-body">
        <div className="repo-card-heading">
          <div>
            <div className="repo-owner"><Building2 size={11} /> {repo.org}</div>
            <div className="repo-name-row">
              <span className="repo-name">{repo.name}</span>
              {repo.private ? <Lock size={11} /> : <Unlock size={11} />}
            </div>
          </div>
          <RepoBadge repo={repo} />
        </div>
        <p className="repo-description">{repo.description}</p>
        <div className={`repo-findings-row repo-tone-${repo.status}`}>
          <ShieldAlert size={12} />
          <span>Security findings</span>
          <strong>{findingsSummary(repo)}</strong>
        </div>
        <div className="repo-meta-grid">
          <div><span>Default branch</span><strong><GitBranch size={11} /> {repo.branch}</strong></div>
          <div><span>Open pull requests</span><strong><GitPullRequest size={11} /> {repo.openPRs}</strong></div>
          <div><span>Last analyzed</span><strong><Clock size={11} /> {repo.lastAnalyzed}</strong></div>
        </div>
        <div className="repo-card-footer">
          <span className="repo-access">{repo.private ? 'Private' : 'Public'} · {repo.language}</span>
          <button className="btn btn-secondary btn-sm" onClick={onOpen}>
            Open repository <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </article>
  );
}

function RepositoryList({ hasRepositories }: { hasRepositories: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'secure'>('all');
  const [sort, setSort] = useState<'attention' | 'recent' | 'name'>('attention');
  const [syncing, setSyncing] = useState(false);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = REPOSITORIES.filter(repo => {
      const matchesSearch = `${repo.org}/${repo.name} ${repo.language}`.toLowerCase().includes(normalized);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'attention' && (repo.findings > 0 || repo.status === 'pending')) ||
        (filter === 'secure' && repo.status === 'clean');
      return matchesSearch && matchesFilter;
    });
    return result.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'recent') return a.lastAnalyzed.localeCompare(b.lastAnalyzed);
      const priority: Record<Status, number> = { critical: 0, medium: 1, low: 2, pending: 3, clean: 4 };
      return priority[a.status] - priority[b.status] || b.findings - a.findings;
    });
  }, [filter, query, sort]);

  const sync = () => {
    setSyncing(true);
    window.setTimeout(() => setSyncing(false), 1100);
  };

  return (
    <div className="v-page v-page-wide stage3-page repo-page">
      <PageHeader
        title="Repositories"
        subtitle={hasRepositories ? '6 connected repositories across 2 GitHub organizations' : 'Connect GitHub repositories to begin security analysis'}
        actions={
          hasRepositories ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={sync} disabled={syncing}>
                <RefreshCw size={12} className={syncing ? 'repo-spin' : ''} />
                {syncing ? 'Syncing' : 'Sync'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/repositories/connect')}>
                <Plus size={12} /> Connect repository
              </button>
            </>
          ) : undefined
        }
      />

      {!hasRepositories ? (
        <EmptyRepositories onConnect={() => navigate('/repositories/connect')} />
      ) : (
        <>
          <div className="repo-connection-bar">
            <div className="repo-connection-icon"><GitFork size={15} /></div>
            <div>
              <strong>GitHub connected</strong>
              <span>acme-security · acme-corp and acme-labs · Repository access connected</span>
            </div>
            <span className="repo-healthy"><CheckCircle size={11} /> Healthy</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/repositories/connect')}>
              Manage
            </button>
          </div>

          <div className="repo-toolbar">
            <label className="repo-search">
              <Search size={13} />
              <input
                className="input"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search repositories, owners, or languages"
                aria-label="Search repositories"
              />
            </label>
            <div className="repo-filter-group" aria-label="Filter repositories">
              {(['all', 'attention', 'secure'] as const).map(value => (
                <button
                  key={value}
                  className={`btn btn-sm ${filter === value ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilter(value)}
                >
                  {value === 'all' ? 'All' : value === 'attention' ? 'Needs attention' : 'No active findings'}
                </button>
              ))}
            </div>
            <label className="repo-sort">
              <SlidersHorizontal size={12} />
              <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="Sort repositories">
                <option value="attention">Priority</option>
                <option value="recent">Recently analyzed</option>
                <option value="name">Name</option>
              </select>
              <ChevronDown size={11} />
            </label>
          </div>

          {visible.length > 0 ? (
            <div className="repo-grid">
              {visible.map(repo => (
                <RepositoryCard key={`${repo.org}/${repo.name}`} repo={repo} onOpen={() => navigate(`/repositories/${repo.name}`)} />
              ))}
            </div>
          ) : (
            <div className="repo-no-results">
              <Search size={20} />
              <div className="empty-title">No matching repositories</div>
              <div className="empty-sub">Try another search or clear the current security filter.</div>
              <button className="btn btn-secondary btn-sm" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RepositoryDetail({ repo }: { repo: Repository }) {
  const navigate = useNavigate();

  return (
    <div className="v-page v-page-wide stage3-page repo-page">
      <button className="btn btn-ghost btn-sm repo-back" onClick={() => navigate('/repositories')}>
        <ArrowLeft size={12} /> Repositories
      </button>
      <PageHeader
        title={repo.name}
        subtitle={`${repo.org} · ${repo.private ? 'Private' : 'Public'} repository · ${repo.language}`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/pull-requests', { state: { prId: 47 } })}>
            <GitPullRequest size={12} /> Review pull request
          </button>
        }
      />

      <div className="repo-detail-hero">
        <div className="repo-detail-copy">
          <div className="repo-detail-eyebrow"><GitFork size={13} /> {repo.org}/{repo.name}</div>
          <p>{repo.description}</p>
          <div className="repo-detail-tags">
            <span><GitBranch size={11} /> {repo.branch}</span>
            <span>{repo.private ? <Lock size={11} /> : <Unlock size={11} />} {repo.private ? 'Private' : 'Public'}</span>
            <span><Clock size={11} /> {repo.status === 'pending' ? repo.lastAnalyzed : `Analyzed ${repo.lastAnalyzed}`}</span>
          </div>
        </div>
        <div className="repo-posture">
          <span>Active findings</span>
          <strong className={`repo-tone-text-${repo.status}`}>{repo.status === 'pending' ? '—' : repo.findings}</strong>
          <RepoBadge repo={repo} />
        </div>
      </div>

      <div className="repo-summary-grid">
        {[
          { label: 'Open findings', value: repo.status === 'pending' ? '—' : repo.findings, note: findingsSummary(repo), icon: ShieldAlert, tone: repo.findings ? 'critical' : repo.status === 'pending' ? 'foreground' : 'safe' },
          { label: 'Open pull requests', value: repo.openPRs, note: `${Math.min(repo.openPRs, 2)} awaiting decision`, icon: GitPullRequest, tone: 'primary' },
          { label: 'Repository commits', value: repo.commits, note: `Tracking ${repo.branch}`, icon: GitCommitHorizontal, tone: 'foreground' },
          { label: 'Last analysis', value: repo.lastAnalyzed, note: 'AI analysis status', icon: ShieldCheck, tone: 'safe' },
        ].map(item => (
          <div className={`repo-summary-card repo-summary-${item.tone}`} key={item.label}>
            <item.icon size={14} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>

      <div className="repo-detail-columns">
        <section className="repo-panel">
          <div className="repo-panel-header">
            <div><GitPullRequest size={13} /> Pull requests</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pull-requests')}>View all <ArrowRight size={11} /></button>
          </div>
          {RECENT_PRS.slice(0, Math.max(repo.openPRs, 1)).map(pr => (
            <button
              className="repo-activity-row"
              key={pr.id}
              onClick={() => navigate('/pull-requests', { state: { prId: pr.id } })}
            >
              <GitPullRequest size={13} />
              <div>
                <strong>#{pr.id} {pr.title}</strong>
                <span>{pr.author} · {pr.state}</span>
              </div>
              <span className={pr.findings ? 'text-critical' : 'text-safe'}>
                {pr.findings ? `${pr.findings} findings` : 'No findings'}
              </span>
              <ArrowRight size={11} />
            </button>
          ))}
        </section>

        <section className="repo-panel">
          <div className="repo-panel-header">
            <div><GitCommitHorizontal size={13} /> Recent commits</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/commits')}>View all <ArrowRight size={11} /></button>
          </div>
          {RECENT_COMMITS.map(commit => (
            <button className="repo-activity-row" key={commit.hash} onClick={() => navigate('/commits')}>
              <GitCommitHorizontal size={13} className={commit.flagged ? 'text-warn' : ''} />
              <div>
                <strong>{commit.title}</strong>
                <span><code>{commit.hash}</code> · {commit.author} · {commit.time}</span>
              </div>
              <span className={commit.flagged ? 'text-warn' : 'text-safe'}>{commit.flagged ? 'Flagged' : 'Passed'}</span>
              <ArrowRight size={11} />
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

type ConnectStep = 'account' | 'select' | 'confirm' | 'connecting' | 'success' | 'failed';

function ConnectRepository() {
  const navigate = useNavigate();
  const { githubConnected, setGithubConnected } = useApp();
  const [step, setStep] = useState<ConnectStep>('account');
  const [query, setQuery] = useState('');
  const [org, setOrg] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const choices = AVAILABLE_REPOSITORIES.filter(repo => {
    const matchesOrg = org === 'all' || repo.org === org;
    const matchesQuery = `${repo.org}/${repo.name} ${repo.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesOrg && matchesQuery;
  });

  const toggle = (name: string) => {
    setSelected(current => {
      const next = new Set(current);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const connect = () => {
    setStep('connecting');
    window.setTimeout(() => setStep(navigator.onLine ? 'success' : 'failed'), 1600);
  };

  const stepIndex = step === 'account' ? 0 : step === 'select' ? 1 : 2;

  return (
    <div className="v-page stage3-page repo-connect-page">
      <button className="btn btn-ghost btn-sm repo-back" onClick={() => navigate('/repositories')}>
        <ArrowLeft size={12} /> Cancel
      </button>
      <PageHeader
        title="Connect GitHub repository"
        subtitle="Add repositories to Vigil for pull-request security analysis"
      />

      <div className="repo-connect-layout">
        <aside className="repo-connect-steps">
          {['GitHub account', 'Select repositories', 'Confirm access'].map((label, index) => (
            <div className={`repo-connect-step ${stepIndex === index ? 'active' : ''} ${stepIndex > index || step === 'success' ? 'complete' : ''}`} key={label}>
              <span>{stepIndex > index || step === 'success' ? <Check size={11} /> : index + 1}</span>
              <div><strong>{label}</strong><small>{index === 0 ? 'acme-security' : index === 1 ? 'Choose repositories' : 'Review and connect'}</small></div>
            </div>
          ))}
          <div className="repo-permission-note">
            <ShieldCheck size={15} />
            <div><strong>Repository access</strong><span>Vigil uses connected repository and pull-request data for security analysis.</span></div>
          </div>
        </aside>

        <div className="repo-connect-card">
          {step === 'account' && (
            <>
              {githubConnected ? (
                <>
                  <div className="repo-connect-heading"><GitFork size={22} /><div><strong>GitHub is connected</strong><span>Your connection is active and ready to use.</span></div></div>
                  <div className="repo-account-card">
                    <div className="repo-avatar">AS</div>
                    <div><strong>acme-security</strong><span>GitHub account · Connected Sep 18, 2026</span></div>
                    <span className="repo-healthy"><CheckCircle size={11} /> Connected</span>
                  </div>
                  <div className="repo-org-list">
                    <div><Building2 size={13} /><span><strong>acme-corp</strong>24 accessible repositories</span><CheckCircle size={13} /></div>
                    <div><Building2 size={13} /><span><strong>acme-labs</strong>8 accessible repositories</span><CheckCircle size={13} /></div>
                  </div>
                  <div className="repo-connect-actions">
                    <button className="btn btn-danger btn-sm" onClick={() => { setGithubConnected(false); navigate('/repositories'); }}>Disconnect account</button>
                    <button className="btn btn-primary" onClick={() => setStep('select')}>Choose repositories <ArrowRight size={12} /></button>
                  </div>
                </>
              ) : (
                <>
                  <div className="repo-connect-heading"><GitFork size={22} /><div><strong>Connect your GitHub account</strong><span>Authorize Vigil to list repositories available to you.</span></div></div>
                  <div className="repo-scope-box">
                    <Eye size={15} />
                    <div><strong>Secure repository authorization</strong><span>Connect repository metadata, code changes, commits, and pull-request context for security analysis.</span></div>
                  </div>
                  <div className="repo-org-list">
                    <div><CheckCircle size={13} /><span><strong>Read pull requests and code diffs</strong>Required for security review</span><span className="text-safe">Requested</span></div>
                    <div><Lock size={13} /><span><strong>Repository permissions</strong>Managed through your GitHub connection</span><span>Connected scope</span></div>
                  </div>
                  <div className="repo-connect-actions">
                    <button className="btn btn-secondary" onClick={() => navigate('/repositories')}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => { setGithubConnected(true); setStep('select'); }}><GitFork size={13} /> Authorize GitHub</button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 'select' && (
            <>
              <div className="repo-connect-heading"><GitBranch size={22} /><div><strong>Select repositories</strong><span>Choose repositories for pull-request security analysis.</span></div></div>
              <div className="repo-picker-toolbar">
                <label className="repo-search"><Search size={13} /><input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search GitHub repositories" /></label>
                <select className="input" value={org} onChange={event => setOrg(event.target.value)} aria-label="Filter by organization">
                  <option value="all">All organizations</option>
                  <option value="acme-corp">acme-corp</option>
                  <option value="acme-labs">acme-labs</option>
                </select>
              </div>
              <div className="repo-picker-list">
                {choices.map(repo => (
                  <button className={`repo-picker-row ${selected.has(repo.name) ? 'selected' : ''}`} key={repo.name} onClick={() => toggle(repo.name)}>
                    <span className="repo-checkbox">{selected.has(repo.name) && <Check size={11} />}</span>
                    <GitBranch size={13} />
                    <div><strong>{repo.org}/{repo.name}</strong><span>{repo.description} · {repo.language}</span></div>
                    {repo.private ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                ))}
              </div>
              <div className="repo-connect-actions">
                <button className="btn btn-secondary" onClick={() => setStep('account')}>Back</button>
                <button className="btn btn-primary" disabled={selected.size === 0} onClick={() => setStep('confirm')}>
                  Continue with {selected.size || 0} <ArrowRight size={12} />
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="repo-connect-heading"><ShieldCheck size={22} /><div><strong>Confirm repository access</strong><span>Vigil will begin the first analysis after connection.</span></div></div>
              <div className="repo-confirm-list">
                {AVAILABLE_REPOSITORIES.filter(repo => selected.has(repo.name)).map(repo => (
                  <div key={repo.name}><GitBranch size={13} /><div><strong>{repo.org}/{repo.name}</strong><span>{repo.private ? 'Private' : 'Public'} · {repo.language}</span></div><CheckCircle size={13} /></div>
                ))}
              </div>
              <div className="repo-scope-box">
                <Eye size={15} />
                <div><strong>Repository analysis scope</strong><span>Repository metadata, code changes, commits, and pull-request context used by Vigil analysis.</span></div>
              </div>
              <div className="repo-connect-actions">
                <button className="btn btn-secondary" onClick={() => setStep('select')}>Back</button>
                <button className="btn btn-primary" onClick={connect}><GitFork size={13} /> Connect {selected.size} repositories</button>
              </div>
            </>
          )}

          {step === 'connecting' && (
            <div className="repo-connect-state" aria-live="polite">
              <LoaderCircle size={30} className="repo-spin" />
              <strong>Connecting repositories</strong>
              <span>Verifying repository access and preparing the first security analysis…</span>
              <div className="repo-progress"><span /></div>
            </div>
          )}

          {step === 'success' && (
            <div className="repo-connect-state">
              <div className="repo-state-icon success"><CheckCircle size={22} /></div>
              <strong>{selected.size} {selected.size === 1 ? 'repository' : 'repositories'} connected</strong>
              <span>Vigil has queued an initial security analysis. Results will appear as they become available.</span>
              <button className="btn btn-primary" onClick={() => { setGithubConnected(true); navigate('/repositories'); }}>View repositories <ArrowRight size={12} /></button>
            </div>
          )}

          {step === 'failed' && (
            <div className="repo-connect-state" role="alert">
              <div className="repo-state-icon failed"><AlertCircle size={22} /></div>
              <strong>Connection failed</strong>
              <span>Vigil could not verify GitHub access. No repositories were connected and no permissions were changed.</span>
              <div className="repo-failure-detail">GitHub authorization could not be reached. Check your connection and try again.</div>
              <div className="repo-state-actions">
                <button className="btn btn-secondary" onClick={() => setStep('confirm')}>Back</button>
                <button className="btn btn-primary" onClick={connect}><RefreshCw size={12} /> Try again</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Repositories() {
  const { repoName } = useParams();
  const { githubConnected } = useApp();
  const isConnect = window.location.pathname.endsWith('/connect');
  const repo = REPOSITORIES.find(item => item.name === repoName);

  if (isConnect) return <ConnectRepository />;
  if (repo) return <RepositoryDetail repo={repo} />;
  return <RepositoryList hasRepositories={githubConnected} />;
}
