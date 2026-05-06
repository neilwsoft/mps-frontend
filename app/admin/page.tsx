"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Users } from "lucide-react";

import { AppShell, PageHeader, SectionRule } from "@/components/app-shell";
import { ScoreBadge } from "@/components/score-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  fetchExams,
  fetchStudents,
  fetchSubmissions,
  type ExamSummary,
  type StudentSummary,
  type SubmissionSummary,
} from "@/lib/api";

export default function AdminOverview() {
  return (
    <AppShell requireRole="admin">
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [exams, setExams] = useState<ExamSummary[] | null>(null);
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchExams(), fetchStudents(), fetchSubmissions()])
      .then(([e, s, sub]) => {
        setExams(e);
        setStudents(s);
        setSubs(sub);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const submitted = (subs ?? []).filter((s) => s.submitted_at);
  const totalScore = submitted.reduce((a, s) => a + s.score, 0);
  const totalLines = submitted.reduce((a, s) => a + s.total, 0);

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title="Teacher’s desk."
        description="At a glance: who&rsquo;s enrolled, what they&rsquo;ve attempted, and where the class is struggling."
        action={
          <Link href="/admin/exams/new" className={buttonVariants()}>
            <Plus className="h-3.5 w-3.5" />
            New exam
          </Link>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="stagger-children grid gap-4 sm:grid-cols-3 mb-12">
        <BigStat
          label="Students"
          value={students == null ? "—" : String(students.length)}
          accent="ink"
        />
        <BigStat
          label="Exams"
          value={exams == null ? "—" : String(exams.length)}
          accent="gold"
        />
        <BigStat
          label="Class accuracy"
          value={
            totalLines === 0 ? "—" : `${Math.round((totalScore / totalLines) * 100)}%`
          }
          hint={`${totalScore} / ${totalLines} graded lines`}
          accent="mark"
        />
      </section>

      <SectionRule label="I · Exams" />
      <div className="stagger-children grid gap-3 sm:grid-cols-2">
        {exams === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          exams.map((exam) => (
            <Link
              key={exam.id}
              href={`/admin/exams/${exam.id}`}
              className="lift rounded-lg border border-rule bg-card p-4 hover:border-mark/40"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                    Exam {exam.id.toString().padStart(2, "0")}
                  </div>
                  <div className="font-display text-xl">{exam.title}</div>
                </div>
                <span className="font-display text-sm tabular-nums text-muted-foreground">
                  {exam.question_count} Q
                </span>
              </div>
              {exam.description && (
                <p className="mt-1 text-sm text-muted-foreground">{exam.description}</p>
              )}
            </Link>
          ))
        )}
      </div>

      <SectionRule label="II · Recent submissions" />
      <div className="stagger-children space-y-2 mb-10">
        {subs === null ? (
          <Skeleton className="h-24 w-full" />
        ) : subs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No submissions yet.
          </p>
        ) : (
          subs.slice(0, 8).map((s) => (
            <Link
              key={s.id}
              href={`/results/${s.id}`}
              className="lift flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-card p-3 hover:border-mark/40"
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
                  {s.student_name ?? "—"}
                </div>
                <div className="font-display text-base">{s.exam_title}</div>
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

      <SectionRule label="III · Students" />
      <div className="space-y-2">
        {students === null ? (
          <Skeleton className="h-24 w-full" />
        ) : students.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No students have registered yet.
          </p>
        ) : (
          students.slice(0, 8).map((s) => (
            <Link
              key={s.id}
              href={`/admin/students/${s.id}`}
              className="lift flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-card p-3 hover:border-mark/40"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mark-soft text-xs font-display text-mark">
                  {s.name
                    .split(" ")
                    .slice(0, 2)
                    .map((p) => p.charAt(0))
                    .join("")
                    .toUpperCase() || "·"}
                </span>
                <div>
                  <div className="font-display text-base">{s.name}</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {s.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {s.submission_count} attempt{s.submission_count === 1 ? "" : "s"}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))
        )}
        {students && students.length > 0 && (
          <Link
            href="/admin/students"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Users className="h-3.5 w-3.5" />
            All students
          </Link>
        )}
      </div>
    </>
  );
}

function BigStat({
  label,
  value,
  hint,
  accent = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "ink" | "mark" | "correct" | "gold";
}) {
  const accentMap: Record<typeof accent, string> = {
    ink: "from-card to-card border-rule",
    mark: "from-mark-soft/50 to-card border-mark/30",
    correct: "from-correct-soft/60 to-card border-correct/30",
    gold: "from-gold-soft/60 to-card border-gold/30",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 ${accentMap[accent]}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -right-4 font-display font-semibold text-[80px] leading-none opacity-[0.08] select-none"
      >
        {value.replace("%", "")}
      </span>
      <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-4xl tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
