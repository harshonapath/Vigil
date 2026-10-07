import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight, Loader2, AlertTriangle, User, Lock } from 'lucide-react';
import { authService } from '../services/authService';
import type { UserRead } from '../types';
import { Button } from '../components/common/Button';
import { Card, CardContent } from '../components/common/Card';
import { Badge } from '../components/common/Badge';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchUser = async () => {
      setLoading(true);
      try {
        const u = await authService.getCurrentUser();
        if (mounted) setUser(u);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to check session');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchUser();
    return () => { mounted = false; };
  }, []);

  const handleEnterApp = () => navigate('/repositories');

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Background subtle grid */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: 'none'
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Brand */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border-2 border-indigo-500/40 flex items-center justify-center">
              <Shield className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight">SecurePR AI</h1>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className="text-xs font-mono uppercase tracking-widest text-slate-400">
              Powered by VIGIL
            </span>
            <Badge variant="outline" className="text-[10px] py-0.5">v1.0</Badge>
          </div>
          <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
            AI proposes. Evidence verifies. Humans approve.
          </p>
        </div>

        {/* Session card */}
        <Card>
          <CardContent className="p-6 space-y-5">
            {loading ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-400">Checking session…</p>
              </div>
            ) : error ? (
              <div>
                <div className="flex items-start gap-3 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg mb-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-amber-300">Backend Unavailable</p>
                    <p className="text-xs text-slate-400 mt-0.5">{error}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Authentication is managed by Microsoft Entra ID. Start the backend on{' '}
                      <code className="font-mono text-indigo-400">http://127.0.0.1:8000</code> to enable full auth integration.
                    </p>
                  </div>
                </div>
                <Button variant="primary" size="md" onClick={handleEnterApp} className="w-full gap-2">
                  Continue in Development Mode
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            ) : user ? (
              <div className="space-y-4">
                {/* Session info */}
                <div className="flex items-center gap-3 p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{user.name || user.email || 'Authenticated User'}</p>
                    {user.email && <p className="text-xs text-slate-400 truncate">{user.email}</p>}
                    {user.message && <p className="text-xs text-slate-500 italic">{user.message}</p>}
                  </div>
                  <Badge variant="success" className="shrink-0 text-[10px]">Active</Badge>
                </div>

                {/* Auth provider info */}
                <div className="flex items-center gap-2 text-xs text-slate-500 p-2.5 rounded-lg border border-slate-800 bg-slate-900/60">
                  <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>Authenticated via Microsoft Entra ID. Session is managed by the VIGIL backend.</span>
                </div>

                <Button variant="primary" size="lg" onClick={handleEnterApp} className="w-full gap-2">
                  Go to Repositories
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Feature list */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { title: 'AI Analysis', desc: 'Automated PR code review with multi-scanner findings' },
            { title: 'Evidence', desc: 'Verified findings with source attribution and severity' },
            { title: 'Human Approval', desc: 'Publish AI reviews after human verification' },
          ].map(item => (
            <div key={item.title} className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
              <p className="text-xs font-semibold text-slate-200">{item.title}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
