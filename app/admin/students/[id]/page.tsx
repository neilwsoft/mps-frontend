"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppShell, PageHeader, SectionRule } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScoreBadge } from "@/components/score-badge";
import {
  fetchStudentAnalytics,
  type StudentAnalytics,
} from "@/lib/api";

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
  const t = useTranslations("admin.studentDetail");
  const te = useTranslations("admin.studentDetail.expanded");
  const [data, setData] = useState<StudentAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudentAnalytics(userId)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [userId]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("errorTitle")}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { student, summary, exams, topics, questions } = data;
  const accPct = Math.round(summary.accuracy * 100);
  const totalMin = Math.round(summary.total_time_ms / 60000);

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={student.name}
        description={`${student.email} · ${t("joined", {
          date: new Date(student.created_at + "Z").toLocaleDateString(),
        })}`}
        action={
          <Link
            href="/admin/students"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("allStudents")}
          </Link>
        }
      />

      {/* Summary stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        <SmallStat
          label={te("accuracy")}
          value={summary.total_attempts ? `${accPct}%` : "—"}
          hint={te("linesCorrectHint", {
            correct: summary.total_correct,
            total: summary.total_attempts,
          })}
        />
        <SmallStat
          label={te("examsFinalized")}
          value={String(summary.exams_finalized)}
          hint={te("examsAttemptedHint", { count: summary.exams_attempted })}
        />
        <SmallStat
          label={te("timeOnTask")}
          value={summary.total_time_ms ? `${totalMin}m` : "—"}
          hint={te("timeOnTaskHint")}
        />
        <SmallStat
          label={te("hintsUsed")}
          value={String(summary.hints_used)}
          hint={te("hintsUsedHint")}
        />
      </section>

      {/* Score trend over time */}
      {exams.filter((e) => e.submitted_at).length > 1 && (
        <>
          <SectionRule label={te("scoreTrend")} />
          <ScoreTrend exams={exams.filter((e) => e.submitted_at)} />
        </>
      )}

      {/* Per-topic mastery */}
      {topics.length > 0 && (
        <>
          <SectionRule label={te("perTopic")} />
          <div className="space-y-2 mb-10">
            {topics.map((tp) => (
              <TopicBar
                key={tp.topic}
                topic={tp.topic}
                accuracy={tp.accuracy}
                attempts={tp.attempts}
                correct={tp.correct}
              />
            ))}
          </div>
        </>
      )}

      {/* Per-exam history */}
      <SectionRule label={t("submissions")} />
      <div className="space-y-2 mb-10">
        {exams.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {t("noAttempts")}
          </p>
        ) : (
          exams.map((s) => (
            <Link
              key={s.submission_id}
              href={`/results/${s.submission_id}`}
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
                  {s.submitted_at ? t("graded") : t("inProgress")}
                </div>
                <p className="font-display text-base">{s.exam_title}</p>
                <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {te("linesSuffix", { count: s.line_count })}
                  {s.total_time_ms > 0 &&
                    ` · ${te("secondsSuffix", {
                      seconds: Math.round(s.total_time_ms / 1000),
                    })}`}
                  {s.hints_used > 0 &&
                    ` · ${te("hintsSuffix", { count: s.hints_used })}`}
                </p>
              </div>
              {s.submitted_at ? (
                <ScoreBadge score={s.score} total={s.total} size="sm" />
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  {t("pending")}
                </span>
              )}
            </Link>
          ))
        )}
      </div>

      {/* Per-question performance */}
      {questions.length > 0 && (
        <>
          <SectionRule label={te("perQuestion")} />
          <div className="overflow-hidden rounded-md border border-rule">
            <table className="w-full text-sm">
              <thead className="bg-card font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">{te("thExam")}</th>
                  <th className="px-3 py-2 text-left">{te("thPrompt")}</th>
                  <th className="px-3 py-2 text-right">{te("thAttempts")}</th>
                  <th className="px-3 py-2 text-right">{te("thAccuracy")}</th>
                  <th className="px-3 py-2 text-right">{te("thAvgTime")}</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.question_id} className="border-t border-rule">
                    <td className="px-3 py-2 text-muted-foreground">
                      {q.exam_title}
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate font-mono text-xs">
                      {q.prompt_latex}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {q.attempts}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span
                        className="rounded px-1.5 py-0.5"
                        style={{
                          background: heatmapColor(q.accuracy),
                          color: q.accuracy < 0.4 ? "#fff" : "inherit",
                        }}
                      >
                        {Math.round(q.accuracy * 100)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {q.avg_seconds === null
                        ? "—"
                        : `${q.avg_seconds.toFixed(1)}s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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

function TopicBar({
  topic,
  accuracy,
  attempts,
  correct,
}: {
  topic: string;
  accuracy: number;
  attempts: number;
  correct: number;
}) {
  const pct = Math.round(accuracy * 100);
  return (
    <div className="rounded-md border border-rule bg-card p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-display text-sm">{topic}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
          {correct}/{attempts} · {pct}%
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-rule/40">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: heatmapColor(accuracy),
          }}
        />
      </div>
    </div>
  );
}

function ScoreTrend({
  exams,
}: {
  exams: StudentAnalytics["exams"];
}) {
  const points = exams.map((e) => ({
    label: new Date(e.started_at + "Z").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    pct: e.accuracy === null ? 0 : Math.round(e.accuracy * 100),
    title: e.exam_title,
  }));

  // Build SVG polyline so the chart stays self-contained.
  const W = 600;
  const H = 120;
  const pad = 24;
  const stepX =
    points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const yFor = (pct: number) => pad + (1 - pct / 100) * (H - pad * 2);
  const polyline = points
    .map((p, i) => `${pad + i * stepX},${yFor(p.pct)}`)
    .join(" ");

  return (
    <div className="mb-10 rounded-md border border-rule bg-card p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        {/* gridlines at 0/50/100% */}
        {[0, 50, 100].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={W - pad}
            y1={yFor(g)}
            y2={yFor(g)}
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeDasharray="2 4"
          />
        ))}
        <polyline
          points={polyline}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-mark"
        />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={pad + i * stepX}
              cy={yFor(p.pct)}
              r={4}
              className="fill-mark"
            />
            <title>
              {p.label} · {p.title} — {p.pct}%
            </title>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
        {points.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

function heatmapColor(accuracy: number): string {
  if (accuracy >= 0.85) return "rgba(34, 197, 94, 0.55)";
  if (accuracy >= 0.7) return "rgba(132, 204, 22, 0.55)";
  if (accuracy >= 0.5) return "rgba(234, 179, 8, 0.55)";
  if (accuracy >= 0.3) return "rgba(249, 115, 22, 0.55)";
  return "rgba(220, 38, 38, 0.75)";
}
