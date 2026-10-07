import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Nav from './Nav';
import FloatingAssistant from './FloatingAssistant';
import TopBar from './TopBar';

const NAV_EXPANDED = 248;
const NAV_COLLAPSED = 56;

export default function Shell() {
  const location = useLocation();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const navW = navCollapsed ? NAV_COLLAPSED : NAV_EXPANDED;

  // Scroll to top on route change
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const openNavForTour = () => setMobileNavOpen(true);
    const closeNavAfterTour = () => setMobileNavOpen(false);
    window.addEventListener('vigil-tour-start', openNavForTour);
    window.addEventListener('vigil-tour-end', closeNavAfterTour);
    return () => {
      window.removeEventListener('vigil-tour-start', openNavForTour);
      window.removeEventListener('vigil-tour-end', closeNavAfterTour);
    };
  }, []);

  return (
    <div className={`app-shell${navCollapsed ? ' nav-collapsed' : ''}`} style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--background)',
    }}>
      <Nav
        collapsed={navCollapsed}
        onCollapseToggle={() => setNavCollapsed(collapsed => !collapsed)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <button
        className="mobile-nav-trigger"
        onClick={() => setMobileNavOpen(open => !open)}
        aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileNavOpen}
      >
        {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      {mobileNavOpen && <button className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main
        ref={mainRef}
        key={location.pathname}
        className="page-enter app-main"
        data-nav-collapsed={navCollapsed}
        style={{
          flex: 'none',
          width: `calc(100% - ${navW}px)`,
          marginLeft: navW,
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1), margin-left 220ms cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
          overflowX: 'hidden',
          height: '100vh',
          background: 'var(--background)',
        }}
      >
        <TopBar />
        <Outlet />
      </main>

      <FloatingAssistant />
    </div>
  );
}
