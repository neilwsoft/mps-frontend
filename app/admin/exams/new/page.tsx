"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MathExpr } from "@/components/math";
import { adminGenerateVariants, createExam } from "@/lib/api";

type DraftQuestion = {
  prompt: string;
  steps: string[];
};

const EMPTY_QUESTION = (): DraftQuestion => ({ prompt: "", steps: [""] });

export default function NewExamPage() {
  return (
    <AppShell requireRole="admin">
      <Composer />
    </AppShell>
  );
}

function Composer() {
  const router = useRouter();
  const t = useTranslations("admin.newExam");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([EMPTY_QUESTION()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<
    { prompt_latex: string; solution_latex: string[] }[]
  >([]);

  const active = questions[activeIdx];

  function patchActive(p: Partial<DraftQuestion>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === activeIdx ? { ...q, ...p } : q)),
    );
  }
  function setStep(i: number, value: string) {
    patchActive({
      steps: active.steps.map((s, idx) => (idx === i ? value : s)),
    });
  }
  function addStep() {
    patchActive({ steps: [...active.steps, ""] });
  }
  function removeStep(i: number) {
    if (active.steps.length === 1) return; // keep at least one
    patchActive({ steps: active.steps.filter((_, idx) => idx !== i) });
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= active.steps.length) return;
    const next = [...active.steps];
    [next[i], next[j]] = [next[j], next[i]];
    patchActive({ steps: next });
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, EMPTY_QUESTION()]);
    setActiveIdx(questions.length);
  }
  function removeQuestion(i: number) {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
    setActiveIdx((curr) => {
      if (i === curr) return Math.max(0, curr - 1);
      if (i < curr) return curr - 1;
      return curr;
    });
  }
  function moveQuestion(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
    if (activeIdx === i) setActiveIdx(j);
    else if (activeIdx === j) setActiveIdx(i);
  }

  async function generateVariants(delta: -1 | 0 | 1) {
    setError(null);
    const seedSteps = active.steps.map((s) => s.trim()).filter(Boolean);
    if (!active.prompt.trim() || seedSteps.length === 0) {
      setError(t("variants.needSeed"));
      return;
    }
    setGenerating(true);
    try {
      const v = await adminGenerateVariants(
        { prompt_latex: active.prompt.trim(), solution_latex: seedSteps },
        4,
        delta,
      );
      setVariants(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("variants.errorFallback"));
    } finally {
      setGenerating(false);
    }
  }

  function adoptVariant(v: { prompt_latex: string; solution_latex: string[] }) {
    setQuestions((prev) => [
      ...prev,
      { prompt: v.prompt_latex, steps: v.solution_latex.length ? v.solution_latex : [""] },
    ]);
    setActiveIdx(questions.length);
    setVariants((curr) => curr.filter((c) => c !== v));
  }

  function questionStatus(q: DraftQuestion): "ok" | "partial" | "empty" {
    const steps = q.steps.map((s) => s.trim()).filter(Boolean);
    if (!q.prompt.trim() && steps.length === 0) return "empty";
    if (q.prompt.trim() && steps.length > 0) return "ok";
    return "partial";
  }

  async function onPublish(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError(t("errorTitleRequired"));
    const cleaned = questions.map((q) => ({
      prompt_latex: q.prompt.trim(),
      solution_latex: q.steps.map((s) => s.trim()).filter(Boolean),
    }));
    for (const [i, q] of cleaned.entries()) {
      if (!q.prompt_latex)
        return setError(t("errorPromptRequired", { number: i + 1 }));
      if (q.solution_latex.length === 0)
        return setError(t("errorStepsRequired", { number: i + 1 }));
    }

    setSubmitting(true);
    try {
      const res = await createExam({
        title: title.trim(),
        description: description.trim(),
        questions: cleaned,
      });
      router.replace(`/admin/exams/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorPublishFallback"));
      setSubmitting(false);
    }
  }

  const totalSteps = questions.reduce(
    (acc, q) => acc + q.steps.filter((s) => s.trim()).length,
    0,
  );

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
            {t("cancel")}
          </Link>
        }
      />

      <Card className="mb-6">
        <CardContent className="py-2 grid gap-4 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-2">
            <Label htmlFor="title">{t("fields.title")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("fields.titlePlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("fields.descriptionLabel")}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("fields.descriptionPlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onPublish}>
        <div className="grid gap-6 lg:grid-cols-[240px_1fr_300px]">
          {/* Left: outline */}
          <aside className="space-y-3 lg:sticky lg:top-24 self-start">
            <div className="flex items-baseline justify-between border-b border-rule pb-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                {t("outline")}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
                {t("outlineSummary", {
                  questions: questions.length,
                  steps: totalSteps,
                })}
              </span>
            </div>

            <ol className="space-y-1.5">
              {questions.map((q, i) => {
                const status = questionStatus(q);
                const active = i === activeIdx;
                const tone =
                  status === "ok"
                    ? "border-correct/40"
                    : status === "partial"
                      ? "border-gold/40"
                      : "border-rule";
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      className={`group/q flex w-full items-start gap-2 rounded-md border ${tone} px-2 py-2 text-left transition-colors ${
                        active
                          ? "bg-mark-soft/50 border-mark"
                          : "bg-card hover:bg-mark-soft/30"
                      }`}
                    >
                      <span className="step-counter mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-background text-[10px] tabular-nums text-muted-foreground">
                        {(i + 1).toString().padStart(2, "0")}
                      </span>
                      <span className="flex-1 space-y-0.5 overflow-hidden">
                        <span className="block truncate font-display text-sm font-medium leading-tight">
                          {q.prompt.trim() || t("untitledQuestion")}
                        </span>
                        <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
                          {(() => {
                            const n = q.steps.filter((s) => s.trim()).length;
                            const stepsText = t(
                              n === 1 ? "stepsCount_one" : "stepsCount_other",
                              { count: n },
                            );
                            const tag =
                              status === "ok"
                                ? ` · ${t("stepStatus.ready")}`
                                : status === "partial"
                                  ? ` · ${t("stepStatus.draft")}`
                                  : ` · ${t("stepStatus.empty")}`;
                            return `${stepsText}${tag}`;
                          })()}
                        </span>
                      </span>
                      {status === "ok" && (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-correct" />
                      )}
                    </button>
                    {active && (
                      <div className="mt-1 flex items-center gap-1 px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveQuestion(i, -1)}
                          disabled={i === 0}
                          aria-label={t("moveUp")}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveQuestion(i, 1)}
                          disabled={i === questions.length - 1}
                          aria-label={t("moveDown")}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <span className="ml-auto" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeQuestion(i)}
                          disabled={questions.length === 1}
                          aria-label={t("removeQuestion")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQuestion}
              className="w-full"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addQuestion")}
            </Button>
          </aside>

          {/* Center: editor for the active question */}
          <Card className="min-w-0">
            <CardContent className="py-2 space-y-5">
              <div className="flex items-baseline justify-between border-b border-rule pb-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                  {t("previewSimplify", { number: activeIdx + 1 }).split(" · ")[0]}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("questionEdit")}
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">{t("promptLabel")}</Label>
                <Textarea
                  id="prompt"
                  rows={2}
                  className="font-mono text-sm"
                  placeholder={t("promptPlaceholder")}
                  value={active.prompt}
                  onChange={(e) => patchActive({ prompt: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("stepsLabel")}</Label>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
                    {t("stepsReady", {
                      count: active.steps.filter((s) => s.trim()).length,
                    })}
                  </span>
                </div>

                <ol className="space-y-2">
                  {active.steps.map((step, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-rule bg-card/40 p-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="step-counter mt-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mark-soft text-[10px] text-mark">
                          {i + 1}
                        </span>
                        <div className="flex-1 space-y-2">
                          <Input
                            value={step}
                            onChange={(e) => setStep(i, e.target.value)}
                            placeholder={t("stepPlaceholder")}
                            className="font-mono text-xs"
                          />
                          {step.trim() && (
                            <div className="overflow-x-auto rounded bg-background/60 p-2 text-base">
                              <MathExpr latex={`= ${step}`} display />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => moveStep(i, -1)}
                            disabled={i === 0}
                            aria-label={t("moveUp")}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => moveStep(i, 1)}
                            disabled={i === active.steps.length - 1}
                            aria-label={t("moveDown")}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeStep(i)}
                            disabled={active.steps.length === 1}
                            aria-label={t("removeStep")}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStep}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("addStep")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("stepHelp")}</p>
              </div>

              <div className="space-y-2 rounded-md border border-dashed border-mark/40 bg-mark-soft/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-mark">
                    <Sparkles className="h-3 w-3" />
                    {t("variants.title")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={generating}
                      onClick={() => generateVariants(-1)}
                    >
                      {t("variants.easier")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={generating}
                      onClick={() => generateVariants(0)}
                    >
                      {t("variants.same")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={generating}
                      onClick={() => generateVariants(1)}
                    >
                      {t("variants.harder")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("variants.help")}</p>
                {generating && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("variants.loading")}
                  </p>
                )}
                {variants.length > 0 && (
                  <ol className="space-y-2">
                    {variants.map((v, i) => (
                      <li
                        key={i}
                        className="rounded border border-rule bg-card/40 p-2 space-y-1"
                      >
                        <div className="overflow-x-auto rounded bg-background p-2 text-base">
                          <MathExpr latex={v.prompt_latex} display />
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {t("variants.stepCount", { count: v.solution_latex.length })}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => adoptVariant(v)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t("variants.addToExam")}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: live student preview */}
          <aside className="space-y-3 lg:sticky lg:top-24 self-start">
            <div className="flex items-baseline justify-between border-b border-rule pb-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                {t("studentPreview")}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("previewSubtitle")}
              </span>
            </div>
            <Card>
              <CardContent className="py-2 space-y-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-mark">
                  {t("previewSimplify", { number: activeIdx + 1 })}
                </div>
                <div className="rounded-md border border-rule bg-card graph-paper p-4 text-lg min-h-[3rem]">
                  {active.prompt.trim() ? (
                    <MathExpr latex={active.prompt} display />
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t("previewPromptHere")}
                    </span>
                  )}
                </div>
                <div className="rounded-md border border-rule bg-card notebook-rules px-2 py-3 min-h-[6rem]">
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">
                    {t("previewLineHere", {
                      total: Math.max(1, active.steps.filter((s) => s.trim()).length),
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
            <p className="px-1 text-[11px] text-muted-foreground">
              {t("previewFooter")}
            </p>
          </aside>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>{t("errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6">
          <p className="text-xs text-muted-foreground">
            {t("readyCount", {
              ready: questions.filter((q) => questionStatus(q) === "ok").length,
              total: questions.length,
              steps: totalSteps,
            })}
          </p>
          <Button type="submit" disabled={submitting} size="lg">
            {submitting ? t("publishing") : t("publish")}
          </Button>
        </div>
      </form>
    </>
  );
}
