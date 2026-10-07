// Stage 6: Mock repository display data — rich security/GitHub context for UI
// This supplements RepositoryRead with visual/security data until the backend provides it.
// Never used as a substitute for real backend responses on existing API fields.

export interface RepoDisplayMeta {
  id: string; // matches RepositoryRead.id — used as join key
  language: string;
  languageColor: string;
  securityScore: number; // 0–100
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'clean';
  openPRs: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  lastAnalyzed: string; // relative string
  description: string;
  topics: string[];
  stars: number;
  githubConnected: boolean;
}

// Fallback display meta keyed by repo name (for demo when real IDs differ)
export const REPO_DISPLAY_META_BY_NAME: Record<string, Omit<RepoDisplayMeta, 'id'>> = {
  'api-gateway': {
    language: 'Go',
    languageColor: '#00ADD8',
    securityScore: 42,
    riskLevel: 'critical',
    openPRs: 3,
    criticalFindings: 2,
    highFindings: 4,
    mediumFindings: 7,
    lowFindings: 12,
    lastAnalyzed: '2 hours ago',
    description: 'Central API gateway handling authentication, rate limiting, and request routing for all microservices.',
    topics: ['gateway', 'auth', 'rate-limiting'],
    stars: 28,
    githubConnected: true,
  },
  'auth-service': {
    language: 'Python',
    languageColor: '#3572A5',
    securityScore: 61,
    riskLevel: 'high',
    openPRs: 2,
    criticalFindings: 0,
    highFindings: 3,
    mediumFindings: 5,
    lowFindings: 8,
    lastAnalyzed: '4 hours ago',
    description: 'Microsoft Entra ID–integrated authentication and authorization service with JWT token management.',
    topics: ['auth', 'entra-id', 'jwt'],
    stars: 14,
    githubConnected: true,
  },
  'web-frontend': {
    language: 'TypeScript',
    languageColor: '#3178C6',
    securityScore: 74,
    riskLevel: 'medium',
    openPRs: 5,
    criticalFindings: 0,
    highFindings: 1,
    mediumFindings: 4,
    lowFindings: 6,
    lastAnalyzed: '1 hour ago',
    description: 'React/TypeScript frontend application with Vite, Tailwind CSS, and shadcn/ui component library.',
    topics: ['react', 'typescript', 'vite'],
    stars: 42,
    githubConnected: true,
  },
  'data-pipeline': {
    language: 'Python',
    languageColor: '#3572A5',
    securityScore: 55,
    riskLevel: 'high',
    openPRs: 1,
    criticalFindings: 0,
    highFindings: 2,
    mediumFindings: 8,
    lowFindings: 15,
    lastAnalyzed: '6 hours ago',
    description: 'Apache Kafka-based data ingestion and transformation pipeline for security telemetry and audit logs.',
    topics: ['kafka', 'data', 'pipeline'],
    stars: 9,
    githubConnected: true,
  },
  'infrastructure': {
    language: 'HCL',
    languageColor: '#5C4EE5',
    securityScore: 38,
    riskLevel: 'critical',
    openPRs: 0,
    criticalFindings: 3,
    highFindings: 6,
    mediumFindings: 3,
    lowFindings: 4,
    lastAnalyzed: '12 hours ago',
    description: 'Terraform/Bicep infrastructure-as-code for Azure cloud resources, networking, and security policies.',
    topics: ['terraform', 'azure', 'iac'],
    stars: 7,
    githubConnected: true,
  },
  'notification-service': {
    language: 'Node.js',
    languageColor: '#F0DB4F',
    securityScore: 81,
    riskLevel: 'low',
    openPRs: 1,
    criticalFindings: 0,
    highFindings: 0,
    mediumFindings: 2,
    lowFindings: 3,
    lastAnalyzed: '30 minutes ago',
    description: 'Event-driven notification service for email, Slack, and Teams alerts with retry and dead-letter support.',
    topics: ['notifications', 'event-driven'],
    stars: 6,
    githubConnected: true,
  },
};

// Default meta for repos not in the map
export const DEFAULT_DISPLAY_META: Omit<RepoDisplayMeta, 'id'> = {
  language: 'Unknown',
  languageColor: '#64748b',
  securityScore: 100,
  riskLevel: 'clean',
  openPRs: 0,
  criticalFindings: 0,
  highFindings: 0,
  mediumFindings: 0,
  lowFindings: 0,
  lastAnalyzed: 'Not analyzed',
  description: 'Connected via GitHub App.',
  topics: [],
  stars: 0,
  githubConnected: true,
};


export function getDisplayMeta(repoName: string): Omit<RepoDisplayMeta, 'id'> {
  return REPO_DISPLAY_META_BY_NAME[repoName] ?? DEFAULT_DISPLAY_META;
}

export function getRiskColor(risk: RepoDisplayMeta['riskLevel']): string {
  switch (risk) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-orange-400';
    case 'medium': return 'text-amber-400';
    case 'low': return 'text-blue-400';
    case 'clean': return 'text-emerald-400';
  }
}

export function getRiskBgBorder(risk: RepoDisplayMeta['riskLevel']): string {
  switch (risk) {
    case 'critical': return 'bg-red-500/10 border-red-500/25 text-red-400';
    case 'high': return 'bg-orange-500/10 border-orange-500/25 text-orange-400';
    case 'medium': return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
    case 'low': return 'bg-blue-500/10 border-blue-500/25 text-blue-400';
    case 'clean': return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
  }
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

export function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}
