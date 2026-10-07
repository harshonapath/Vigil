import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CheckCircle, Sparkles, X } from 'lucide-react';

interface GuidedTourModalProps {
  onClose: () => void;
}

interface TourStep {
  target: string;
  title: string;
  body: string;
  placement: 'right' | 'left';
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const NAV_STEPS: TourStep[] = [
  {
    target: 'nav-dashboard',
    title: 'Dashboard',
    body: 'Get an overview of pull requests, security findings, review activity, and your current security posture.',
    placement: 'right',
  },
  {
    target: 'nav-repositories',
    title: 'Repositories',
    body: 'Connect and monitor repositories that Vigil analyzes for security risks.',
    placement: 'right',
  },
  {
    target: 'nav-pullRequests',
    title: 'Pull Requests',
    body: 'Review AI-analyzed pull requests, inspect security findings, and make the final human review decision.',
    placement: 'right',
  },
  {
    target: 'nav-findings',
    title: 'Security Findings',
    body: 'Explore vulnerabilities detected by Vigil, including severity, affected code, potential impact, and suggested fixes.',
    placement: 'right',
  },
  {
    target: 'nav-commits',
    title: 'Commit Analysis',
    body: 'Inspect individual commits, security signals, and code changes identified during analysis.',
    placement: 'right',
  },
  {
    target: 'nav-analytics',
    title: 'Analytics',
    body: 'Track security trends, review activity, findings, and repository-level security metrics.',
    placement: 'right',
  },
  {
    target: 'nav-reviewHistory',
    title: 'Review History',
    body: 'View the audit trail of previous security reviews, decisions, findings, and escalations.',
    placement: 'right',
  },
];

const AI_STEP: TourStep = {
  target: 'ask-vigil-ai',
  title: 'Meet Ask Vigil AI',
  body: 'Get contextual explanations and guidance about the security information on the current page.',
  placement: 'left',
};

const ALL_STEPS = [...NAV_STEPS, AI_STEP];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function GuidedTourModal({ onClose }: GuidedTourModalProps) {
  const [phase, setPhase] = useState<'welcome' | 'tour' | 'complete'>('welcome');
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const current = ALL_STEPS[step];
  const isAiStep = step === NAV_STEPS.length;

  const closeTour = useCallback(() => {
    document.body.classList.remove('guided-tour-running');
    window.dispatchEvent(new Event('vigil-tour-end'));
    onClose();
  }, [onClose]);

  const startTour = () => {
    document.body.classList.add('guided-tour-running');
    window.dispatchEvent(new Event('vigil-tour-start'));
    window.setTimeout(() => setPhase('tour'), 240);
  };

  const returnToWelcome = () => {
    document.body.classList.remove('guided-tour-running');
    window.dispatchEvent(new Event('vigil-tour-end'));
    setTargetRect(null);
    setPhase('welcome');
  };

  const updateTarget = useCallback(() => {
    if (phase !== 'tour') return;
    const element = document.querySelector<HTMLElement>(`[data-tour-target="${current.target}"]`);
    if (!element) {
      setTargetRect(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    const padding = 8;
    setTargetRect({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  }, [current.target, isAiStep, phase]);

  useLayoutEffect(() => {
    if (phase !== 'tour') return;
    const element = document.querySelector<HTMLElement>(`[data-tour-target="${current.target}"]`);
    if (!element) {
      setTargetRect(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    const outsideViewport = rect.top < 0
      || rect.left < 0
      || rect.bottom > window.innerHeight
      || rect.right > window.innerWidth;
    if (outsideViewport) {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    updateTarget();
  }, [current.target, phase, updateTarget]);

  useEffect(() => {
    if (phase !== 'tour') return;
    const element = document.querySelector<HTMLElement>(`[data-tour-target="${current.target}"]`);
    let frame = 0;
    const startedAt = performance.now();
    const resizeObserver = new ResizeObserver(updateTarget);
    const followLayout = (now: number) => {
      updateTarget();
      if (now - startedAt < 420) frame = window.requestAnimationFrame(followLayout);
    };
    if (element) resizeObserver.observe(element);
    frame = window.requestAnimationFrame(followLayout);
    window.addEventListener('resize', updateTarget);
    document.addEventListener('scroll', updateTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateTarget);
      document.removeEventListener('scroll', updateTarget, true);
    };
  }, [current.target, phase, updateTarget]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTour();
      if (phase !== 'tour') return;
      if (event.key === 'ArrowLeft') setStep(value => Math.max(0, value - 1));
      if (event.key === 'ArrowRight' && !isAiStep) setStep(value => value + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeTour, isAiStep, phase]);

  useEffect(() => () => {
    document.body.classList.remove('guided-tour-running');
    window.dispatchEvent(new Event('vigil-tour-end'));
  }, []);

  const spotlightStyle = targetRect
    ? ({
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
      } satisfies CSSProperties)
    : undefined;

  const tooltipStyle = (() => {
    if (!targetRect) return undefined;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(360, viewportWidth - 24);
    const estimatedHeight = isAiStep ? 270 : 235;
    let left = current.placement === 'left'
      ? targetRect.left - cardWidth - 18
      : targetRect.left + targetRect.width + 18;
    let top = current.placement === 'left'
      ? targetRect.top + targetRect.height - estimatedHeight
      : targetRect.top - 12;

    if (left < 12 || left + cardWidth > viewportWidth - 12) {
      left = clamp(targetRect.left, 12, viewportWidth - cardWidth - 12);
      top = targetRect.top + targetRect.height + 14;
    }

    return {
      left,
      top: clamp(top, 12, Math.max(12, viewportHeight - estimatedHeight - 12)),
    } satisfies CSSProperties;
  })();

  if (phase === 'welcome') {
    return createPortal(
      <div className="guided-tour-backdrop" role="presentation">
        <section className="guided-tour-modal guided-tour-welcome" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title">
          <button type="button" className="guided-tour-close" onClick={closeTour} aria-label="Close guided tour">
            <X size={15} />
          </button>
          <div className="guided-tour-kicker">Vigil workspace tour</div>
          <div className="guided-tour-welcome-icon"><Sparkles size={18} /></div>
          <h2 id="guided-tour-title">Welcome to Vigil</h2>
          <p>Take a quick guided tour of security reviews, AI security insights, and human approval workflows.</p>
          <div className="guided-tour-actions guided-tour-welcome-actions">
            <button type="button" className="btn btn-primary" onClick={startTour}>
              Take Guided Tour <ArrowRight size={13} />
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeTour}>Maybe Later</button>
          </div>
        </section>
      </div>,
      document.body,
    );
  }

  if (phase === 'complete') {
    return createPortal(
      <div className="guided-tour-backdrop" role="presentation">
        <section className="guided-tour-modal guided-tour-complete" role="dialog" aria-modal="true" aria-labelledby="guided-tour-complete-title">
          <button type="button" className="guided-tour-close" onClick={closeTour} aria-label="Close guided tour">
            <X size={15} />
          </button>
          <div className="guided-tour-complete-icon"><CheckCircle size={22} /></div>
          <h2 id="guided-tour-complete-title">You're all set!</h2>
          <p>You now know the core Vigil workflow. Start exploring your security workspace.</p>
          <div className="guided-tour-actions guided-tour-welcome-actions">
            <button type="button" className="btn btn-primary" onClick={closeTour}>
              Start Exploring <ArrowRight size={13} />
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeTour}>Close</button>
          </div>
        </section>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="guided-tour-stage" role="dialog" aria-modal="true" aria-label="Vigil workspace guided tour">
      {targetRect && (
        <div
          className={`guided-tour-spotlight${isAiStep ? ' is-ai' : ''}`}
          style={spotlightStyle}
          aria-hidden="true"
        />
      )}

      <section
        className={`guided-tour-tooltip${isAiStep ? ' is-ai' : ''}`}
        style={tooltipStyle}
        aria-live="polite"
      >
        <div className="guided-tour-tooltip-top">
          <span>{isAiStep ? 'Vigil AI assistant' : 'Workspace navigation'}</span>
          <button type="button" className="guided-tour-skip" onClick={closeTour}>Skip Tour</button>
        </div>

        <div key={current.target} className="guided-tour-tooltip-copy">
          <h2>{current.title}</h2>
          <p>{current.body}</p>

          {isAiStep && (
            <div className="guided-tour-human-note">
              AI assists the reviewer — the final security decision remains with the human reviewer.
            </div>
          )}
        </div>

        {!isAiStep && (
          <div className="guided-tour-step-progress">
            <div><span style={{ width: `${((step + 1) / NAV_STEPS.length) * 100}%` }} /></div>
            <strong>{step + 1} of {NAV_STEPS.length}</strong>
          </div>
        )}

        <div className="guided-tour-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (step === 0) returnToWelcome();
              else setStep(value => value - 1);
            }}
          >
            <ArrowLeft size={12} /> Back
          </button>
          {isAiStep ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPhase('complete')}>
              Finish Tour <ArrowRight size={12} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(value => value + 1)}>
              Next <ArrowRight size={12} />
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
