"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppShell, PageHeader, SectionRule } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  fetchTopicMastery,
  type TopicMasteryRow,
} from "@/lib/api";

export default function AnalyticsPage() {
  return (
    <AppShell requireRole="admin">
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const t = useTranslations("admin.analytics");
  const [rows, setRows] = useState<TopicMasteryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTopicMastery()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  const { topics, students, accuracyByCell } = useMemo(() => {
    const t = new Set<string>();
    const s = new Map<number, string>();
    const acc = new Map<string, number>(); // key = `${studentId}::${topic}`
    for (const r of rows ?? []) {
      t.add(r.topic);
      s.set(r.student_id, r.student_name);
      acc.set(`${r.student_id}::${r.topic}`, r.accuracy);
    }
    return {
      topics: [...t].sort(),
      students: [...s.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      accuracyByCell: acc,
    };
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={
          <Link
            href="/admin"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("back")}
          </Link>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SectionRule label={t("heatmapTitle")} />

      {rows === null ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-background px-3 py-2 text-left">
                  {t("thStudent")}
                </th>
                {topics.map((tp) => (
                  <th key={tp} className="px-2 py-2 text-center">
                    {tp}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map(([sid, name]) => (
                <tr key={sid} className="border-t border-rule">
                  <td className="sticky left-0 bg-background px-3 py-2 font-display">
                    {name}
                  </td>
                  {topics.map((tp) => {
                    const acc = accuracyByCell.get(`${sid}::${tp}`);
                    if (acc === undefined) {
                      return (
                        <td
                          key={tp}
                          className="px-2 py-2 text-center text-muted-foreground"
                        >
                          —
                        </td>
                      );
                    }
                    const pct = Math.round(acc * 100);
                    return (
                      <td key={tp} className="px-2 py-2 text-center">
                        <span
                          className="inline-block min-w-[2.75rem] rounded px-2 py-1 font-mono text-[11px] tabular-nums"
                          style={{
                            background: heatmapColor(acc),
                            color: acc < 0.4 ? "#fff" : "inherit",
                          }}
                        >
                          {pct}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function heatmapColor(accuracy: number): string {
  // 0.0 → red, 0.5 → amber, 1.0 → green. Soft pastel for legibility on light
  // and dark themes alike (alpha blends into the page background).
  if (accuracy >= 0.85) return "rgba(34, 197, 94, 0.35)";
  if (accuracy >= 0.7) return "rgba(132, 204, 22, 0.35)";
  if (accuracy >= 0.5) return "rgba(234, 179, 8, 0.35)";
  if (accuracy >= 0.3) return "rgba(249, 115, 22, 0.35)";
  return "rgba(220, 38, 38, 0.65)";
}
