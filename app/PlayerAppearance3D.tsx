"use client";

// Prévia 3D do criador. Mesmas escolhas do editor de sempre; muda só o palco:
// o boneco aparece de corpo inteiro, gira, e mostra como vai se mexer em campo.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlayerAppearance } from "./player-appearance";
import type { CharacterStage, StagePose } from "./botao/three/character-stage";

const POSES: Array<{ id: StagePose; label: string }> = [
  { id: "idle", label: "Parado" },
  { id: "run", label: "Correndo" },
  { id: "kick", label: "Chute" },
  { id: "celebrate", label: "Gol!" },
  { id: "signature", label: "Minha comemoração" },
];

export default function PlayerAppearance3D({
  appearance,
  primary,
  secondary,
  number,
  label,
  fallback,
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  number: number;
  label: string;
  /** Sem WebGL o editor volta para o retrato 2D. */
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<CharacterStage | null>(null);
  const [pose, setPose] = useState<StagePose>("idle");
  const [failed, setFailed] = useState(false);
  // Escolheu outra comemoração no editor: a prévia já mostra ela.
  const celebration = appearance.celebration ?? 0;
  const [shownCelebration, setShownCelebration] = useState(celebration);
  if (celebration !== shownCelebration) {
    setShownCelebration(celebration);
    setPose("signature");
  }
  // O palco carrega depois do primeiro render; ele lê daqui as escolhas mais novas.
  const latest = useRef({ appearance, primary, secondary, number, pose });
  useEffect(() => {
    latest.current = { appearance, primary, secondary, number, pose };
  });

  useEffect(() => {
    let cancelled = false;
    let stage: CharacterStage | null = null;
    import("./botao/three/character-stage")
      .then(({ CharacterStage: Stage }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        try {
          stage = new Stage(canvas);
          const current = latest.current;
          stage.setPlayer(current.appearance, current.primary, current.secondary, current.number);
          stage.setPose(current.pose);
          stageRef.current = stage;
        } catch {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      stageRef.current = null;
      stage?.dispose();
    };
  }, []);

  // Reconstrói o boneco só quando a aparência muda de fato, não a cada render do pai.
  const lookKey = `${JSON.stringify(appearance)}|${primary}|${secondary}|${number}`;
  useEffect(() => {
    const current = latest.current;
    stageRef.current?.setPlayer(current.appearance, current.primary, current.secondary, current.number);
  }, [lookKey]);

  useEffect(() => {
    stageRef.current?.setPose(pose);
  }, [pose]);

  if (failed) return <>{fallback}</>;

  return (
    <div className="appearance-3d">
      <canvas ref={canvasRef} width={280} height={320} aria-label={`${label}. Arraste para girar.`} />
      <div className="appearance-3d-poses" role="group" aria-label="Animação da prévia">
        {POSES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={pose === option.id}
            onClick={() => setPose(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
