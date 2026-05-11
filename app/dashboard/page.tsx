"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppShell, PageHeader, SectionRule } from "@/components/app-shell";
import { AccuracyRing } from "@/components/accuracy-ring";
import { ScoreBadge } from "@/components/score-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  fetchExams,
  fetchSubmissions,
  startSubmission,
  type ExamSummary,
  type SubmissionSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function DashboardPage() {
  return (
    <AppShell requireRole="student">
      <DashboardInner />
    </AppShell>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [exams, setExams] = useState<ExamSummary[] | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchExams(), fetchSubmissions()])
      .then(([e, s]) => {
        setExams(e);
        setSubmissions(s);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleStart(examId: number) {
    setStarting(examId);
    try {
      const { submission_id } = await startSubmission(examId);
      router.push(`/exam/${examId}?submission=${submission_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorStartFallback"));
    } finally {
      setStarting(null);
    }
  }

  const finishedSubs = (submissions ?? []).filter((s) => s.submitted_at);
  const totalCorrect = finishedSubs.reduce((acc, s) => acc + s.score, 0);
  const totalLines = finishedSubs.reduce((acc, s) => acc + s.total, 0);
  const accuracyPct = totalLines === 0 ? null : totalCorrect / totalLines;

  // Next-up exam: oldest exam the student hasn't graded yet, falling
  // back to the most recent if everything is graded.
  const gradedExamIds = new Set(
    finishedSubs.map((s) => s.exam_id),
  );
  const nextUp =
    (exams ?? []).find((e) => !gradedExamIds.has(e.id)) ?? exams?.[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow", {
          name: user?.name.split(" ")[0] ?? t("eyebrowFallback"),
        })}
        title={t("title")}
        description={t("description")}
      />

      {/* Hero row: next-up exam beside accuracy ring + tiny stats */}
      <section className="mb-10 grid gap-4 lg:grid-cols-[2fr_1fr] anim-rise">
        {nextUp ? (
          <div className="relative overflow-hidden rounded-xl border border-mark/30 bg-gradient-to-br from-mark-soft/60 via-card to-card p-6 lift">
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-6 -right-4 font-display font-semibold text-[120px] leading-none text-mark/[0.10] select-none tabular-nums"
            >
              {nextUp.id.toString().padStart(2, "0")}
            </span>
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-mark">
              {t("nextUp")} ·{" "}
              {tCommon("examNumber", {
                number: nextUp.id.toString().padStart(2, "0"),
              })}
            </div>
            <h2 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight">
              {nextUp.title}
            </h2>
            {nextUp.description && (
              <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                {nextUp.description}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={() => handleStart(nextUp.id)} disabled={starting !== null}>
                {starting === nextUp.id ? t("starting") : t("beginAttempt")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
                {tCommon("questionsShort", { count: nextUp.question_count })}
              </span>
            </div>
          </div>
        ) : (
          <Skeleton className="h-44 w-full" />
        )}

        <div className="rounded-xl border border-rule bg-card p-5 flex items-center gap-4">
          <AccuracyRing pct={accuracyPct} size={104} sublabel={t("accuracy")} />
          <div className="space-y-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              {t("lifetime")}
            </div>
            <p className="font-display text-3xl font-semibold tabular-nums leading-none">
              {totalCorrect}
              <span className="text-muted-foreground/60 mx-1">/</span>
              {totalLines || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                finishedSubs.length === 1
                  ? "stepsAcrossExams_one"
                  : "stepsAcrossExams_other",
                { count: finishedSubs.length },
              )}
            </p>
          </div>
        </div>
      </section>

      {error && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SectionRule label={t("sectionAvailable")} />

      <div className="stagger-children grid gap-4 sm:grid-cols-2">
        {exams === null ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : exams.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground italic">
            {t("noExamsPublished")}
          </p>
        ) : (
          exams.map((exam) => (
            <Card key={exam.id} className="group/exam relative overflow-hidden lift">
              <CardContent className="space-y-4 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                      <BookOpen className="h-3 w-3" />
                      {tCommon("examNumber", {
                        number: exam.id.toString().padStart(2, "0"),
                      })}
                    </div>
                    <h3 className="font-display text-2xl font-medium leading-tight">
                      {exam.title}
                    </h3>
                  </div>
                  <span className="font-display text-sm tabular-nums text-muted-foreground">
                    {tCommon("questionsShort", { count: exam.question_count })}
                  </span>
                </div>
                {exam.description && (
                  <p className="text-sm text-muted-foreground">{exam.description}</p>
                )}
                <Button
                  size="sm"
                  onClick={() => handleStart(exam.id)}
                  disabled={starting !== null}
                  className="mt-2"
                >
                  {starting === exam.id ? t("starting") : t("beginAttempt")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <SectionRule label={t("sectionAttempts")} />

      <div className="stagger-children space-y-3">
        {submissions === null ? (
          <Skeleton className="h-24 w-full" />
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {t("noAttempts")}
          </p>
        ) : (
          submissions.map((s) => (
            <Link
              key={s.id}
              href={`/results/${s.id}`}
              className="lift group/sub block rounded-lg border border-rule bg-card p-4 hover:border-mark/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                    <Sparkles className="h-3 w-3" />
                    {s.submitted_at ? t("graded") : t("inProgress")}
                    <span className="text-rule">·</span>
                    {new Date(s.started_at + "Z").toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <p className="font-display text-xl">{s.exam_title}</p>
                </div>
                <div className="flex items-center gap-3">
                  {s.submitted_at ? (
                    <ScoreBadge score={s.score} total={s.total} size="sm" />
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-mark">
                      {t("resume")}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

