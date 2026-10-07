import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Eye, FileCheck2, Moon, ShieldCheck, Sun, Zap } from 'lucide-react';
import SecurityPipelineVisual from '../components/SecurityPipelineVisual';
import { useApp } from '../contexts/AppContext';

const TRUST_POINTS = [
  { icon: Eye, title: 'Secure GitHub Integration', text: 'Repository and pull-request data is securely analyzed through Vigil.' },
  { icon: ShieldCheck, title: 'AI Security Analysis', text: 'Analyze code changes and surface potential security findings.' },
  { icon: FileCheck2, title: 'Review History', text: 'Track findings, reviews, and review status in one place.' },
];

export default function Welcome() {
  const navigate = useNavigate();
  const { theme, setTheme } = useApp();

  return (
    <div className="welcome-page">
      <div className="welcome-grid" aria-hidden="true" />
      <header className="welcome-header">
        <button className="vigil-wordmark" onClick={() => navigate('/')} aria-label="Vigil home">
          <span><Zap size={13} strokeWidth={2.5} /></span>
          vigil
        </button>
        <div className="welcome-header-actions">
          <button
            className="welcome-theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <span>Already have an account?</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/login')}>Sign in</button>
        </div>
      </header>

      <main className="welcome-main">
        <section className="welcome-copy">
          <div className="welcome-kicker"><span className="dot dot-safe dot-pulse" /> AI-assisted DevSecOps review</div>
          <h1>Security that<br /><span>works with you.</span></h1>
          <p className="welcome-lede">Review security before it reaches production.</p>
          <p className="welcome-support">
            Vigil brings AI-powered security analysis to your pull requests, helping your team identify security risks, understand findings, and make confident decisions without slowing delivery.
          </p>
          <div className="welcome-actions">
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/signup')}>
              Get Started <ArrowRight size={14} />
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => navigate('/login')}>Sign In</button>
          </div>
          <div className="welcome-proof">
            <span><CheckCircle size={11} /> AI-powered PR analysis</span>
            <span><CheckCircle size={11} /> Human-controlled review</span>
            <span><CheckCircle size={11} /> Human decision stays final</span>
          </div>
        </section>

        <section className="welcome-visual" aria-label="Vigil security analysis workflow">
          <div className="welcome-visual-glow" />
          <SecurityPipelineVisual />
          <div className="welcome-signal-row">
            <div className="welcome-signal welcome-signal-top">
              <span className="dot dot-safe dot-pulse" />
              <div><strong>AI-powered PR review</strong><small>Analyze pull requests for potential security risks.</small></div>
            </div>
            <div className="welcome-signal welcome-signal-bottom">
              <ShieldCheck size={13} />
              <div><strong>Human-controlled</strong><small>AI identifies risks. Your team makes the final decision.</small></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="welcome-trust">
        {TRUST_POINTS.map(({ icon: Icon, title, text }) => (
          <div className="welcome-trust-item" key={title}>
            <span><Icon size={15} /></span>
            <div><strong>{title}</strong><small>{text}</small></div>
          </div>
        ))}
      </footer>
    </div>
  );
}
