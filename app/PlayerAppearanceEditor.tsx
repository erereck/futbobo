"use client";

import { useEffect, useRef } from "react";
import { drawPlayerBust, type PlayerAppearance } from "./player-appearance";

// Preserve existing imports and compact player portraits while upgrading the editor itself.
export { default } from "./AvatarStudio";

export function PlayerAppearancePortrait({
  appearance,
  primary,
  secondary,
  size = 280,
  label = "Personagem",
  frame = "standard",
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  size?: number;
  label?: string;
  frame?: "standard" | "compact";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const compactFrame = frame === "compact";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2 + (compactFrame ? 0 : -5));
    const portraitRadius = compactFrame ? 128 : 108;
    const frameRadius = compactFrame ? 132 : 111;
    const frameWidth = compactFrame ? 3 : 7;
    context.fillStyle = "rgba(0,0,0,.38)";
    context.beginPath(); context.ellipse(5, 15, 113, 94, 0, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(0, 0, portraitRadius, 0, Math.PI * 2); context.fillStyle = primary; context.fill();
    drawPlayerBust(context, appearance, primary, secondary, portraitRadius, compactFrame ? -8 : 0);
    context.strokeStyle = "#f4c430"; context.lineWidth = frameWidth; context.beginPath(); context.arc(0, 0, frameRadius, 0, Math.PI * 2); context.stroke();
    context.restore();
  }, [appearance, frame, primary, secondary]);

  return <canvas ref={canvasRef} width={280} height={280} style={{ width: size, height: size }} aria-label={label} />;
}
