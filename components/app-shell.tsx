"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";

type Props = {
  children: React.ReactNode;
  /** If set, redirect away unless the current user has this role. */
  requireRole?: "student" | "admin";
};

/**
 * Page chrome for every authed view. Renders a serif wordmark, a tiny
 * role-aware nav, and a logout. Behaves as a guard: while auth state is
 * loading we render skeletons; if the user isn't allowed we redirect.
 */
export function AppShell({ children, requireRole }: Props) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const tCommon = useTranslations("common");
  const tNav = useTranslations("nav");
  const tRoles = useTranslations("roles");

  useEffect(() => {
    if (status !== "ready") return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (requireRole && user.role !== requireRole) {
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [status, user, requireRole, router]);

  if (status !== "ready" || !user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-12 space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (requireRole && user.role !== requireRole) return null;

  const home = user.role === "admin" ? "/admin" : "/dashboard";

  return (
    <div className="min-h-screen bg-background paper-grain atmosphere flex flex-col">
      <header className="border-b border-rule backdrop-blur-sm bg-background/60 sticky top-0 z-20">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <Link
            href={home}
            className="flex items-baseline gap-3 group"
          >
            <span className="font-display text-xl font-semibold leading-none tracking-tight">
              {tCommon("appName")}
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {user.role === "admin" ? (
              <>
                <ShellLink href="/admin">{tNav("overview")}</ShellLink>
                <ShellLink href="/admin/students">{tNav("students")}</ShellLink>
                <ShellLink href="/admin/exams/new">{tNav("newExam")}</ShellLink>
              </>
            ) : (
              <>
                <ShellLink href="/dashboard">{tNav("dashboard")}</ShellLink>
              </>
            )}
            <span className="mx-2 hidden h-5 w-px bg-rule sm:inline-block" />
            <span className="hidden text-xs text-muted-foreground sm:inline-block">
              {user.name}
              <span className="mx-1 text-rule">·</span>
              <span className="uppercase tracking-[0.18em]">
                {tRoles(user.role)}
              </span>
            </span>
            <LocaleSwitcher />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              aria-label={tCommon("signOut")}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">{tCommon("signOut")}</span>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1 relative">
        <div className="mx-auto w-full max-w-5xl px-6 py-10 anim-rise">{children}</div>
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-6 py-5 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.32em]">MPS</span>
        </div>
      </footer>
    </div>
  );
}

function ShellLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative rounded-md px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:text-foreground hover:bg-mark-soft/70 group/shell"
    >
      <span>{children}</span>
      <span className="absolute inset-x-3 bottom-1 h-px scale-x-0 bg-mark transition-transform duration-200 group-hover/shell:scale-x-100" />
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-10 relative flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
      {/* faint oversized serif numeral — pure decoration */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 hidden font-display font-semibold text-[160px] leading-none text-mark/[0.06] select-none sm:block"
      >
        Σ
      </span>
      <div className="space-y-2 relative">
        {eyebrow && (
          <div className="text-[10px] font-mono uppercase tracking-[0.32em] text-mark anim-rise">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-mark mr-2 align-middle animate-pulse" />
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl anim-write">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base anim-rise">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 anim-rise">{action}</div>}
    </div>
  );
}

export function SectionRule({ label }: { label?: string }) {
  return (
    <div className="my-8 flex items-center gap-4">
      <span className="h-px flex-1 shimmer-rule" />
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {label}
        </span>
      )}
      <span className="h-px flex-1 shimmer-rule" />
    </div>
  );
}
