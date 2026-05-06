"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

import { AppShell, PageHeader, SectionRule } from "@/components/app-shell";
import { ScoreBadge } from "@/components/score-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { MathExpr } from "@/components/math";
import {
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
          setError(err instanceof Error ? err.message : "Could not load results");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  if (error)
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Could not load results</AlertTitle>
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
        eyebrow={`Submission #${sub.id.toString().padStart(4, "0")}`}
        title={sub.exam_title}
        description={
          user?.role === "admin"
            ? `Submitted by ${sub.student_name} (${sub.student_email}).`
            : "Your line-by-line results. Wrong lines stay in place — read the note to learn why."
        }
        action={
          <div className="flex items-center gap-3">
            <ScoreBadge score={sub.score} total={sub.total} />
            <Link
              href={homeHref}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
          </div>
        }
      />

      <SectionRule label="Per-question detail" />

      <div className="space-y-6">
        {questionEntries.map(([qid, lines]) => (
          <Card key={qid}>
            <CardContent className="space-y-4 py-2">
              <div className="flex items-baseline justify-between border-b border-rule pb-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                  Question {(lines[0].question_position + 1).toString().padStart(2, "0")}
                </div>
                <div className="font-mono text-xs text-muted-foreground tabular-nums">
                  {lines.filter((l) => l.correct).length} / {lines.length} correct
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
                    <li
                      key={line.id}
                      className={`rounded-md border p-3 space-y-2 ${
                        line.correct
                          ? "bg-correct-soft border-correct/30"
                          : "bg-mark-soft/60 border-mark/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`step-counter mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                            line.correct
                              ? "bg-correct text-paper"
                              : "bg-mark text-primary-foreground"
                          }`}
                        >
                          {line.line_index + 1}
                        </span>
                        <div className="flex-1 overflow-x-auto">
                          <MathExpr latex={`= ${line.submitted_latex}`} display />
                        </div>
                        {line.correct ? (
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-correct" />
                        ) : (
                          <XCircle className="mt-1 h-4 w-4 shrink-0 text-mark" />
                        )}
                      </div>
                      {!line.correct && line.explanation && (
                        <p className="ml-9 text-sm text-mark italic">
                          {line.explanation}
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
