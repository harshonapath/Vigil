import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, ShieldAlert, CheckCircle, ArrowRight, ArrowLeft, Zap } from 'lucide-react';
import { AIOrb } from '../components/AIOrb';

const STEPS = [
  {
    icon: GitBranch,
    num: '01',
    title: 'Connect your repositories',
    body: 'Authenticate with GitHub and grant Vigil read access to your repositories. Analysis works at the pull request level — no full codebase access required.',
    note: 'Uses GitHub OAuth. You control which repositories are monitored.',
  },
  {
    icon: ShieldAlert,
    num: '02',
    title: 'Automatic security analysis',
    body: 'Every pull request is scanned as soon as it opens. Vigil detects OWASP vulnerabilities, hardcoded secrets, dependency risks, and injection patterns.',
    note: 'Analysis runs on code diffs, not full files. Results appear within ~2 minutes.',
  },
  {
    icon: AIOrb,
    num: '03',
    title: 'Understand every finding',
    body: 'Each finding comes with a plain-language explanation of what was detected, why it matters, and what an attacker could do with it.',
    note: 'Explanations are generated in context — not generic boilerplate.',
  },
  {
    icon: Zap,
    num: '04',
    title: 'See a suggested fix',
    body: 'Vigil suggests targeted remediation steps for each finding — specific to your code, not generic advice. Use them as-is or as a starting point.',
    note: 'Fix suggestions are advisory. You review and apply all changes yourself.',
  },
  {
    icon: CheckCircle,
    num: '05',
    title: 'Human review — always',
    body: 'Vigil is a tool, not a gatekeeper. After reviewing AI findings, you make the final call — approve, request changes, or escalate.',
    note: 'All decisions are logged with attribution. Your audit trail is always available.',
  },
];

export default function Tour() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const cur = STEPS[step];
  const Icon = cur.icon;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
    }}>
      {/* Left — step content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 64px',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 60 }}>
          <div style={{ width: 26, height: 26, borderRadius: 5, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={13} color="var(--primary-foreground)" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.02em' }}>vigil</span>
        </div>

        {/* Step content */}
        <div key={step} className="page-enter">
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'color-mix(in srgb, var(--primary) 12%, var(--card))',
            border: '1px solid color-mix(in srgb, var(--primary) 22%, var(--border))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <Icon size={18} style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
          </div>

          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 500, marginBottom: 10 }}>
            {cur.num} of {STEPS.length}
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--foreground)', margin: '0 0 14px', lineHeight: 1.2 }}>
            {cur.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--secondary-foreground)', lineHeight: 1.7, margin: '0 0 16px' }}>
            {cur.body}
          </p>

          <div style={{
            padding: '10px 14px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            borderLeft: '2px solid var(--border-strong)',
            marginBottom: 40,
          }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>{cur.note}</p>
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => step > 0 ? setStep(step - 1) : navigate('/')}
          >
            <ArrowLeft size={13} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary btn-sm" onClick={() => setStep(step + 1)}>
              Next <ArrowRight size={13} />
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/login')}>
              Get started <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Right — progress + orbital */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        background: 'var(--card)',
        gap: 48,
      }}>
        {/* Orbital visual */}
        <div style={{ position: 'relative' }}>
          <AIOrb size={160} variant="active" />
          <div style={{
            position: 'absolute',
            bottom: -32, left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}>
            <div className="ai-tag" style={{ display: 'flex', justifyContent: 'center' }}>Vigil AI</div>
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 8 }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step ? 'var(--primary)' : 'var(--border-strong)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 220ms ease',
                padding: 0,
              }}
            />
          ))}
        </div>

        {/* Step list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 280 }}>
          {STEPS.map((s, i) => {
            const SIcon = s.icon;
            return (
              <div
                key={s.num}
                onClick={() => setStep(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  borderRadius: 5,
                  background: i === step ? 'var(--secondary)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 140ms',
                  borderLeft: `2px solid ${i === step ? 'var(--primary)' : 'transparent'}`,
                }}
              >
                <SIcon size={13} style={{ color: i === step ? 'var(--primary)' : 'var(--muted-foreground)', flexShrink: 0 }} strokeWidth={1.75} />
                <span style={{ fontSize: '0.78rem', fontWeight: i === step ? 500 : 400, color: i === step ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                  {s.title}
                </span>
                {i < step && <CheckCircle size={11} style={{ color: 'var(--status-safe)', marginLeft: 'auto' }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
