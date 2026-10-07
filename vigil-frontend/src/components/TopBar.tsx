import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useApp } from '../contexts/AppContext';

const SEARCH_DESTINATIONS = [
  { label: 'Dashboard', hint: 'Workspace overview', path: '/dashboard', terms: 'home overview' },
  { label: 'Repositories', hint: 'Connected repositories', path: '/repositories', terms: 'repository repo github' },
  { label: 'Pull Requests', hint: 'Review queue', path: '/pull-requests', terms: 'pull request pr review' },
  { label: 'Security Findings', hint: 'Detected security risks', path: '/findings', terms: 'security finding risk' },
  { label: 'Commit Analysis', hint: 'Analyze recent commits', path: '/commits', terms: 'commit analysis' },
  { label: 'Review History', hint: 'Past review decisions', path: '/review-history', terms: 'history decision' },
  { label: 'Analytics', hint: 'Security and review metrics', path: '/analytics', terms: 'analytics metrics' },
  { label: 'Settings', hint: 'Workspace preferences', path: '/settings', terms: 'settings preferences' },
];

export default function TopBar() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, signOut } = useAuth();
  const { t } = useApp();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    const items = search
      ? SEARCH_DESTINATIONS.filter(item => `${item.label} ${item.hint} ${item.terms}`.toLowerCase().includes(search))
      : SEARCH_DESTINATIONS.slice(0, 5);
    return items.slice(0, 5);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      } else if (event.key === 'Escape') {
        setSearchOpen(false);
        setAccountOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const goTo = (path: string) => {
    setSearchOpen(false);
    setQuery('');
    navigate(path);
  };

  const submitSearch = () => {
    if (matches[0]) goTo(matches[0].path);
  };

  const initials = user?.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'V';

  return (
    <header className="app-topbar">
      <div className="topbar-search-wrap">
        <div className={`topbar-search${searchOpen ? ' is-open' : ''}`}>
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => { setQuery(event.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={event => {
              if (event.key === 'Enter') submitSearch();
              if (event.key === 'Escape') setSearchOpen(false);
            }}
            placeholder="Search repositories, pull requests, or findings..."
            aria-label="Search Vigil"
            aria-expanded={searchOpen}
            aria-controls="topbar-search-results"
          />
          <span className="topbar-shortcut"><kbd>Ctrl</kbd><kbd>K</kbd></span>
        </div>
        {searchOpen && (
          <>
            <button className="topbar-dismiss" aria-label="Close search results" onClick={() => setSearchOpen(false)} />
            <div className="topbar-search-results" id="topbar-search-results" role="listbox" aria-label="Vigil pages">
              {matches.length > 0 ? matches.map(item => (
                <button key={item.path} role="option" aria-selected="false" onClick={() => goTo(item.path)}>
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </button>
              )) : <div className="topbar-search-empty">No matching sections</div>}
            </div>
          </>
        )}
      </div>

      <div className="topbar-actions">
        <button className="topbar-icon-button" aria-label="Notifications" title="Security findings" onClick={() => goTo('/findings')}>
          <Bell size={19} strokeWidth={1.8} />
          <span className="topbar-notification-dot" />
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <div className="topbar-account-wrap">
          <button
            className="topbar-account-button"
            onClick={() => setAccountOpen(open => !open)}
            aria-label="Open account menu"
            aria-expanded={accountOpen}
          >
            <span className="topbar-avatar">{initials}</span>
            <span className="topbar-account-name">{user?.displayName || 'Vigil user'}</span>
            <ChevronDown size={14} />
          </button>
          {accountOpen && (
            <>
              <button className="topbar-dismiss" aria-label="Close account menu" onClick={() => setAccountOpen(false)} />
              <div className="topbar-account-menu">
                <div className="topbar-account-details">
                  <strong>{user?.displayName || 'Vigil user'}</strong>
                  <span>{user?.email || 'Local workspace'}</span>
                </div>
                <button className="topbar-signout" onClick={() => { setAccountOpen(false); void signOut(); }}>
                  <LogOut size={15} aria-hidden="true" />
                  <span>{t('signOut')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
