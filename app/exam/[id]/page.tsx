"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  PencilLine,
  Send,
  Upload,
  XCircle,
} from "lucide-react";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MathExpr } from "@/components/math";
import { MathField } from "@/components/math-field";
import { ProgressRail } from "@/components/progress-rail";
import {
  extractHandwriting,
  fetchExam,
  finalizeSubmission,
  startSubmission,
  submitLine,
  type Exam,
  type StudentQuestion,
  type SubmitLineResponse,
} from "@/lib/api";

type LineRecord = {
  latex: string;
  correct: boolean;
  explanation: string | null;
};

type QuestionState = {
  lines: LineRecord[];
  draft: string;
  status: "idle" | "submitting" | "done";
};

type Handwriting = {
  status: "idle" | "extracting" | "extracted" | "verifying" | "error";
  previewUrl: string | null;
  fileName: string | null;
  lines: string[];
  error: string | null;
};

const INITIAL_HW: Handwriting = {
  status: "idle",
  previewUrl: null,
  fileName: null,
  lines: [],
  error: null,
};

export default function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AppShell requireRole="student">
      <ExamRunner examId={Number(id)} />
    </AppShell>
  );
}

function ExamRunner({ examId }: { examId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeQ, setActiveQ] = useState(0);
  const [perQ, setPerQ] = useState<Record<number, QuestionState>>({});
  const [hwByQ, setHwByQ] = useState<Record<number, Handwriting>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // Bootstrap: load exam, ensure submission. Accept ?submission=N from
  // the dashboard's "begin attempt" so a refresh on this page doesn't
  // create a second submission.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const e = await fetchExam(examId);
        if (cancelled) return;
        setExam(e);
        const initial: Record<number, QuestionState> = {};
        for (const q of e.questions) {
          initial[q.id] = { lines: [], draft: "", status: "idle" };
        }
        setPerQ(initial);

        const sid = searchParams.get("submission");
        if (sid) {
          setSubmissionId(Number(sid));
        } else {
          const start = await startSubmission(examId);
          if (cancelled) return;
          setSubmissionId(start.submission_id);
          // Replace URL so a reload reuses the same submission.
          const url = new URL(window.location.href);
          url.searchParams.set("submission", String(start.submission_id));
          window.history.replaceState({}, "", url.toString());
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load exam");
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [examId, searchParams]);

  // Cleanup any preview URLs on unmount.
  useEffect(() => {
    return () => {
      Object.values(hwByQ).forEach((hw) => {
        if (hw.previewUrl) URL.revokeObjectURL(hw.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error)
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Could not start exam</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  if (!exam || submissionId === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const questions = exam.questions as StudentQuestion[];
  const currentQ = questions[activeQ];
  const state = perQ[currentQ.id] ?? { lines: [], draft: "", status: "idle" };
  const hw = hwByQ[currentQ.id] ?? INITIAL_HW;
  const lineIdx = state.lines.length;
  const expectedLines = currentQ.expected_line_count;
  const allQuestionsDone = questions.every(
    (q) => (perQ[q.id]?.lines.length ?? 0) >= q.expected_line_count,
  );

  // ---- handlers ----

  function setQ(qid: number, updater: (s: QuestionState) => QuestionState) {
    setPerQ((prev) => ({
      ...prev,
      [qid]: updater(prev[qid] ?? { lines: [], draft: "", status: "idle" }),
    }));
  }

  function setHw(qid: number, updater: (h: Handwriting) => Handwriting) {
    setHwByQ((prev) => ({
      ...prev,
      [qid]: updater(prev[qid] ?? INITIAL_HW),
    }));
  }

  async function handleSubmitLine() {
    if (!state.draft.trim() || state.status === "submitting") return;
    if (lineIdx >= expectedLines) return;
    setQ(currentQ.id, (s) => ({ ...s, status: "submitting" }));
    try {
      const res = await submitLine(submissionId!, currentQ.id, lineIdx, state.draft);
      const record: LineRecord = {
        latex: state.draft,
        correct: res.correct,
        explanation: res.explanation,
      };
      setQ(currentQ.id, (s) => ({
        lines: [...s.lines, record],
        draft: "",
        status: lineIdx + 1 >= expectedLines ? "done" : "idle",
      }));
    } catch (err) {
      setQ(currentQ.id, (s) => ({ ...s, status: "idle" }));
      setError(err instanceof Error ? err.message : "Could not submit line");
    }
  }

  async function handleHandwritingFile(file: File) {
    if (hw.previewUrl) URL.revokeObjectURL(hw.previewUrl);
    setHw(currentQ.id, () => ({
      status: "extracting",
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
      lines: [],
      error: null,
    }));
    try {
      const res = await extractHandwriting(currentQ.id, file);
      setHw(currentQ.id, (h) => ({ ...h, status: "extracted", lines: res.lines }));
    } catch (err) {
      setHw(currentQ.id, (h) => ({
        ...h,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to read image",
      }));
    }
  }

  async function handleSubmitHandwriting() {
    if (hw.lines.length === 0) return;
    setHw(currentQ.id, (h) => ({ ...h, status: "verifying", error: null }));
    let lineIndex = lineIdx;
    const remaining = hw.lines.slice(0, expectedLines - lineIdx);
    for (const latex of remaining) {
      try {
        const res: SubmitLineResponse = await submitLine(
          submissionId!,
          currentQ.id,
          lineIndex,
          latex,
        );
        const record: LineRecord = {
          latex,
          correct: res.correct,
          explanation: res.explanation,
        };
        // Capture in a local copy so we don't depend on stale state.
        setQ(currentQ.id, (s) => ({
          ...s,
          lines: [...s.lines, record],
          status: "idle",
        }));
        lineIndex += 1;
      } catch (err) {
        setHw(currentQ.id, (h) => ({
          ...h,
          status: "extracted",
          error: err instanceof Error ? err.message : "Verify failed",
        }));
        return;
      }
    }
    setHw(currentQ.id, () => INITIAL_HW);
    setQ(currentQ.id, (s) => ({
      ...s,
      status: lineIndex >= expectedLines ? "done" : "idle",
    }));
  }

  function updateExtractedLine(i: number, value: string) {
    setHw(currentQ.id, (h) => {
      const next = [...h.lines];
      next[i] = value;
      return { ...h, lines: next };
    });
  }

  function removeExtractedLine(i: number) {
    setHw(currentQ.id, (h) => ({ ...h, lines: h.lines.filter((_, idx) => idx !== i) }));
  }

  function clearHandwriting() {
    setHw(currentQ.id, (h) => {
      if (h.previewUrl) URL.revokeObjectURL(h.previewUrl);
      return INITIAL_HW;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFinalize() {
    setFinalizing(true);
    try {
      await finalizeSubmission(submissionId!);
      router.replace(`/results/${submissionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize");
      setFinalizing(false);
    }
  }

  // Aggregate progress across the whole worksheet for the top progress bar.
  const totalExpectedAll = questions.reduce(
    (acc, q) => acc + q.expected_line_count,
    0,
  );
  const totalSubmittedAll = questions.reduce(
    (acc, q) => acc + (perQ[q.id]?.lines.length ?? 0),
    0,
  );
  const totalCorrectAll = questions.reduce(
    (acc, q) =>
      acc + (perQ[q.id]?.lines.filter((l) => l.correct).length ?? 0),
    0,
  );
  const overallPct =
    totalExpectedAll === 0
      ? 0
      : Math.round((totalSubmittedAll / totalExpectedAll) * 100);

  const railStops = questions.map((q, i) => {
    const s = perQ[q.id];
    const submitted = s?.lines.length ?? 0;
    const wrong = s?.lines.filter((l) => !l.correct).length ?? 0;
    const done = submitted >= q.expected_line_count;
    return {
      label: `Question ${i + 1}`,
      done,
      errored: wrong > 0,
      hint: `${submitted}/${q.expected_line_count} steps${wrong ? ` · ${wrong} off` : ""}`,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow={`Exam ${examId.toString().padStart(2, "0")}`}
        title={exam.title}
        description={exam.description}
        action={
          <Button
            variant="default"
            disabled={!allQuestionsDone || finalizing}
            onClick={handleFinalize}
          >
            {finalizing ? "Submitting…" : "Submit & grade"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      {/* Worksheet progress bar — runs across the top of every screen */}
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
          {totalSubmittedAll} / {totalExpectedAll} steps
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-rule/40">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-mark transition-[width] duration-500"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-mark tabular-nums">
          {overallPct}%
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Left: sticky problem brief + progress rail */}
        <aside className="space-y-6 lg:sticky lg:top-24 self-start">
          <div className="rounded-xl border border-rule bg-card p-4">
            <div className="flex items-baseline justify-between border-b border-rule pb-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                Worksheet
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
                {questions.length} Q · {totalCorrectAll}✓
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <p className="font-display text-base font-medium leading-tight">
                {exam.title}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-3">
                {exam.description || "Solve each problem step-by-step. Each line is checked."}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 ml-1 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Questions
            </div>
            <ProgressRail
              stops={railStops}
              activeIndex={activeQ}
              onSelect={setActiveQ}
            />
          </div>
        </aside>

        {/* Right: problem statement + notebook work surface */}
        <div className="space-y-6 min-w-0">
          {/* Problem brief */}
          <Card>
            <CardContent className="py-2 space-y-3">
              <div className="flex items-baseline justify-between border-b border-rule pb-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                  Question {activeQ + 1} · Simplify
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  step {Math.min(lineIdx + 1, expectedLines)} / {expectedLines}
                </span>
              </div>
              <div className="relative overflow-hidden rounded-md border border-rule bg-card graph-paper p-6 text-2xl">
                <MathExpr latex={currentQ.prompt_latex} display />
              </div>
            </CardContent>
          </Card>

          {/* Notebook work surface */}
          <Card>
            <CardContent className="py-2">
              <div className="flex items-center justify-between border-b border-rule pb-2 mb-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  Your work
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
                  {state.lines.filter((l) => l.correct).length}✓
                  {"  "}
                  {state.lines.filter((l) => !l.correct).length > 0
                    ? `· ${state.lines.filter((l) => !l.correct).length}✗`
                    : ""}
                </span>
              </div>

              <div className="rounded-md border border-rule bg-card notebook-rules px-2 py-3">
                {state.lines.length === 0 && state.status !== "done" && (
                  <p className="px-3 py-2 text-sm text-muted-foreground italic">
                    Your worked solution will appear here, line by line.
                  </p>
                )}
                <ol className="space-y-1">
                  {state.lines.map((line, i) => (
                    <SubmittedLineRow key={i} index={i} line={line} />
                  ))}
                </ol>

                {state.status !== "done" && (
                  <div className="mt-3 rounded-md border border-rule bg-background/60 p-3 space-y-2">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                      <span className="step-counter inline-flex h-5 w-5 items-center justify-center rounded-full bg-mark text-[10px] text-primary-foreground">
                        {lineIdx + 1}
                      </span>
                      Next step
                    </div>
                    <MathField
                      value={state.draft}
                      onChange={(v) =>
                        setQ(currentQ.id, (s) => ({ ...s, draft: v }))
                      }
                      placeholder="= …"
                      ariaLabel={`Solution line ${lineIdx + 1}`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={handleSubmitLine}
                        disabled={
                          !state.draft.trim() || state.status === "submitting"
                        }
                      >
                        <Send className="h-3.5 w-3.5" />
                        {state.status === "submitting"
                          ? "Checking…"
                          : "Check this line"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload handwriting
                      </Button>
                      <details className="ml-auto text-[10px] text-muted-foreground">
                        <summary className="cursor-pointer select-none font-mono uppercase tracking-[0.18em]">
                          raw LaTeX
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded border border-rule bg-background p-2 font-mono">
                          {state.draft || "(empty)"}
                        </pre>
                      </details>
                    </div>
                  </div>
                )}

                {state.status === "done" && (
                  <Alert className="mt-3">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Question logged</AlertTitle>
                    <AlertDescription>
                      All {expectedLines} steps submitted.{" "}
                      {activeQ < questions.length - 1 ? (
                        <button
                          className="text-mark underline-offset-4 hover:underline"
                          onClick={() => setActiveQ(activeQ + 1)}
                        >
                          Continue to question {activeQ + 2} →
                        </button>
                      ) : (
                        "Submit & grade when you’re ready."
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleHandwritingFile(file);
                }}
              />
            </CardContent>
          </Card>

          <HandwritingPanel
            hw={hw}
            onClear={clearHandwriting}
            onChangeLine={updateExtractedLine}
            onRemoveLine={removeExtractedLine}
            onSubmit={handleSubmitHandwriting}
          />
        </div>
      </div>
    </>
  );
}

function SubmittedLineRow({ index, line }: { index: number; line: LineRecord }) {
  return (
    <li
      className={`anim-write group/line flex items-start gap-3 px-2 py-1.5 ${
        line.correct ? "" : "bg-mark-soft/30"
      }`}
    >
      <span
        className={`step-counter mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
          line.correct
            ? "bg-correct text-paper"
            : "bg-mark text-primary-foreground"
        }`}
      >
        {index + 1}
      </span>
      <div className="flex-1 overflow-x-auto pt-0.5">
        <MathExpr latex={`= ${line.latex}`} display />
        {!line.correct && line.explanation && (
          <p className="mt-1 text-sm text-mark italic">{line.explanation}</p>
        )}
      </div>
      {line.correct ? (
        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-correct" />
      ) : (
        <XCircle className="mt-1 h-4 w-4 shrink-0 text-mark" />
      )}
    </li>
  );
}

function HandwritingPanel({
  hw,
  onClear,
  onChangeLine,
  onRemoveLine,
  onSubmit,
}: {
  hw: Handwriting;
  onClear: () => void;
  onChangeLine: (i: number, v: string) => void;
  onRemoveLine: (i: number) => void;
  onSubmit: () => void;
}) {
  if (hw.status === "idle" && hw.lines.length === 0 && !hw.previewUrl) return null;

  return (
    <div className="rounded-md border border-rule bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
        <PencilLine className="h-3 w-3" />
        Detected from your photo
      </div>
      {hw.previewUrl && (
        <div className="overflow-hidden rounded border border-rule bg-background/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hw.previewUrl}
            alt="Uploaded handwriting"
            className="max-h-48 w-full object-contain"
          />
        </div>
      )}
      {hw.status === "extracting" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading lines…
        </p>
      )}
      {hw.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Upload issue</AlertTitle>
          <AlertDescription>{hw.error}</AlertDescription>
        </Alert>
      )}
      {hw.lines.length > 0 && (
        <ol className="space-y-2">
          {hw.lines.map((latex, i) => (
            <li key={i} className="rounded border border-rule bg-background/40 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                <span>Line {i + 1}</span>
                <button
                  className="text-mark hover:underline"
                  onClick={() => onRemoveLine(i)}
                  disabled={hw.status === "verifying"}
                >
                  Remove
                </button>
              </div>
              <div className="overflow-x-auto rounded bg-background p-2 text-base">
                <MathExpr latex={latex || "\\;"} display />
              </div>
              <input
                className="w-full rounded border border-rule bg-background px-2 py-1 font-mono text-xs"
                value={latex}
                onChange={(e) => onChangeLine(i, e.target.value)}
                disabled={hw.status === "verifying"}
              />
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {hw.lines.length > 0 && (
          <Button size="sm" onClick={onSubmit} disabled={hw.status === "verifying"}>
            {hw.status === "verifying" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {hw.status === "verifying" ? "Submitting…" : "Submit detected lines"}
          </Button>
        )}
        {hw.previewUrl && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear photo
          </Button>
        )}
      </div>
    </div>
  );
}
