"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AppShell, PageHeader, SectionRule } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScoreBadge } from "@/components/score-badge";
import { MathExpr } from "@/components/math";
import {
  fetchExam,
  fetchExamSubmissions,
  type AdminQuestion,
  type Exam,
  type SubmissionSummary,
} from "@/lib/api";

export default function AdminExamDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AppShell requireRole="admin">
      <Inner examId={Number(id)} />
    </AppShell>
  );
}

function Inner({ examId }: { examId: number }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchExam(examId), fetchExamSubmissions(examId)])
      .then(([e, sd]) => {
        setExam(e);
        setSubs(sd.submissions);
      })
      .catch((err: Error) => setError(err.message));
  }, [examId]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load exam</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  if (!exam) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const questions = exam.questions as AdminQuestion[];

  return (
    <>
      <PageHeader
        eyebrow={`Exam ${examId.toString().padStart(2, "0")}`}
        title={exam.title}
        description={exam.description}
        action={
          <Link
            href="/admin"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />

      <SectionRule label="I · Model solutions" />
      <div className="space-y-4">
        {questions.map((q) => (
          <Card key={q.id}>
            <CardContent className="py-2 space-y-3">
              <div className="flex items-baseline justify-between border-b border-rule pb-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                  Question {(q.position + 1).toString().padStart(2, "0")}
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {q.solution_latex.length} steps
                </span>
              </div>
              <div className="rounded-md border border-rule bg-background/40 p-3 text-xl">
                <MathExpr latex={q.prompt_latex} display />
              </div>
              <ol className="space-y-1.5">
                {q.solution_latex.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded border border-rule bg-card/40 p-2"
                  >
                    <span className="step-counter mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mark-soft text-[10px] text-mark">
                      {i + 1}
                    </span>
                    <div className="flex-1 overflow-x-auto">
                      <MathExpr latex={`= ${s}`} display />
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionRule label="II · Student submissions" />
      <div className="space-y-2">
        {subs === null ? (
          <Skeleton className="h-24 w-full" />
        ) : subs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No one has attempted this exam yet.
          </p>
        ) : (
          subs.map((s) => (
            <Link
              key={s.id}
              href={`/results/${s.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-card p-3 hover:border-mark/40"
            >
              <div className="space-y-0.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {new Date(s.started_at + "Z").toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                <p className="font-display text-base">{s.student_name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {s.student_email}
                </p>
              </div>
              {s.submitted_at ? (
                <ScoreBadge score={s.score} total={s.total} size="sm" />
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  In progress
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </>
  );
}
