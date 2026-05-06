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
import {
  fetchStudentDetail,
  type SubmissionSummary,
  type User,
} from "@/lib/api";

type Detail = { student: User & { created_at: string }; submissions: SubmissionSummary[] };

export default function AdminStudentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AppShell requireRole="admin">
      <Inner userId={Number(id)} />
    </AppShell>
  );
}

function Inner({ userId }: { userId: number }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudentDetail(userId)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [userId]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load student</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const submitted = data.submissions.filter((s) => s.submitted_at);
  const totalScore = submitted.reduce((a, s) => a + s.score, 0);
  const totalLines = submitted.reduce((a, s) => a + s.total, 0);

  return (
    <>
      <PageHeader
        eyebrow="Student record"
        title={data.student.name}
        description={`${data.student.email} · joined ${new Date(
          data.student.created_at + "Z",
        ).toLocaleDateString()}`}
        action={
          <Link
            href="/admin/students"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All students
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3 mb-10">
        <SmallStat label="Attempts" value={String(data.submissions.length)} />
        <SmallStat label="Graded" value={String(submitted.length)} />
        <SmallStat
          label="Accuracy"
          value={
            totalLines === 0 ? "—" : `${Math.round((totalScore / totalLines) * 100)}%`
          }
          hint={`${totalScore} / ${totalLines} lines`}
        />
      </section>

      <SectionRule label="Submissions" />

      <div className="space-y-3">
        {data.submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            This student hasn&rsquo;t taken any exams yet.
          </p>
        ) : (
          data.submissions.map((s) => (
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
                  <span className="mx-2 text-rule">·</span>
                  {s.submitted_at ? "Graded" : "In progress"}
                </div>
                <p className="font-display text-base">{s.exam_title}</p>
              </div>
              {s.submitted_at ? (
                <ScoreBadge score={s.score} total={s.total} size="sm" />
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  pending
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </>
  );
}

function SmallStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="py-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 font-display text-3xl tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
