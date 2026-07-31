"use client";

import { useEffect, useRef, useState } from "react";
import { VIEW_HEIGHT, VIEW_PAD_X, VIEW_PAD_Y, VIEW_WIDTH, drawReplayFrame } from "./render";
import type { BotaoGoalReplay, BotaoMatchSetup } from "./types";

export default function GoalReplay({
  replay,
  setup,
  label,
}: {
  replay: BotaoGoalReplay;
  setup: BotaoMatchSetup;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const playbackRef = useRef({ startedAt: 0, offset: 0 });

  useEffect(() => {
    let frame = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas || replay.frames.length === 0) return;
      if (playbackRef.current.startedAt === 0) playbackRef.current.startedAt = time;
      const elapsed = playing
        ? playbackRef.current.offset + time - playbackRef.current.startedAt
        : playbackRef.current.offset;
      const duration = Math.max(1, replay.duration);
      const looped = playing ? elapsed % (duration + 650) : Math.min(elapsed, duration);
      const replayTime = Math.min(duration, looped);
      let frameIndex = 0;
      for (let index = 1; index < replay.frames.length; index += 1) {
        if (replay.frames[index].at > replayTime) break;
        frameIndex = index;
      }
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      const scale = (rect.width / VIEW_WIDTH) * dpr;
      context.setTransform(scale, 0, 0, scale, VIEW_PAD_X * scale, VIEW_PAD_Y * scale);
      drawReplayFrame(context, setup, replay, frameIndex);
      setProgress(Math.round((replayTime / duration) * 100));
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing, replay, setup]);

  function togglePlayback() {
    const now = performance.now();
    if (playing) {
      playbackRef.current.offset += now - playbackRef.current.startedAt;
      playbackRef.current.startedAt = now;
      setPlaying(false);
    } else {
      if (playbackRef.current.offset >= replay.duration) playbackRef.current.offset = 0;
      playbackRef.current.startedAt = now;
      setPlaying(true);
    }
  }

  function restart() {
    playbackRef.current = { startedAt: performance.now(), offset: 0 };
    setPlaying(true);
  }

  return (
    <section className="goal-replay" aria-label={`Replay de ${label}`}>
      <header>
        <div><span>REPLAY DO GOL</span><strong>{label}</strong></div>
        <em>{(replay.duration / 1000).toFixed(1)}s gravados</em>
      </header>
      <div className="goal-replay-canvas">
        <canvas ref={canvasRef} style={{ aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}` }} />
        <span className="goal-replay-live">REPLAY</span>
      </div>
      <div className="goal-replay-controls">
        <button type="button" onClick={togglePlayback}>{playing ? "Pausar" : "Reproduzir"}</button>
        <span><i style={{ width: `${progress}%` }} /></span>
        <button type="button" onClick={restart}>↻</button>
      </div>
      <small>Somente posições vetoriais do lance foram salvas — sem vídeo e sem reprocessar a partida.</small>
    </section>
  );
}
