"use client";

// A mão do tutorial: desenha o traço de exemplo da fase, em loop, até o
// jogador começar o primeiro traço. Os pontos vêm do mundo (projetados pela
// cena a cada quadro), então a mão acompanha a câmera sem React no meio.

import { useImperativeHandle, useRef } from "react";
import type { Ref } from "react";
import styles from "./hud.module.css";

export type ScreenPoint = { x: number; y: number };

export type TutorialHandle = {
  /** Por quadro: o caminho na tela (null esconde) e o relógio (ms). */
  update(points: ScreenPoint[] | null, now: number): void;
};

const CYCLE_MS = 2900;

/** Catmull-Rom: o traço de exemplo sai curvo como um dedo de verdade, não em quinas. */
function smooth(points: ScreenPoint[], steps = 10): ScreenPoint[] {
  if (points.length < 3) return points;
  const out: ScreenPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function TutorialOverlay({ ref }: { ref?: Ref<TutorialHandle> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<SVGPolylineElement>(null);
  const lineRef = useRef<SVGPolylineElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    update(points, now) {
      const root = rootRef.current;
      const trail = trailRef.current;
      const hand = handRef.current;
      const ripple = rippleRef.current;
      if (!root || !trail || !hand || !ripple) return;
      if (!points || points.length < 2) {
        root.style.opacity = "0";
        return;
      }
      const path = smooth(points);
      const lengths = [0];
      for (let index = 1; index < path.length; index += 1) {
        lengths.push(lengths[index - 1] + Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y));
      }
      const total = lengths[lengths.length - 1] || 1;
      const t = (now % CYCLE_MS) / CYCLE_MS;
      // Encosta (0–12%), desenha (12–70%), segura e solta (70–86%), some (86–100%).
      const progress = t < 0.12 ? 0 : t < 0.7 ? easeInOut((t - 0.12) / 0.58) : 1;
      const fade = t < 0.04 ? t / 0.04 : t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.14) : 1;
      const pressed = t > 0.06 && t < 0.72;
      const reach = progress * total;
      let visible = `${path[0].x.toFixed(1)},${path[0].y.toFixed(1)}`;
      let tip = path[0];
      for (let index = 1; index < path.length; index += 1) {
        if (lengths[index] <= reach) {
          tip = path[index];
          visible += ` ${tip.x.toFixed(1)},${tip.y.toFixed(1)}`;
          continue;
        }
        const span = lengths[index] - lengths[index - 1] || 1;
        const k = (reach - lengths[index - 1]) / span;
        tip = { x: path[index - 1].x + (path[index].x - path[index - 1].x) * k, y: path[index - 1].y + (path[index].y - path[index - 1].y) * k };
        visible += ` ${tip.x.toFixed(1)},${tip.y.toFixed(1)}`;
        break;
      }
      root.style.opacity = String(fade);
      trail.setAttribute("points", visible);
      lineRef.current?.setAttribute("points", visible);
      hand.style.transform = `translate3d(${tip.x}px, ${tip.y}px, 0) scale(${pressed ? 0.9 : 1.05})`;
      ripple.style.transform = `translate3d(${path[0].x}px, ${path[0].y}px, 0) scale(${0.4 + Math.min(1, t / 0.2) * 1.2})`;
      ripple.style.opacity = t < 0.2 ? String(1 - t / 0.2) : "0";
    },
  }), []);

  return (
    <div ref={rootRef} className={styles.tutorial} style={{ opacity: 0 }} aria-hidden="true">
      <svg className={styles.tutorialSvg}>
        <polyline ref={trailRef} className={styles.tutorialTrailGlow} points="" />
        <polyline ref={lineRef} className={styles.tutorialTrail} points="" />
      </svg>
      <div ref={rippleRef} className={styles.tutorialRipple} />
      <div ref={handRef} className={styles.tutorialHand}>
        <svg viewBox="0 0 64 64">
          <path
            d="M22.5 31.5V9.5a5 5 0 0 1 10 0v15.2l2.4-.6a4.6 4.6 0 0 1 5.6 3.1l.4 1.3 2-.5a4.6 4.6 0 0 1 5.6 3.3l.3 1.3 1.6-.3a4.6 4.6 0 0 1 5.4 3.9l.9 7.5c1 8.6-4.6 15.3-13.4 16.6l-5 .7c-5.6.8-10.4-1.2-13.4-6l-8.8-14a4.6 4.6 0 0 1 7.2-5.6z"
            fill="#fff"
            stroke="#0b1116"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          <path d="M32.5 25v8M41 29.5v5M49.5 34v4.5" stroke="#0b1116" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" />
        </svg>
      </div>
    </div>
  );
}
