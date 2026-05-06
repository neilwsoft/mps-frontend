"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login, user, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "ready" && user) {
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const u = await login(email.trim(), password);
      router.replace(u.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthChrome
      eyebrow="Sign in"
      title="Welcome back to the workbook."
      subtitle="Pick up exactly where you left off — your last attempt is waiting."
      footer={
        <p className="text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/register" className="text-mark underline-offset-4 hover:underline">
            Create a student account
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&rsquo;t sign in</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting} className="w-full" size="lg">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthChrome>
  );
}

export function AuthChrome({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background relative">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <aside className="hidden lg:flex flex-col justify-between border-r border-rule p-12 paper-grain bloom-corner-tl">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl font-semibold tracking-tight">Math Practice</span>
        </div>
        <div className="space-y-6 max-w-md relative">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-6 -top-16 font-display font-semibold text-[200px] leading-none text-mark/[0.10] select-none"
          >
            ¶
          </span>
          <p className="font-display text-5xl font-semibold leading-[1.05] tracking-tight anim-write">
            A quiet room.
            <br />
            <span className="text-mark">Clear margins.</span>
            <br />
            One line at a time.
          </p>
          <div className="h-px w-24 shimmer-rule" />
          <p className="font-mono text-xs leading-relaxed uppercase tracking-[0.18em] text-muted-foreground anim-rise">
            Show your work · type or photograph it · we mark every line and tell you why
          </p>
        </div>
        <p className="text-xs font-mono uppercase tracking-[0.28em] text-muted-foreground">
          K–12 · Algebra · Step-by-step
        </p>
      </aside>
      <section className="flex items-center justify-center px-6 py-10 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.32em] text-mark">
              {eyebrow}
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          {footer && <div className="pt-2">{footer}</div>}
        </div>
      </section>
    </div>
  );
}
