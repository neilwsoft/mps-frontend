"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchStudents, type StudentSummary } from "@/lib/api";

export default function StudentsListPage() {
  return (
    <AppShell requireRole="admin">
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents()
      .then(setStudents)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title="Class roster."
        description="Every registered student. Click a row to see their attempts and scores."
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load students</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="overflow-hidden rounded-lg border border-rule bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule bg-mark-soft/30">
              <Th>Student</Th>
              <Th>Email</Th>
              <Th className="text-right">Attempts</Th>
              <Th className="text-right">Lines</Th>
              <Th className="text-right">Accuracy</Th>
              <Th className="text-right">Joined</Th>
            </tr>
          </thead>
          <tbody>
            {students === null ? (
              <tr>
                <td colSpan={6} className="p-4">
                  <Skeleton className="h-12 w-full" />
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground italic">
                  No students yet.
                </td>
              </tr>
            ) : (
              students.map((s) => {
                const acc =
                  s.total_lines === 0 ? null : s.total_score / s.total_lines;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-rule last:border-0 transition-colors hover:bg-mark-soft/30"
                  >
                    <Td>
                      <Link
                        href={`/admin/students/${s.id}`}
                        className="font-display text-base hover:text-mark"
                      >
                        {s.name}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs text-muted-foreground">
                      {s.email}
                    </Td>
                    <Td className="text-right tabular-nums">{s.submission_count}</Td>
                    <Td className="text-right tabular-nums text-muted-foreground">
                      {s.total_score} / {s.total_lines}
                    </Td>
                    <Td>
                      <AccuracyBar pct={acc} />
                    </Td>
                    <Td className="text-right font-mono text-xs text-muted-foreground">
                      {new Date(s.created_at + "Z").toLocaleDateString()}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function AccuracyBar({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <span className="block text-right font-mono text-xs text-muted-foreground">—</span>
    );
  const val = Math.max(0, Math.min(1, pct));
  const color =
    val >= 0.85 ? "bg-correct" : val >= 0.5 ? "bg-gold" : "bg-mark";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-rule/40">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${color} transition-[width] duration-500`}
          style={{ width: `${val * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground w-10 text-right">
        {Math.round(val * 100)}%
      </span>
    </div>
  );
}
