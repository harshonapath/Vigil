import { useState } from 'react';
import { Moon, Sun, GitBranch, Globe, User, Shield, Check, LogOut } from 'lucide-react';
import { useApp, type Lang } from '../contexts/AppContext';
import { useAuth } from '../auth/AuthContext';
import PageHeader from '../components/PageHeader';
import { AIOrb } from '../components/AIOrb';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--muted-foreground)', marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, description, last, children }: {
  icon: React.ElementType; label: string; description?: string; last?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="settings-row" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      borderBottom: last ? 'none' : '1px solid var(--border)',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
        <Icon size={14} style={{ color: 'var(--muted-foreground)', marginTop: 2, flexShrink: 0 }} strokeWidth={1.75} />
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: description ? 2 : 0 }}>{label}</div>
          {description && <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{description}</div>}
        </div>
      </div>
      <div className="settings-row-control" style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      onClick={onToggle}
      aria-checked={on}
      role="switch"
    />
  );
}

function MicrosoftAuthenticationState({ connected = false }: { connected?: boolean }) {
  const { t } = useApp();

  if (connected) {
    return (
      <span className="btn btn-sm microsoft-auth-connected" role="status">
        <Check size={12} />
        {t('connected')}
      </span>
    );
  }

  return (
    <button type="button" className="btn btn-primary btn-sm">
      {t('connectMicrosoft')}
    </button>
  );
}

function SegmentedControl<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon?: React.ElementType }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented-control" style={{ display: 'flex', gap: 4, background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: 5, padding: 3 }}>
      {options.map(opt => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px',
              borderRadius: 4,
              border: 'none',
              background: active ? 'var(--card)' : 'transparent',
              color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontSize: '0.78rem',
              fontWeight: active ? 500 : 400,
              cursor: 'pointer',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              transition: 'all 140ms',
            }}
          >
            {Icon && <Icon size={13} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Settings() {
  const { theme, setTheme, lang, setLang, githubConnected, t } = useApp();
  const { user, signOut, isLoading: authLoading, error: authError } = useAuth();
  const [aiDepth, setAiDepth] = useState<'standard' | 'deep'>('standard');
  const [notifications, setNotifications] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [autoEscalate, setAutoEscalate] = useState(false);

  return (
    <div className="v-page" style={{ maxWidth: 640 }}>
      <PageHeader title={t('settings')} subtitle={t('workspacePreferences')} />

      {/* Account */}
      <Section title={t('account')}>
        <Row icon={User} label={user?.displayName ?? 'Vigil user'} description={user?.email ?? 'Local preview account'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={12} style={{ color: 'var(--status-safe)' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--status-safe)', fontWeight: 500 }}>{t('localSession')}</span>
          </div>
        </Row>
        <Row icon={Shield} label={t('microsoftAuth')} description={t('microsoftAuthDescription')}>
          <MicrosoftAuthenticationState />
        </Row>
        <Row icon={LogOut} label={t('signOut')} description={t('signOutDescription')} last>
          <button className="btn btn-secondary btn-sm" disabled={authLoading} onClick={() => void signOut()}>
            {t('signOut')}
          </button>
        </Row>
        {authError && (
          <div role="alert" style={{
            padding: '10px 18px',
            color: 'var(--status-critical)',
            borderTop: '1px solid var(--border)',
            fontSize: '0.72rem',
          }}>
            {authError}
          </div>
        )}
      </Section>

      {/* Appearance */}
      <Section title={t('appearance')}>
        <Row icon={theme === 'dark' ? Moon : Sun} label={t('theme')} description={t('chooseTheme')}>
          <SegmentedControl<'dark' | 'light'>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: t('dark'), icon: Moon },
              { value: 'light', label: t('light'), icon: Sun },
            ]}
          />
        </Row>
        <Row icon={Globe} label={t('language')} description={t('chooseLanguage')} last>
          <SegmentedControl<Lang>
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: t('english') },
              { value: 'hi', label: t('hindi') },
              { value: 'hinglish', label: t('hinglish') },
            ]}
          />
        </Row>
      </Section>

      {/* GitHub */}
      <Section title={t('githubConnection')}>
        <Row icon={GitBranch} label={t('connectedOrganization')} description={`acme-corp · ${t('repositoriesAccessible')}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className={`dot ${githubConnected ? 'dot-safe' : 'dot-warn'}`} />
              <span style={{ fontSize: '0.72rem', color: githubConnected ? 'var(--status-safe)' : 'var(--status-warn)', fontWeight: 500 }}>
                {githubConnected ? t('connected') : t('disconnected')}
              </span>
            </div>
            <button className="btn btn-secondary btn-sm">{t('manage')}</button>
          </div>
        </Row>
        <Row icon={GitBranch} label={t('analyzedRepositories')} description="api-gateway, auth-service, web-frontend, data-pipeline" last>
          <button className="btn btn-secondary btn-sm">{t('edit')}</button>
        </Row>
      </Section>

      {/* AI */}
      <Section title={t('aiPreferences')}>
        <Row icon={AIOrb} label={t('analysisDepth')} description={t('analysisDepthDescription')}>
          <SegmentedControl<'standard' | 'deep'>
            value={aiDepth}
            onChange={setAiDepth}
            options={[
              { value: 'standard', label: t('standard') },
              { value: 'deep', label: t('deep') },
            ]}
          />
        </Row>
        <Row icon={AIOrb} label={t('autoAnalyze')} description={t('autoAnalyzeDescription')}>
          <Toggle on={autoAnalyze} onToggle={() => setAutoAnalyze(!autoAnalyze)} />
        </Row>
        <Row icon={AIOrb} label={t('findingNotifications')} description={t('findingNotificationsDescription')}>
          <Toggle on={notifications} onToggle={() => setNotifications(!notifications)} />
        </Row>
        <Row icon={AIOrb} label={t('autoEscalate')} description={t('autoEscalateDescription')} last>
          <Toggle on={autoEscalate} onToggle={() => setAutoEscalate(!autoEscalate)} />
        </Row>
      </Section>

      {/* Danger */}
      <Section title={t('dangerZone')}>
        <Row icon={GitBranch} label={t('disconnectGitHub')} description={t('disconnectGitHubDescription')}>
          <button className="btn btn-danger btn-sm">{t('disconnect')}</button>
        </Row>
        <Row icon={User} label={t('deleteAccount')} description={t('deleteAccountDescription')} last>
          <button className="btn btn-danger btn-sm">{t('delete')}</button>
        </Row>
      </Section>

      <div style={{ textAlign: 'center', padding: '12px 0 40px', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
        Vigil v0.1.0-alpha · For Antigravity
      </div>
    </div>
  );
}
