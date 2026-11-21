'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useStudio } from '@/context/studio-context';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function AuthScreen({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' }) {
  const { loginWithCredentials, registerAccount, feedback, setFeedback } = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      if (mode === 'login') {
        await loginWithCredentials(email, password);
      } else {
        await registerAccount({
          email,
          password,
          fullName,
          ...(workspaceName.trim() ? { workspaceName: workspaceName.trim() } : {}),
        });
      }
      if (pathname === '/register' || pathname === '/login') {
        router.replace('/dashboard');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Authentication failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      await loginWithCredentials('founder@aicontent.studio', 'DemoStudioPass!2026');
      if (pathname === '/register' || pathname === '/login') {
        router.replace('/dashboard');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Demo login failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lovable-aura relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="lovable-gradient-badge flex h-12 w-12 items-center justify-center rounded-2xl text-ai-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            AI Content Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Idea to studio-grade video &amp; social campaign in seconds.
          </p>
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v === 'register' ? 'register' : 'login')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Create Workspace</TabsTrigger>
              </TabsList>
            </Tabs>
            <CardTitle className="pt-2">
              {mode === 'login' ? 'Welcome back' : 'Get started'}
            </CardTitle>
            <CardDescription>
              {mode === 'login'
                ? 'Sign in with your workspace credentials.'
                : 'Create your account and first studio workspace.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {feedback?.type === 'error' && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {feedback.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-fullname">Full Name</Label>
                    <Input
                      id="auth-fullname"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-workspace">Workspace Name</Label>
                    <Input
                      id="auth-workspace"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Acme Media Studio"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="founder@aicontent.studio"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Continue'
                    : 'Create Account'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </form>

            <div className="relative flex items-center py-1">
              <Separator className="flex-1" />
              <span className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                or
              </span>
              <Separator className="flex-1" />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={handleDemoLogin}
              className="w-full"
            >
              Sign in with Demo Studio Account
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
