"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Pencil,
  PencilLine,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MathExpr } from "@/components/math";
import { MathField } from "@/components/math-field";
import { ProgressRail } from "@/components/progress-rail";
import { DrawCanvas, type DrawCanvasHandle } from "@/components/draw-canvas";
import { cn } from "@/lib/utils";
import {
  explainLine,
  extractHandwriting,
  fetchExam,
  finalizeSubmission,
  getScratchpad,
  requestHint,
  saveScratchpad,
  startSubmission,
  submitLine,
  type Exam,
  type ExtractedLine,
  type StudentQuestion,
  type SubmitLineResponse,
} from "@/lib/api";

type LineRecord = {
  /** DB id of this submission attempt — used to update its explanation
   * asynchronously once Gemini returns the richer tutor message. */
  id: number;
  latex: string;
  correct: boolean;
  explanation: string | null;
  partialScore: number;
  /** The line index this attempt was submitted against. Multiple attempts can
   * share the same lineIndex (retries). */
  lineIndex: number;
};

type QuestionState = {
  lines: LineRecord[];
  draft: string;
  status: "idle" | "submitting" | "done";
  hint: string | null;
  hintLoading: boolean;
  scratchpad: string;
  /** Highest line_index that has been correctly accepted (-1 = none yet). The
   * student's *next* required input is acceptedThrough + 1. Wrong attempts
   * append to lines[] but DO NOT advance this counter. */
  acceptedThrough: number;
};

type Handwriting = {
  status: "idle" | "extracting" | "extracted" | "verifying" | "error";
  previewUrl: string | null;
  fileName: string | null;
  lines: ExtractedLine[];
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
  const t = useTranslations("exam");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeQ, setActiveQ] = useState(0);
  const [perQ, setPerQ] = useState<Record<number, QuestionState>>({});
  const [hwByQ, setHwByQ] = useState<Record<number, Handwriting>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  // Per-question, per-line "started thinking" timestamp for time_spent_ms.
  const lineStartRef = useRef<Record<number, Record<number, number>>>({});
  const scratchpadSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // In-flight OCR controller — aborted when the student starts a new stroke
  // while the previous recognize is still en route.
  const ocrAbortRef = useRef<AbortController | null>(null);
  // Optimistic-feedback / latency-budget state for the current line.
  //  • phase = 'reading'  → OCR in flight, no latex yet
  //  • phase = 'checking' → OCR returned (latex visible), verifier in flight
  //  • phase = 'done'     → verifier returned (chip fades after a moment)
  const [flow, setFlow] = useState<{
    phase: "reading" | "checking" | "done";
    latex?: string;
    ocrMs?: number;
    verifyMs?: number;
    correct?: boolean;
  } | null>(null);
  const flowFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          initial[q.id] = {
            lines: [],
            draft: "",
            status: "idle",
            hint: null,
            hintLoading: false,
            scratchpad: "",
            acceptedThrough: -1,
          };
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
          setError(err instanceof Error ? err.message : t("errorLoadFallback"));
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [examId, searchParams, t]);

  // Cleanup any preview URLs on unmount.
  useEffect(() => {
    return () => {
      Object.values(hwByQ).forEach((hw) => {
        if (hw.previewUrl) URL.revokeObjectURL(hw.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load scratchpad for the active question whenever it changes.
  useEffect(() => {
    if (!exam || submissionId === null) return;
    const qs = exam.questions as StudentQuestion[];
    const q = qs[activeQ];
    if (!q) return;
    let cancelled = false;
    void (async () => {
      try {
        const content = await getScratchpad(submissionId, q.id);
        if (!cancelled)
          setPerQ((prev) => ({
            ...prev,
            [q.id]: {
              ...(prev[q.id] ?? {
                lines: [],
                draft: "",
                status: "idle",
                hint: null,
                hintLoading: false,
                scratchpad: "",
              }),
              scratchpad: content,
            },
          }));
      } catch {
        /* scratchpad load is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exam, submissionId, activeQ]);

  if (error)
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>{t("errorStartTitle")}</AlertTitle>
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
  const state =
    perQ[currentQ.id] ?? {
      lines: [],
      draft: "",
      status: "idle" as const,
      hint: null,
      hintLoading: false,
      scratchpad: "",
      acceptedThrough: -1,
    };
  const hw = hwByQ[currentQ.id] ?? INITIAL_HW;
  const lineIdx = state.acceptedThrough + 1; // next line student must write
  const expectedLines = currentQ.expected_line_count;
  // Most recent attempt at the current line — used to surface the "try again"
  // explanation when the student is on a retry.
  const lastAttemptOnCurrent = [...state.lines]
    .reverse()
    .find((l) => l.lineIndex === lineIdx);

  // Stamp the start time for this (question, line) once.
  if (lineIdx < expectedLines) {
    const perQId = lineStartRef.current[currentQ.id] ?? {};
    if (perQId[lineIdx] === undefined) {
      perQId[lineIdx] = Date.now();
      lineStartRef.current[currentQ.id] = perQId;
    }
  }
  const allQuestionsDone = questions.every(
    (q) => (perQ[q.id]?.acceptedThrough ?? -1) + 1 >= q.expected_line_count,
  );

  // ---- handlers ----

  function setQ(qid: number, updater: (s: QuestionState) => QuestionState) {
    setPerQ((prev) => ({
      ...prev,
      [qid]: updater(
        prev[qid] ?? {
          lines: [],
          draft: "",
          status: "idle",
          hint: null,
          hintLoading: false,
          scratchpad: "",
          acceptedThrough: -1,
        },
      ),
    }));
  }

  function setHw(qid: number, updater: (h: Handwriting) => Handwriting) {
    setHwByQ((prev) => ({
      ...prev,
      [qid]: updater(prev[qid] ?? INITIAL_HW),
    }));
  }

  async function submitOne(
    latex: string,
    opts: { source: "typed" | "handwriting"; ocrConfidence?: number },
  ): Promise<boolean> {
    if (!latex.trim() || lineIdx >= expectedLines) return false;
    setQ(currentQ.id, (s) => ({ ...s, status: "submitting" }));
    // For typed submissions we don't have a prior OCR phase, so set the
    // optimistic chip to 'checking' directly. For handwriting,
    // handleHandwritingFile already moved us into 'checking' with ocrMs filled.
    if (opts.source === "typed") {
      setFlow({ phase: "checking", latex });
    } else {
      setFlow((f) => (f ? { ...f, phase: "checking", latex } : { phase: "checking", latex }));
    }
    const verifyStartedAt = Date.now();
    const start = lineStartRef.current[currentQ.id]?.[lineIdx] ?? Date.now();
    try {
      const res = await submitLine(
        submissionId!,
        currentQ.id,
        lineIdx,
        latex,
        {
          timeSpentMs: Date.now() - start,
          source: opts.source,
          ocrConfidence: opts.ocrConfidence,
          locale,
        },
      );
      const verifyMs = Date.now() - verifyStartedAt;
      setFlow((f) => ({
        phase: "done",
        latex,
        ocrMs: f?.ocrMs,
        verifyMs,
        correct: res.correct,
      }));
      // Fade the latency chip after a moment so it doesn't linger forever.
      if (flowFadeTimer.current) clearTimeout(flowFadeTimer.current);
      flowFadeTimer.current = setTimeout(() => setFlow(null), 2500);
      const record: LineRecord = {
        id: res.line_id,
        latex,
        correct: res.correct,
        explanation: res.explanation,
        partialScore: res.partial_score,
        lineIndex: lineIdx,
      };

      // Wrong verdict → fire the tutor-style Gemini explanation in the
      // background. The verdict + deterministic baseline are already on
      // screen; this just swaps in a richer message when (and if) Gemini
      // returns. Failure is silently ignored.
      if (!res.correct) {
        void (async () => {
          try {
            const detail = await explainLine(res.line_id, locale);
            if (!detail.explanation) return;
            setQ(currentQ.id, (s) => ({
              ...s,
              lines: s.lines.map((l) =>
                l.id === res.line_id ? { ...l, explanation: detail.explanation } : l,
              ),
            }));
          } catch {
            /* keep baseline explanation */
          }
        })();
      }
      setQ(currentQ.id, (s) => {
        // Correct → advance acceptedThrough and reset clock for next line.
        // Wrong → keep position; clear draft so canvas is ready for retry.
        const accept = res.correct;
        const nextAccepted = accept ? lineIdx : s.acceptedThrough;
        const willBeDone = accept && lineIdx + 1 >= expectedLines;
        if (accept) {
          // Reset timing for the next line slot
          const slot = lineStartRef.current[currentQ.id] ?? {};
          slot[lineIdx + 1] = Date.now();
          lineStartRef.current[currentQ.id] = slot;
        }
        return {
          ...s,
          lines: [...s.lines, record],
          draft: "",
          hint: null,
          acceptedThrough: nextAccepted,
          status: willBeDone ? "done" : "idle",
        };
      });
      return res.correct;
    } catch (err) {
      setQ(currentQ.id, (s) => ({ ...s, status: "idle" }));
      setError(err instanceof Error ? err.message : t("errorSubmitFallback"));
      return false;
    }
  }

  async function handleSubmitLine() {
    if (state.status === "submitting") return;
    await submitOne(state.draft, { source: "typed" });
  }

  async function handleRequestHint() {
    if (state.hintLoading || state.hint) return;
    setQ(currentQ.id, (s) => ({ ...s, hintLoading: true }));
    try {
      const res = await requestHint(submissionId!, currentQ.id, lineIdx, locale);
      setQ(currentQ.id, (s) => ({ ...s, hint: res.hint, hintLoading: false }));
    } catch (err) {
      setQ(currentQ.id, (s) => ({ ...s, hintLoading: false }));
      setError(err instanceof Error ? err.message : t("hint.errorFallback"));
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
    // Show the "reading…" chip immediately so the student has visual proof
    // the system noticed their handwriting.
    setFlow({ phase: "reading" });
    // Stamp OCR start and wire up an abort handle so a new stroke can cancel.
    const ocrStartedAt = Date.now();
    const controller = new AbortController();
    ocrAbortRef.current?.abort();
    ocrAbortRef.current = controller;
    try {
      const res = await extractHandwriting(currentQ.id, file, {
        signal: controller.signal,
      });
      const ocrMs = Date.now() - ocrStartedAt;
      if (res.lines.length === 0) {
        // Empty result == illegible handwriting. Use a clear localized
        // message; the backend used to blame "the photo" even for canvas
        // drawings — that string is gone now.
        setHw(currentQ.id, (h) => ({
          ...h,
          status: "error",
          error: t("handwriting.errorIllegible"),
        }));
        setFlow(null);
        return;
      }
      // Capture OCR'd latex + duration so the "checking" chip can render it.
      setFlow({ phase: "checking", latex: res.lines[0].latex, ocrMs });
      setHw(currentQ.id, () => INITIAL_HW);
      for (const entry of res.lines) {
        const ok = await submitOne(entry.latex, {
          source: "handwriting",
          ocrConfidence: entry.confidence,
        });
        if (!ok) break; // stop at first wrong line so the student can retry
      }
    } catch (err) {
      // Abort: student started writing again; bail quietly.
      if (err instanceof DOMException && err.name === "AbortError") {
        setHw(currentQ.id, () => INITIAL_HW);
        setFlow(null);
        return;
      }
      setHw(currentQ.id, (h) => ({
        ...h,
        status: "error",
        error: err instanceof Error ? err.message : t("handwriting.errorReadFallback"),
      }));
      setFlow(null);
    } finally {
      if (ocrAbortRef.current === controller) ocrAbortRef.current = null;
    }
  }

  async function handleSubmitHandwriting() {
    // Manual fallback path — only reachable if the auto-submit flow surfaced
    // a manual review card (e.g. legacy upload). Submit each line, stop on
    // first wrong.
    if (hw.lines.length === 0) return;
    setHw(currentQ.id, (h) => ({ ...h, status: "verifying", error: null }));
    for (const entry of hw.lines) {
      const ok = await submitOne(entry.latex, {
        source: "handwriting",
        ocrConfidence: entry.confidence,
      });
      if (!ok) break;
    }
    setHw(currentQ.id, () => INITIAL_HW);
  }

  function updateExtractedLine(i: number, value: string) {
    setHw(currentQ.id, (h) => {
      const next = [...h.lines];
      // Editing the OCR draft means the user took over — bump confidence to 1.0
      // so the backend can see this was effectively a typed line.
      next[i] = { latex: value, confidence: 1.0 };
      return { ...h, lines: next };
    });
  }

  function handleScratchpadChange(value: string) {
    setQ(currentQ.id, (s) => ({ ...s, scratchpad: value }));
    if (scratchpadSaveTimer.current) clearTimeout(scratchpadSaveTimer.current);
    scratchpadSaveTimer.current = setTimeout(() => {
      void saveScratchpad(submissionId!, currentQ.id, value).catch(() => {
        /* best-effort */
      });
    }, 500);
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
      setError(err instanceof Error ? err.message : t("errorFinalizeFallback"));
      setFinalizing(false);
    }
  }

  // Aggregate progress across the whole worksheet for the top progress bar.
  const totalExpectedAll = questions.reduce(
    (acc, q) => acc + q.expected_line_count,
    0,
  );
  const totalSubmittedAll = questions.reduce(
    (acc, q) => acc + ((perQ[q.id]?.acceptedThrough ?? -1) + 1),
    0,
  );
  const totalCorrectAll = totalSubmittedAll;
  const overallPct =
    totalExpectedAll === 0
      ? 0
      : Math.round((totalSubmittedAll / totalExpectedAll) * 100);

  const railStops = questions.map((q, i) => {
    const s = perQ[q.id];
    const accepted = (s?.acceptedThrough ?? -1) + 1;
    const wrong = s?.lines.filter((l) => !l.correct).length ?? 0;
    const done = accepted >= q.expected_line_count;
    return {
      label: tCommon("questionNumber", { number: i + 1 }),
      done,
      errored: wrong > 0,
      hint:
        wrong > 0
          ? t("aside.stopHintWrong", {
              submitted: accepted,
              total: q.expected_line_count,
              wrong,
            })
          : t("aside.stopHint", {
              submitted: accepted,
              total: q.expected_line_count,
            }),
    };
  });

  return (
    <>
      <PageHeader
        eyebrow={tCommon("examNumber", {
          number: examId.toString().padStart(2, "0"),
        })}
        title={exam.title}
        description={exam.description}
        action={
          <Button
            variant="default"
            disabled={!allQuestionsDone || finalizing}
            onClick={handleFinalize}
          >
            {finalizing ? t("header.submitting") : t("header.submitGrade")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      {/* Worksheet progress bar — runs across the top of every screen */}
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
          {t("header.stepsProgress", {
            submitted: totalSubmittedAll,
            total: totalExpectedAll,
          })}
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
                {t("aside.worksheet")}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
                {t("aside.questionsSummary", {
                  count: questions.length,
                  correct: totalCorrectAll,
                })}
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <p className="font-display text-base font-medium leading-tight">
                {exam.title}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-3">
                {exam.description || t("aside.defaultDescription")}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 ml-1 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              {t("aside.questions")}
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
                  {t("question.label", { number: activeQ + 1 })}
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {t("question.stepProgress", {
                    current: Math.min(lineIdx + 1, expectedLines),
                    total: expectedLines,
                  })}
                </span>
              </div>
              <div className="relative overflow-hidden rounded-md border border-rule bg-card graph-paper p-6 text-2xl">
                <MathExpr latex={currentQ.prompt_latex} display />
              </div>
            </CardContent>
          </Card>

          {/* Handwriting card — moved to top so it's the first input surface */}
          {state.status !== "done" && (
            <HandwritingCard
              hw={hw}
              onPickFile={() => fileInputRef.current?.click()}
              onDraw={handleHandwritingFile}
              onClear={clearHandwriting}
              onChangeLine={updateExtractedLine}
              onRemoveLine={removeExtractedLine}
              onSubmit={handleSubmitHandwriting}
              activeStepNumber={lineIdx + 1}
              totalSteps={expectedLines}
              lastWrong={lastAttemptOnCurrent && !lastAttemptOnCurrent.correct ? lastAttemptOnCurrent : null}
              flow={flow}
              onStartStroke={() => {
                // Student is writing again — abort any pending OCR call and
                // clear the chip so it doesn't display stale info.
                if (ocrAbortRef.current) {
                  ocrAbortRef.current.abort();
                  ocrAbortRef.current = null;
                }
                if (flowFadeTimer.current) clearTimeout(flowFadeTimer.current);
                setFlow(null);
              }}
            />
          )}

          {/* Notebook: only accepted (correct) lines are recorded here. */}
          <Card>
            <CardContent className="py-2">
              <div className="flex items-center justify-between border-b border-rule pb-2 mb-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {t("notebook.yourWork")}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
                  {state.acceptedThrough + 1}/{expectedLines}✓
                </span>
              </div>

              <div className="rounded-md border border-rule bg-card notebook-rules px-2 py-3">
                {state.acceptedThrough < 0 && state.status !== "done" && (
                  <p className="px-3 py-2 text-sm text-muted-foreground italic">
                    {t("notebook.willAppear")}
                  </p>
                )}
                <ol className="space-y-1">
                  {state.lines
                    .filter(
                      (l) => l.correct && l.lineIndex <= state.acceptedThrough,
                    )
                    // Pick the correct attempt for each line index (in case
                    // there were retries before acceptance).
                    .reduce<LineRecord[]>((acc, l) => {
                      if (!acc.some((a) => a.lineIndex === l.lineIndex)) acc.push(l);
                      return acc;
                    }, [])
                    .sort((a, b) => a.lineIndex - b.lineIndex)
                    .map((line) => (
                      <SubmittedLineRow
                        key={line.lineIndex}
                        index={line.lineIndex}
                        line={line}
                      />
                    ))}
                </ol>

                {state.status !== "done" && (
                  <div className="mt-3 rounded-md border border-rule bg-background/60 p-3 space-y-2">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                      <span
                        className={
                          "step-counter inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-primary-foreground " +
                          (lastAttemptOnCurrent && !lastAttemptOnCurrent.correct
                            ? "bg-destructive"
                            : "bg-mark")
                        }
                      >
                        {lineIdx + 1}
                      </span>
                      {lastAttemptOnCurrent && !lastAttemptOnCurrent.correct
                        ? t("notebook.tryAgain", { number: lineIdx + 1 })
                        : t("notebook.nextStep")}
                    </div>
                    <MathField
                      value={state.draft}
                      onChange={(v) =>
                        setQ(currentQ.id, (s) => ({ ...s, draft: v }))
                      }
                      placeholder="= …"
                      ariaLabel={t("notebook.stepInputAria", {
                        number: lineIdx + 1,
                      })}
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
                          ? t("notebook.checking")
                          : t("notebook.checkLine")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleRequestHint}
                        disabled={state.hintLoading || !!state.hint}
                        title={t("hint.buttonTitle")}
                      >
                        {state.hintLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Lightbulb className="h-3.5 w-3.5" />
                        )}
                        {state.hint ? t("hint.buttonShown") : t("hint.buttonIdle")}
                      </Button>
                      <details className="ml-auto text-[10px] text-muted-foreground">
                        <summary className="cursor-pointer select-none font-mono uppercase tracking-[0.18em]">
                          {t("notebook.rawLatex")}
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded border border-rule bg-background p-2 font-mono">
                          {state.draft || t("notebook.empty")}
                        </pre>
                      </details>
                    </div>
                    {lastAttemptOnCurrent &&
                      !lastAttemptOnCurrent.correct &&
                      lastAttemptOnCurrent.explanation && (
                        <Alert variant="destructive" className="mt-2">
                          <XCircle className="h-4 w-4" />
                          <AlertTitle>
                            = {lastAttemptOnCurrent.latex}
                          </AlertTitle>
                          <AlertDescription>
                            {lastAttemptOnCurrent.explanation}
                          </AlertDescription>
                        </Alert>
                      )}
                    {state.hint && (
                      <Alert className="mt-2 border-mark/40">
                        <Lightbulb className="h-4 w-4" />
                        <AlertTitle>{t("hint.alertTitle")}</AlertTitle>
                        <AlertDescription>{state.hint}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {state.status === "done" && (
                  <Alert className="mt-3">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{t("notebook.doneTitle")}</AlertTitle>
                    <AlertDescription>
                      {t("notebook.doneAll", { count: expectedLines })}{" "}
                      {activeQ < questions.length - 1 ? (
                        <button
                          className="text-mark underline-offset-4 hover:underline"
                          onClick={() => setActiveQ(activeQ + 1)}
                        >
                          {t("notebook.continueNext", { number: activeQ + 2 })}
                        </button>
                      ) : (
                        t("notebook.donePrompt")
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

          <Card>
            <CardContent className="py-2">
              <div className="mb-2 flex items-center justify-between border-b border-rule pb-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {t("scratchpad.title")}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
                  {t("scratchpad.subtitle")}
                </span>
              </div>
              <textarea
                className="min-h-[7rem] w-full resize-y rounded border border-rule bg-background px-3 py-2 font-mono text-sm"
                placeholder={t("scratchpad.placeholder")}
                value={state.scratchpad}
                onChange={(e) => handleScratchpadChange(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function SubmittedLineRow({ index, line }: { index: number; line: LineRecord }) {
  const t = useTranslations("exam");
  const partialPct = Math.round(line.partialScore * 100);
  const isPartial = !line.correct && partialPct > 0;
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
        {isPartial && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-mark">
            {t("partialCredit", { pct: partialPct })}
          </p>
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

type FlowState = {
  phase: "reading" | "checking" | "done";
  latex?: string;
  ocrMs?: number;
  verifyMs?: number;
  correct?: boolean;
};

function HandwritingCard({
  hw,
  onPickFile,
  onDraw,
  onClear,
  onChangeLine,
  onRemoveLine,
  onSubmit,
  activeStepNumber,
  totalSteps,
  lastWrong,
  flow,
  onStartStroke,
}: {
  hw: Handwriting;
  onPickFile: () => void;
  onDraw: (file: File) => void;
  onClear: () => void;
  onChangeLine: (i: number, v: string) => void;
  onRemoveLine: (i: number) => void;
  onSubmit: () => void;
  activeStepNumber: number;
  totalSteps: number;
  lastWrong: LineRecord | null;
  flow: FlowState | null;
  onStartStroke: () => void;
}) {
  const [tab, setTab] = useState<"draw" | "upload">("draw");
  const busy = hw.status === "extracting" || hw.status === "verifying";
  const t = useTranslations("exam.handwriting");
  const tNotebook = useTranslations("exam.notebook");
  const drawRef = useRef<DrawCanvasHandle>(null);

  // Clear the canvas automatically whenever the active step changes (a line
  // was accepted) or when a retry-cycle begins so the surface is ready for
  // the next attempt without a click.
  useEffect(() => {
    drawRef.current?.clear();
  }, [activeStepNumber, lastWrong?.lineIndex, lastWrong?.latex]);

  return (
    <Card>
      <CardContent className="py-2 space-y-3">
        <div className="flex items-center justify-between border-b border-rule pb-2">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
            <PencilLine className="h-3 w-3" />
            {t("title")}
            <span className="text-muted-foreground">
              · {tNotebook("stepInputAria", { number: activeStepNumber })} /{" "}
              {totalSteps}
            </span>
          </div>
          <div className="inline-flex rounded-md border border-rule bg-background p-0.5">
            <TabBtn active={tab === "draw"} onClick={() => setTab("draw")} icon={<Pencil className="h-3 w-3" />}>
              {t("tabDraw")}
            </TabBtn>
            <TabBtn active={tab === "upload"} onClick={() => setTab("upload")} icon={<Upload className="h-3 w-3" />}>
              {t("tabUpload")}
            </TabBtn>
          </div>
        </div>

        {lastWrong && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>
              {tNotebook("tryAgain", { number: activeStepNumber })}
            </AlertTitle>
            {lastWrong.explanation && (
              <AlertDescription>{lastWrong.explanation}</AlertDescription>
            )}
          </Alert>
        )}

        {tab === "draw" ? (
          <DrawCanvas
            ref={drawRef}
            onRecognize={onDraw}
            busy={busy}
            disabled={hw.lines.length > 0}
            autoRecognize
            onStartStroke={onStartStroke}
          />
        ) : (
          <UploadDropZone onPick={onPickFile} disabled={busy} />
        )}

        {flow && <FlowChip flow={flow} />}

        {hw.previewUrl && tab === "upload" && (
          <div className="overflow-hidden rounded border border-rule bg-background/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hw.previewUrl}
              alt={t("title")}
              className="max-h-48 w-full object-contain"
            />
          </div>
        )}

        {hw.status === "extracting" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("reading")}
          </p>
        )}

        {hw.error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>{t("errorTitle")}</AlertTitle>
            <AlertDescription>{hw.error}</AlertDescription>
          </Alert>
        )}

        {hw.lines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              <span>{t("detectedHeader")}</span>
              <span className="text-[9px] tracking-[0.18em]">
                {t("editLowConfidence")}
              </span>
            </div>
            <ol className="space-y-2">
              {hw.lines.map((entry, i) => (
                <li key={i} className="rounded border border-rule bg-background/40 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    <span>{t("lineLabel", { number: i + 1 })}</span>
                    <span className="flex items-center gap-2">
                      <ConfidenceChip value={entry.confidence} />
                      <button
                        className="text-mark hover:underline"
                        onClick={() => onRemoveLine(i)}
                        disabled={hw.status === "verifying"}
                      >
                        {t("remove")}
                      </button>
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded bg-background p-2 text-base">
                    <MathExpr latex={entry.latex || "\\;"} display />
                  </div>
                  <input
                    className="w-full rounded border border-rule bg-background px-2 py-1 font-mono text-xs"
                    value={entry.latex}
                    onChange={(e) => onChangeLine(i, e.target.value)}
                    disabled={hw.status === "verifying"}
                  />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onSubmit} disabled={hw.status === "verifying"}>
                {hw.status === "verifying" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {hw.status === "verifying" ? t("submittingDetected") : t("submitDetected")}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClear} disabled={hw.status === "verifying"}>
                {t("discard")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlowChip({ flow }: { flow: FlowState }) {
  const t = useTranslations("exam.flow");
  // Live timer so the student can SEE the latency budget tick.
  const [now, setNow] = useState(() => Date.now());
  const tickStartRef = useRef<number>(Date.now());
  useEffect(() => {
    tickStartRef.current = Date.now();
    if (flow.phase === "done") return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [flow.phase, flow.latex]);

  const reading =
    flow.ocrMs ?? (flow.phase === "reading" ? now - tickStartRef.current : 0);
  const checking =
    flow.verifyMs ?? (flow.phase === "checking" ? now - tickStartRef.current : 0);

  const statusIcon =
    flow.phase === "done"
      ? flow.correct
        ? <CheckCircle2 className="h-3.5 w-3.5 text-correct" />
        : <XCircle className="h-3.5 w-3.5 text-mark" />
      : <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-rule bg-card/60 px-3 py-1.5">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {statusIcon}
        {flow.phase === "reading"
          ? t("reading")
          : flow.phase === "checking"
            ? t("checking")
            : flow.correct
              ? t("correct")
              : t("wrong")}
      </span>
      {flow.latex && (
        <span className="max-w-[18rem] truncate font-mono text-xs text-foreground">
          = {flow.latex}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
        <span>
          {t("read")} {(reading / 1000).toFixed(1)}s
        </span>
        <span>
          {t("check")} {(checking / 1000).toFixed(1)}s
        </span>
      </span>
    </div>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  let cls = "bg-correct/20 text-correct border-correct/40";
  if (value < 0.7) cls = "bg-mark-soft/40 text-mark border-mark/40";
  if (value < 0.4) cls = "bg-mark text-primary-foreground border-mark";
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] tabular-nums",
        cls,
      )}
    >
      {pct}%
    </span>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
        active
          ? "bg-mark text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function UploadDropZone({ onPick, disabled }: { onPick: () => void; disabled: boolean }) {
  const t = useTranslations("exam.handwriting");
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-rule bg-background/40 px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-background/70 disabled:opacity-50"
    >
      <Upload className="h-4 w-4" />
      <span className="font-mono text-[10px] uppercase tracking-[0.24em]">
        {t("uploadPrompt")}
      </span>
      <span className="text-xs">{t("uploadFormats")}</span>
    </button>
  );
}
