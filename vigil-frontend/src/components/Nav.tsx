import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, GitBranch, GitPullRequest, ShieldAlert,
  GitCommitHorizontal, Clock, Settings, BarChart2, Zap,
  Globe2, Moon, Sun,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface NavItem {
  icon: React.ElementType;
  key: string;
  path: string;
  description: string;
}

interface NavProps {
  collapsed: boolean;
  onCollapseToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const NAV_ITEMS: NavItem[] = [
  {
    icon: LayoutDashboard,
    key: 'dashboard',
    path: '/dashboard',
    description: 'Overview of your security workspace',
  },
  {
    icon: GitBranch,
    key: 'repositories',
    path: '/repositories',
    description: 'View and manage connected repositories',
  },
  {
    icon: GitPullRequest,
    key: 'pullRequests',
    path: '/pull-requests',
    description: 'Review and analyze pull requests',
  },
  {
    icon: ShieldAlert,
    key: 'findings',
    path: '/findings',
    description: 'View security findings detected during AI analysis',
  },
  {
    icon: GitCommitHorizontal,
    key: 'commits',
    path: '/commits',
    description: 'Analyze commits for security risks',
  },
  {
    icon: BarChart2,
    key: 'analytics',
    path: '/analytics',
    description: 'View security and review analytics',
  },
  {
    icon: Clock,
    key: 'reviewHistory',
    path: '/review-history',
    description: 'View previous security reviews and decisions',
  },
];

export default function Nav({ collapsed, onCollapseToggle, mobileOpen = false, onMobileClose }: NavProps) {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const [tooltip, setTooltip] = useState<{ text: string; top: number } | null>(null);

  const W = collapsed ? 56 : 248;
  const languages = ['en', 'hi', 'hinglish'] as const;
  const languageShort = { en: 'EN', hi: 'हि', hinglish: 'HG' };
  const languageKey = { en: 'english', hi: 'hindi', hinglish: 'hinglish' };

  const cycleLanguage = () => {
    const current = languages.indexOf(lang);
    setLang(languages[(current + 1) % languages.length]);
  };

  return (
    <>
      <nav
        className={`app-nav${mobileOpen ? ' mobile-open' : ''}`}
        style={{
          width: W,
          minWidth: W,
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1), min-width 220ms cubic-bezier(0.4,0,0.2,1)',
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'fixed',
          top: 0, left: 0,
          zIndex: 50,
          overflow: 'visible',
        }}
      >
        {/* ── Logo ── */}
        <button
          type="button"
          onClick={onCollapseToggle}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          style={{
            height: 56,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: collapsed ? '0 14px' : '0 18px',
            flexShrink: 0,
            overflow: 'hidden',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'transparent',
            color: 'inherit',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
            transition: 'background 140ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--secondary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Zap size={30} color="var(--primary)" strokeWidth={2.5} />
          </div>
          {(!collapsed || mobileOpen) && (
            <span style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '1rem',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
              whiteSpace: 'nowrap',
            }}>
              vigil
            </span>
          )}
        </button>

        {/* ── Nav items ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'visible', padding: '10px 0' }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.path}
                onMouseEnter={event => {
                  if (!collapsed || mobileOpen) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setTooltip({ text: item.description, top: rect.top + rect.height / 2 });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <NavLink
                  to={item.path}
                  data-tour-target={`nav-${item.key}`}
                  title={collapsed && !mobileOpen ? item.description : undefined}
                  onClick={onMobileClose}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    height: 42,
                    padding: collapsed ? '0' : '0 18px',
                    margin: '3px 12px',
                    borderRadius: 7,
                    textDecoration: 'none',
                    fontSize: '0.82rem',
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? '#ffffff' : 'var(--secondary-foreground)',
                    background: isActive ? 'var(--primary)' : 'transparent',
                    borderLeft: '2px solid transparent',
                    transition: 'all 120ms ease',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    justifyContent: collapsed && !mobileOpen ? 'center' : 'flex-start',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={21}
                        strokeWidth={isActive ? 2.35 : 2.1}
                        style={{ flexShrink: 0, color: isActive ? '#ffffff' : 'var(--foreground)' }}
                      />
                      {(!collapsed || mobileOpen) && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(item.key)}</span>}
                    </>
                  )}
                </NavLink>
              </div>
            );
          })}
        </div>

        {/* ── Bottom ── */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0', flexShrink: 0 }}>
          <div className={`nav-preferences${collapsed && !mobileOpen ? ' collapsed' : ''}`}>
            {(!collapsed || mobileOpen) && <span className="nav-preferences-label">{t('appearance')}</span>}
            <div className="nav-preferences-row">
              <button
                className="nav-quick-theme"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? t('light') : t('dark')}
                title={theme === 'dark' ? t('light') : t('dark')}
              >
                {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
                {(!collapsed || mobileOpen) && <span>{theme === 'dark' ? t('dark') : t('light')}</span>}
              </button>
              {collapsed && !mobileOpen ? (
                <button
                  className="nav-quick-language"
                  onClick={cycleLanguage}
                  aria-label={`${t('language')}: ${t(languageKey[lang])}`}
                  title={`${t('language')}: ${t(languageKey[lang])}`}
                >
                  <Globe2 size={13} />
                  <small>{languageShort[lang]}</small>
                </button>
              ) : (
                <div className="nav-language-options" aria-label={t('language')}>
                  {languages.map(option => (
                    <button
                      key={option}
                      className={lang === option ? 'active' : ''}
                      onClick={() => setLang(option)}
                      aria-pressed={lang === option}
                      title={t(option)}
                    >
                      {languageShort[option]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Settings */}
          <NavLink
            to="/settings"
            title={collapsed && !mobileOpen ? 'Manage workspace preferences and integrations' : undefined}
            onClick={onMobileClose}
            onMouseEnter={event => {
              if (!collapsed || mobileOpen) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setTooltip({ text: 'Manage workspace preferences and integrations', top: rect.top + rect.height / 2 });
            }}
            onMouseLeave={() => setTooltip(null)}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              height: 42,
              padding: collapsed ? '0' : '0 18px',
              margin: '3px 12px',
              borderRadius: 7,
              textDecoration: 'none',
              fontSize: '0.82rem',
              fontWeight: isActive ? 500 : 400,
              color: isActive ? '#ffffff' : 'var(--secondary-foreground)',
              background: isActive ? 'var(--primary)' : 'transparent',
              borderLeft: '2px solid transparent',
              transition: 'all 120ms ease',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              justifyContent: collapsed ? 'center' : 'flex-start',
            })}
          >
            <Settings size={21} strokeWidth={2.1} style={{ flexShrink: 0, color: 'var(--foreground)' }} />
            {(!collapsed || mobileOpen) && <span>{t('settings')}</span>}
          </NavLink>
        </div>
      </nav>

      <div
        className={`nav-item-tooltip${tooltip && collapsed && !mobileOpen ? ' visible' : ''}`}
        role="tooltip"
        style={{ left: W + 9, top: tooltip?.top ?? 0 }}
      >
        {collapsed && !mobileOpen ? tooltip?.text : null}
      </div>
    </>
  );
}
