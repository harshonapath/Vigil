import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { OrbSM } from './AIOrb';

const CTX: Record<string, { title: string; titleHi: string; body: string; bodyHi: string; suggestions: string[]; suggestionsHi: string[] }> = {
  '/dashboard': {
    title: 'Dashboard overview',
    titleHi: 'मुख्य पृष्ठ',
    body: "3 pull requests need your decision today. PR #47 has 2 critical findings — JWT secret exposure is the highest priority.",
    bodyHi: "आज 3 pull requests आपके निर्णय का इंतजार कर रहे हैं। PR #47 में 2 गंभीर समस्याएं हैं।",
    suggestions: ['Show critical findings', 'Oldest pending PR', 'Explain risk score'],
    suggestionsHi: ['गंभीर समस्याएं दिखाएं', 'सबसे पुराना PR'],
  },
  '/repositories': {
    title: 'Repository insights',
    titleHi: 'रिपॉजिटरी जानकारी',
    body: "api-gateway has the lowest security score (42) due to 2 unresolved critical findings. 2 repositories haven't been analyzed yet.",
    bodyHi: "api-gateway का security score सबसे कम (42) है — 2 अनसुलझी गंभीर समस्याओं की वजह से।",
    suggestions: ['Why is api-gateway risky?', 'Analyze pending repos', 'Compare scores'],
    suggestionsHi: ['api-gateway में क्या खतरा है?'],
  },
  '/pull-requests': {
    title: 'Pull request analysis',
    titleHi: 'Pull request विश्लेषण',
    body: "PR #47 introduces a hardcoded JWT secret — this pattern can allow token forgery. VIGIL also scans every PR for prompt injection attempts that could manipulate the AI reviewer.",
    bodyHi: "PR #47 में JWT secret hardcoded है — इससे token forgery हो सकती है। VIGIL prompt injection attempts भी detect करता है।",
    suggestions: ['Explain PR #47 risk', 'Which PRs are safe?', 'What is prompt injection?'],
    suggestionsHi: ['PR #47 का खतरा बताएं'],
  },
  '/findings': {
    title: 'Security findings',
    titleHi: 'सुरक्षा समस्याएं',
    body: "2 critical findings are open. The most common pattern is hardcoded secrets — found across 2 files. OWASP A02 is the primary category.",
    bodyHi: "2 गंभीर समस्याएं खुली हैं। hardcoded secrets सबसे आम समस्या है।",
    suggestions: ['Fix hardcoded secrets', 'Explain OWASP A02', 'Critical findings only'],
    suggestionsHi: ['hardcoded secrets कैसे ठीक करें?'],
  },
  '/analytics': {
    title: 'Analytics summary',
    titleHi: 'Analytics सारांश',
    body: "Your review velocity improved 14% this month. api-gateway accounts for 48% of all findings — focus there for maximum impact.",
    bodyHi: "इस महीने review speed 14% बेहतर हुई। api-gateway में सबसे ज्यादा समस्याएं हैं।",
    suggestions: ['Why is score improving?', 'Slowest repos to review', 'Finding trend summary'],
    suggestionsHi: ['score क्यों बेहतर हो रहा है?'],
  },
  '/commits': {
    title: 'Commit analysis',
    titleHi: 'Commit विश्लेषण',
    body: "3 recent commits were flagged for security-sensitive patterns — 2 involve auth route changes, 1 involves input handling.",
    bodyHi: "3 हाल के commits में सुरक्षा से जुड़े बदलाव मिले हैं।",
    suggestions: ['Which commits have secrets?', 'Explain commit a3f9c12', 'Auth changes summary'],
    suggestionsHi: ['कौन से commits में secrets हैं?'],
  },
  '/review-history': {
    title: 'Review timeline',
    titleHi: 'समीक्षा इतिहास',
    body: "28 reviews completed this month. Average resolution time is 4.2 hours. 3 were escalated — all related to auth flows.",
    bodyHi: "इस महीने 28 समीक्षाएं पूरी हुईं। औसत समाधान समय 4.2 घंटे है।",
    suggestions: ['Show escalated reviews', 'Most common findings', 'Reviewer stats'],
    suggestionsHi: ['escalated reviews दिखाएं'],
  },
  '/settings': {
    title: 'Configuration',
    titleHi: 'सेटिंग्स',
    body: "You can add GitHub organizations, adjust AI analysis depth, and configure notification preferences from this page.",
    bodyHi: "यहाँ से GitHub organizations जोड़ें, AI depth सेट करें और notifications configure करें।",
    suggestions: ['How to add an org?', 'What does deep mode do?', 'Manage team access'],
    suggestionsHi: ['नया org कैसे जोड़ें?'],
  },
  '/prompt-injection': {
    title: 'Prompt Injection Defense',
    titleHi: 'Prompt Injection सुरक्षा',
    body: "VIGIL's security detector scans every diff, commit message, and PR description for instruction-hijacking attempts before they reach the AI reviewer. Detected injection attempts are blocked and surfaced as HIGH severity findings.",
    bodyHi: "VIGIL हर diff, commit message और PR description को scan करता है ताकि AI reviewer को manipulate न किया जा सके।",
    suggestions: ['What is prompt injection?', 'How does VIGIL block it?', 'View injection findings'],
    suggestionsHi: ['Prompt injection क्या है?', 'VIGIL इसे कैसे रोकता है?'],
  },
};

export default function AIPanel() {
  const { setAiPanelOpen, lang } = useApp();
  const location = useLocation();
  const ctx = CTX[location.pathname] ?? CTX['/dashboard'];

  const title = lang === 'hi' ? ctx.titleHi : ctx.title;
  const body  = lang === 'hi' ? ctx.bodyHi  : ctx.body;
  const suggs = lang === 'hi' ? ctx.suggestionsHi : ctx.suggestions;

  return (
    <div style={{
      position: 'fixed',
      top: 0, right: 0,
      width: 300,
      height: '100vh',
      background: 'var(--card)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 40,
    }}>
      {/* Header */}
      <div style={{
        height: 56,
        padding: '0 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <OrbSM variant="active" />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)', lineHeight: 1 }}>Vigil AI</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: 2 }}>{title}</div>
          </div>
        </div>
        <button
          onClick={() => setAiPanelOpen(false)}
          className="btn btn-ghost"
          style={{ padding: 5 }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Context message */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        <div style={{
          background: 'color-mix(in srgb, var(--ai) 5%, var(--secondary))',
          border: '1px solid color-mix(in srgb, var(--ai) 15%, var(--border))',
          borderRadius: 5,
          padding: '12px 14px',
          marginBottom: 18,
        }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--foreground)', lineHeight: 1.65, margin: 0 }}>
            {body}
          </p>
        </div>

        <div style={{
          fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--muted-foreground)', marginBottom: 8,
        }}>
          Suggested
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggs.map((s) => (
            <button
              key={s}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '8px 12px', fontWeight: 400 }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--secondary)',
          border: '1px solid var(--border)',
          borderRadius: 5,
          padding: '8px 12px',
        }}>
          <input
            placeholder={lang === 'hi' ? 'AI से पूछें…' : 'Ask Vigil AI…'}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--foreground)', fontSize: '0.78rem' }}
          />
          <OrbSM size={16} />
        </div>
      </div>
    </div>
  );
}
