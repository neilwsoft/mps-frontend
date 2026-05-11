"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppShell, PageHeader, SectionRule } from "@/components/app-shell";
import { ScoreBadge } from "@/components/score-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { MathExpr } from "@/components/math";
import {
  adminOverrideLine,
  fetchSubmission,
  finalizeSubmission,
  type SubmissionDetail,
  type SubmissionLine,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AppShell>
      <ResultsInner submissionId={Number(id)} />
    </AppShell>
  );
}

function ResultsInner({ submissionId }: { submissionId: number }) {
  const { user } = useAuth();
  const t = useTranslations("results");
  const [sub, setSub] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const initial = await fetchSubmission(submissionId);
        // If a student lands here without finalize having been called
        // (e.g. /results/N typed manually), grade in place.
        if (initial.submitted_at === null) {
          await finalizeSubmission(submissionId);
        }
        const finalSub = await fetchSubmission(submissionId);
        if (!cancelled) setSub(finalSub);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : t("errorTitle"));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [submissionId, t]);

  if (error)
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>{t("errorTitle")}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  if (!sub) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Group lines by question for rendering.
  const byQuestion = new Map<number, SubmissionLine[]>();
  for (const line of sub.lines) {
    if (!byQuestion.has(line.question_id)) byQuestion.set(line.question_id, []);
    byQuestion.get(line.question_id)!.push(line);
  }
  const questionEntries = [...byQuestion.entries()].sort(
    ([, a], [, b]) => a[0].question_position - b[0].question_position,
  );

  const homeHref = user?.role === "admin" ? "/admin" : "/dashboard";

  return (
    <>
      <PageHeader
        eyebrow={t("submissionEyebrow", {
          id: sub.id.toString().padStart(4, "0"),
        })}
        title={sub.exam_title}
        description={
          user?.role === "admin"
            ? t("descriptionAdmin", {
                name: sub.student_name,
                email: sub.student_email,
              })
            : t("descriptionStudent")
        }
        action={
          <div className="flex items-center gap-3">
            <ScoreBadge score={sub.score} total={sub.total} />
            <Link
              href={homeHref}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("back")}
            </Link>
          </div>
        }
      />

      <SectionRule label={t("perQuestionDetail")} />

      {sub.hints.length > 0 && (
        <Alert className="mb-4 border-mark/30">
          <AlertTitle>
            {t("hintsUsedTitle", { count: sub.hints.length })}
          </AlertTitle>
          <AlertDescription>{t("hintsUsedDescription")}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {questionEntries.map(([qid, lines]) => (
          <Card key={qid}>
            <CardContent className="space-y-4 py-2">
              <div className="flex items-baseline justify-between border-b border-rule pb-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                  {t("questionLabel", {
                    number: (lines[0].question_position + 1)
                      .toString()
                      .padStart(2, "0"),
                  })}
                </div>
                <div className="font-mono text-xs text-muted-foreground tabular-nums">
                  {t("perQuestionScore", {
                    correct: lines.filter(
                      (l) => (l.override_correct ?? l.correct) === 1,
                    ).length,
                    total: lines.length,
                  })}
                </div>
              </div>
              <div className="rounded-md border border-rule bg-background/40 p-4 text-2xl">
                <MathExpr latex={lines[0].question_prompt} display />
              </div>
              <ol className="space-y-2">
                {lines
                  .slice()
                  .sort((a, b) => a.line_index - b.line_index)
                  .map((line) => (
                    <ResultLineRow
                      key={line.id}
                      line={line}
                      isAdmin={user?.role === "admin"}
                      onScoreChanged={(score, total) =>
                        setSub((prev) => (prev ? { ...prev, score, total } : prev))
                      }
                      onLineUpdated={(patch) =>
                        setSub((prev) =>
                          prev
                            ? {
                                ...prev,
                                lines: prev.lines.map((l) =>
                                  l.id === line.id ? { ...l, ...patch } : l,
                                ),
                              }
                            : prev,
                        )
                      }
                    />
                  ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function ResultLineRow({
  line,
  isAdmin,
  onScoreChanged,
  onLineUpdated,
}: {
  line: SubmissionLine;
  isAdmin: boolean;
  onScoreChanged: (score: number, total: number) => void;
  onLineUpdated: (patch: Partial<SubmissionLine>) => void;
}) {
  const t = useTranslations("results");
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const overridden = line.override_correct !== null && line.override_correct !== undefined;
  const effectiveCorrect = (line.override_correct ?? line.correct) === 1;

  async function applyOverride(correct: boolean) {
    if (!reason.trim()) {
      setErr(t("override.errorNoReason"));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await adminOverrideLine(line.id, correct, reason.trim());
      onScoreChanged(res.score, res.total);
      onLineUpdated({
        override_correct: correct ? 1 : 0,
        override_reason: reason.trim(),
        override_at: new Date().toISOString(),
      });
      setEditing(false);
      setReason("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("override.errorFallback"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li
      className={`rounded-md border p-3 space-y-2 ${
        effectiveCorrect
          ? "bg-correct-soft border-correct/30"
          : "bg-mark-soft/60 border-mark/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`step-counter mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
            effectiveCorrect
              ? "bg-correct text-paper"
              : "bg-mark text-primary-foreground"
          }`}
        >
          {line.line_index + 1}
        </span>
        <div className="flex-1 overflow-x-auto">
          <MathExpr latex={`= ${line.submitted_latex}`} display />
          {!effectiveCorrect && line.partial_score > 0 && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-mark">
              {t("partial", { pct: Math.round(line.partial_score * 100) })}
            </p>
          )}
        </div>
        {effectiveCorrect ? (
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-correct" />
        ) : (
          <XCircle className="mt-1 h-4 w-4 shrink-0 text-mark" />
        )}
      </div>
      {!line.correct && line.explanation && (
        <p className="ml-9 text-sm text-mark italic">{line.explanation}</p>
      )}
      {overridden && (
        <div className="ml-9 flex items-start gap-2 rounded border border-mark/30 bg-card/60 p-2 text-xs">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mark" />
          <div>
            <span className="font-mono uppercase tracking-[0.18em] text-mark">
              {t("override.tag")}
            </span>{" "}
            {line.override_by_name
              ? t("override.byName", { name: line.override_by_name })
              : ""}
            {line.override_at &&
              ` · ${new Date(line.override_at + "Z").toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}`}
            {line.override_reason && (
              <p className="mt-0.5 italic text-muted-foreground">
                &ldquo;{line.override_reason}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}
      {isAdmin && (
        <div className="ml-9 space-y-2">
          {!editing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
            >
              {overridden ? t("override.openExisting") : t("override.openIdle")}
            </Button>
          ) : (
            <div className="space-y-2 rounded border border-rule bg-card/60 p-2">
              <textarea
                className="w-full rounded border border-rule bg-background px-2 py-1 font-mono text-xs"
                placeholder={t("override.reasonPlaceholder")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
              {err && <p className="text-xs text-mark">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => applyOverride(true)}
                  disabled={saving}
                >
                  {t("override.markCorrect")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyOverride(false)}
                  disabled={saving}
                >
                  {t("override.markWrong")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setErr(null);
                  }}
                  disabled={saving}
                >
                  {t("override.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

