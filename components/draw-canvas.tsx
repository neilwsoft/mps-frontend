"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Eraser, Loader2, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; pen: boolean };

const STROKE_COLOR = "#171717";
const BG_COLOR = "#ffffff";
const MIN_WIDTH = 1.4;
const MAX_WIDTH = 3.2;

// Velocity-adaptive idle wait. Tuned bounds:
//   FAST stroke (decisive) → shorter wait, OCR fires sooner.
//   SLOW stroke (hesitant) → longer wait, less chance of cutting them off
//   mid-thought (e.g. mid-fraction-bar).
const MIN_IDLE_MS = 350;
const MAX_IDLE_MS = 650;
const DEFAULT_IDLE_MS = 450;
// Velocity (px / ms) at and above which we treat strokes as "fast".
const FAST_VELOCITY = 1.5;
const SLOW_VELOCITY = 0.4;

export type DrawCanvasHandle = {
  clear: () => void;
};

export const DrawCanvas = forwardRef<
  DrawCanvasHandle,
  {
    onRecognize: (file: File) => void;
    busy?: boolean;
    disabled?: boolean;
    height?: number;
    /** Auto-fire recognize after the user stops drawing for the velocity-
     *  adaptive idle window. */
    autoRecognize?: boolean;
    /** Fires the instant a new stroke begins. Use to abort any in-flight
     *  OCR request the parent kicked off. */
    onStartStroke?: () => void;
  }
>(function DrawCanvas({ onRecognize, busy = false, disabled = false, height = 260, autoRecognize = false, onStartStroke }, ref) {
  const t = useTranslations("exam.handwriting.draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dprRef = useRef(1);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sliding-window record of stroke speeds (px / ms). Used to adapt the idle
  // window so confident writers get faster auto-submit.
  const velocityWindowRef = useRef<number[]>([]);
  const strokeStartTimeRef = useRef<number>(0);
  const [hasInk, setHasInk] = useState(false);

  function cancelIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function adaptiveIdleMs(): number {
    const samples = velocityWindowRef.current;
    if (samples.length === 0) return DEFAULT_IDLE_MS;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    if (avg >= FAST_VELOCITY) return MIN_IDLE_MS;
    if (avg <= SLOW_VELOCITY) return MAX_IDLE_MS;
    // Linear interpolation between the two anchors.
    const t = (avg - SLOW_VELOCITY) / (FAST_VELOCITY - SLOW_VELOCITY);
    return Math.round(MAX_IDLE_MS - t * (MAX_IDLE_MS - MIN_IDLE_MS));
  }

  function strokeVelocity(stroke: Stroke, durationMs: number): number {
    if (durationMs <= 0 || stroke.points.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      dist += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return dist / durationMs;
  }

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = dprRef.current;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = STROKE_COLOR;
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    if (activeStrokeRef.current) drawStroke(ctx, activeStrokeRef.current);
    ctx.restore();
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;
    repaint();
  }, [height, repaint]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(() => resize());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      cancelIdleTimer();
    };
  }, [resize]);

  function pointFromEvent(e: PointerEvent | React.PointerEvent): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }

  function shouldAccept(e: React.PointerEvent | PointerEvent) {
    if (disabled || busy) return false;
    const hasPenInBuffer = strokesRef.current.some((s) => s.pen);
    if (hasPenInBuffer && e.pointerType !== "pen") return false;
    return true;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!shouldAccept(e)) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    cancelIdleTimer();
    // Tell the parent that a new stroke started so any in-flight OCR call
    // can be aborted. The student is clearly still composing.
    onStartStroke?.();
    canvasRef.current?.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    strokeStartTimeRef.current = performance.now();
    activeStrokeRef.current = {
      points: [pointFromEvent(e)],
      pen: e.pointerType === "pen",
    };
    repaint();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== e.pointerId) return;
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    e.preventDefault();
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];
    for (const ev of events) stroke.points.push(pointFromEvent(ev));
    repaint();
  }

  function endStroke(commit: boolean) {
    const stroke = activeStrokeRef.current;
    const startedAt = strokeStartTimeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    if (commit && stroke && stroke.points.length > 0) {
      strokesRef.current.push(stroke);
      setHasInk(true);
      // Record this stroke's velocity (px / ms) into the sliding window.
      const duration = performance.now() - startedAt;
      const v = strokeVelocity(stroke, duration);
      if (v > 0) {
        const w = velocityWindowRef.current;
        w.push(v);
        if (w.length > 5) w.shift(); // keep last 5 strokes
      }
      if (autoRecognize && !busy && !disabled) {
        cancelIdleTimer();
        const delay = adaptiveIdleMs();
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          recognize();
        }, delay);
      }
    }
    repaint();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== e.pointerId) return;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
    endStroke(true);
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== e.pointerId) return;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
    endStroke(false);
  }

  function undo() {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    repaint();
  }

  const clear = useCallback(() => {
    cancelIdleTimer();
    strokesRef.current = [];
    activeStrokeRef.current = null;
    velocityWindowRef.current = [];
    setHasInk(false);
    repaint();
  }, [repaint]);

  useImperativeHandle(ref, () => ({ clear }), [clear]);

  const recognize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0 || busy) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "drawing.png", { type: "image/png" });
        onRecognize(file);
      },
      "image/png",
      0.95,
    );
  }, [busy, onRecognize]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-md border border-rule bg-[var(--paper-2)]"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          aria-label={t("ariaLabel")}
        />
        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            {t("placeholder")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {autoRecognize ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("reading")}
              </>
            ) : (
              <span className="opacity-70">
                {hasInk ? t("idleAutoSubmit") : t("placeholder")}
              </span>
            )}
          </span>
        ) : (
          <Button size="sm" onClick={recognize} disabled={!hasInk || busy || disabled}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {busy ? t("reading") : t("recognize")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={undo}
          disabled={!hasInk || busy}
          className="ml-auto"
        >
          <Undo2 className="h-3.5 w-3.5" />
          {t("undo")}
        </Button>
        <Button size="sm" variant="ghost" onClick={clear} disabled={!hasInk || busy}>
          <Eraser className="h-3.5 w-3.5" />
          {t("clear")}
        </Button>
      </div>
    </div>
  );
});

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points } = stroke;
  if (points.length === 0) return;
  if (points.length === 1) {
    const p = points[0];
    const r = pointWidth(p.pressure) / 2;
    ctx.beginPath();
    ctx.fillStyle = STROKE_COLOR;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    ctx.lineWidth = pointWidth((a.pressure + b.pressure) / 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function pointWidth(pressure: number) {
  const p = Math.max(0, Math.min(1, pressure));
  return MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * p;
}
