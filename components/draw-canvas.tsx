"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Loader2, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; pen: boolean };

const STROKE_COLOR = "#171717";
const BG_COLOR = "#ffffff";
const MIN_WIDTH = 1.4;
const MAX_WIDTH = 3.2;

export function DrawCanvas({
  onRecognize,
  busy = false,
  disabled = false,
  height = 260,
}: {
  onRecognize: (file: File) => void;
  busy?: boolean;
  disabled?: boolean;
  height?: number;
}) {
  const t = useTranslations("exam.handwriting.draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dprRef = useRef(1);
  const [hasInk, setHasInk] = useState(false);

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
    return () => ro.disconnect();
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
    canvasRef.current?.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
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
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    if (commit && stroke && stroke.points.length > 0) {
      strokesRef.current.push(stroke);
      setHasInk(true);
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

  function clear() {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setHasInk(false);
    repaint();
  }

  function recognize() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || busy) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "drawing.png", { type: "image/png" });
        onRecognize(file);
      },
      "image/png",
      0.95,
    );
  }

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
        <Button size="sm" onClick={recognize} disabled={!hasInk || busy || disabled}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {busy ? t("reading") : t("recognize")}
        </Button>
        <Button size="sm" variant="ghost" onClick={undo} disabled={!hasInk || busy}>
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
}

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
