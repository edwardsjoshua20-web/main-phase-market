import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Loader2, ShieldCheck } from 'lucide-react';
import { backend } from '@/services/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function MemberLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const returnTo = searchParams.get('returnTo') || '/MemberBenefits';
  const isSignup = mode === 'signup';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    if (isSignup && !fullName.trim()) {
      setError('Name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        const user = await backend.auth.signUp({
          email: email.trim(),
          password,
          full_name: fullName.trim()
        });

        if (!user) {
          toast.success('Account created. Check your email, then sign in.');
          setMode('signin');
          return;
        }
      } else {
        await backend.auth.signIn({
          email: email.trim(),
          password
        });
      }

      toast.success('Signed in.');
      window.location.href = returnTo;
    } catch (err) {
      console.error('Member login failed:', err);
      setError(err.message || 'Sign in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl overflow-hidden">
        <div className="px-6 py-7 border-b border-slate-800">
          <div className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-slate-950 mb-5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Members
          </div>
          <h1 className="text-3xl font-black">
            {isSignup ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Use this to save decks, manage your profile, and keep your tools synced on the live site.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          {isSignup && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">
                Name
              </label>
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                className="h-12 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">
              Email
            </label>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="you@example.com"
              className="h-12 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">
              Password
            </label>
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Password"
              className="h-12 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-900/70 bg-red-950/60 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full bg-yellow-400 text-slate-950 font-black hover:bg-yellow-300"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-4 w-4" />
            )}
            {isSignup ? 'Create Account' : 'Sign In'}
          </Button>

          <button
            type="button"
            onClick={() => {
              setError('');
              setMode(isSignup ? 'signin' : 'signup');
            }}
            className="w-full text-sm font-semibold text-slate-300 hover:text-white"
          >
            {isSignup ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>
        </form>
      </div>
    </div>
  );
}
