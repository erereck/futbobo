"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import FutboboIcon, {
  type FutboboIconName,
} from "../../components/FutboboIcon";
import {
  DEFAULT_PLAYER_APPEARANCE,
  drawPlayerBust,
} from "../../player-appearance";
import { assetRoot } from "../data";
import { restoreStudy, type StudyId } from "./systems";
import s from "./worlds.module.css";

export type WorldProps = {
  mode: "menu" | "play";
  onStart: () => void;
  onHome: () => void;
};
export function useRun<T extends object>(id: StudyId, initial: () => T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const key = "futbobo:game-study:v2:" + id;
  useEffect(() => {
    try {
      setValue(restoreStudy(id, localStorage.getItem(key)) as unknown as T);
    } catch {
      setSaved(false);
    }
    setReady(true);
  }, [key, id]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify({ version: 2, run: value }));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [key, ready, value]);
  const update = (next: T | ((current: T) => T)) => setValue(next);
  return [
    value,
    update,
    { ready, saved, reset: () => update(initial()) },
  ] as const;
}
export function Icon({
  name,
  size = 20,
}: {
  name: FutboboIconName;
  size?: number;
}) {
  return <FutboboIcon name={name} size={size} />;
}
export function Wordmark() {
  return (
    <span className={s.wordmark}>
      <Icon name="ball" size={26} />
      <b>futbobo</b>
      <sup>®</sup>
    </span>
  );
}
export function Club({ id, size = 36 }: { id: string; size?: number }) {
  return (
    <img
      className={s.crest}
      src={`${assetRoot}/assets/clubs/${id}.png`}
      alt={
        id === "sport"
          ? "Sport"
          : id === "santos"
            ? "Santos"
            : id === "fluminense"
              ? "Fluminense"
              : "Flamengo"
      }
      width={size}
      height={size}
      draggable={false}
    />
  );
}
export function Back({
  onClick,
  children = "Vestiário",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className={s.back} onClick={onClick}>
      <Icon name="arrow-left" size={17} />
      {children}
    </button>
  );
}
export function Action({
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${s.action} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <Icon name="arrow-right" size={19} />
    </button>
  );
}
export function Pips({
  value,
  max = 6,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  return (
    <span className={s.pipGroup} aria-label={`${label}: ${value} de ${max}`}>
      <span>{label}</span>
      <span>
        {Array.from({ length: max }, (_, i) => (
          <i key={i} data-lit={i < value} />
        ))}
      </span>
      <b>{value}</b>
    </span>
  );
}
export function Jersey({
  number = 10,
  primary = "#b93632",
  secondary = "#1b2523",
}: {
  number?: number;
  primary?: string;
  secondary?: string;
}) {
  return (
    <svg className={s.jersey} viewBox="0 0 180 200" aria-hidden="true">
      <path
        d="m63 12-24 8L8 47l20 36 20-10-4 115q46 15 92 0l-4-115 20 10 20-36-31-27-24-8q-27 25-54 0Z"
        fill={primary}
        stroke="#111b1b"
        strokeWidth="2"
      />
      <path
        d="m37 27-16 24 13 23 18-12-6 34h88l-5-32 18 11 13-24-16-24-27-15q-27 25-54 0Z"
        fill={secondary}
        opacity=".94"
      />
      <path d="M46 124h88v25H46M45 174h91v14q-46 15-92 0Z" fill={secondary} />
      <path d="m65 12 3 13q22 18 44 0l3-13q-25 19-50 0Z" fill="#e3d4ac" />
      <path
        d="m64 15 26 18 26-18"
        stroke="#111b1b"
        strokeWidth="3"
        fill="none"
      />
      <text
        x="90"
        y="133"
        textAnchor="middle"
        fill="#fff2c9"
        fontFamily="Impact, sans-serif"
        fontSize="58"
        stroke="#25322c"
        strokeWidth="1"
      >
        {number}
      </text>
      <path
        d="M51 77 48 180M129 77l4 104"
        stroke="#fff"
        strokeOpacity=".14"
        strokeWidth="2"
      />
    </svg>
  );
}
export function Face({
  person = "caio",
  mood = 1,
}: {
  person?: "caio" | "coach" | "captain";
  mood?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 280, 280);
    ctx.save();
    ctx.translate(140, 140);
    drawPlayerBust(
      ctx,
      {
        ...DEFAULT_PLAYER_APPEARANCE,
        skin: person === "coach" ? 2 : 6,
        hairStyle: person === "coach" ? 12 : person === "captain" ? 5 : 2,
        beard: person === "coach" ? 7 : 0,
        hairColor: person === "coach" ? 7 : 0,
        face: mood,
        brow: person === "coach" ? 2 : 1,
        kitPattern: person === "caio" ? 8 : 1,
      },
      person === "caio"
        ? "#ba3e34"
        : person === "coach"
          ? "#243d43"
          : "#d5c8a0",
      "#1b2523",
      131,
    );
    ctx.restore();
  }, [person, mood]);
  return (
    <canvas
      ref={ref}
      width={280}
      height={280}
      role="img"
      aria-label={
        person === "coach"
          ? "Professor Sérgio"
          : person === "captain"
            ? "André, capitão"
            : "Caio, seu jogador"
      }
    />
  );
}
export function Figure({
  person = "caio",
  mood = 1,
}: {
  person?: "caio" | "coach" | "captain";
  mood?: number;
}) {
  return (
    <div className={`${s.figure} ${s[person]}`}>
      <span className={s.figureShadow} />
      <div className={s.figureHead}>
        <Face person={person} mood={mood} />
      </div>
      <svg viewBox="0 0 180 285" aria-hidden="true">
        <path
          d="M74 0h32v32H74"
          fill={person === "coach" ? "#d99b73" : "#985d43"}
        />
        <path
          d="m57 20-30 25-9 102 20 3L53 81l-2 87h78l-2-87 15 69 20-3-9-102-30-25q-33 20-66 0Z"
          fill={
            person === "caio"
              ? "#b63630"
              : person === "coach"
                ? "#25434a"
                : "#cabd9c"
          }
        />
        <path d="M51 166h78l-6 51H96l-6-30-6 30H57Z" fill="#202e2d" />
        <path
          d="m58 213 4 51h18l4-51M96 213l4 51h18l5-51"
          fill={person === "coach" ? "#244049" : "#ddd4b8"}
        />
        <path
          d="m58 260-9 15v8h34l-2-23M99 260l-2 23h34v-8l-10-15"
          fill="#192524"
        />
        <path
          d="m20 145-4 25 14 4 10-24M141 150l9 24 15-4-4-25"
          fill={person === "coach" ? "#d99b73" : "#985d43"}
        />
        {person === "caio" ? (
          <>
            <path d="M52 58h76v20H52M52 111h76v21H52" fill="#202e2d" />
            <text
              x="90"
              y="127"
              textAnchor="middle"
              fill="#efe4bd"
              fontFamily="Impact, sans-serif"
              fontSize="47"
            >
              10
            </text>
          </>
        ) : (
          <>
            <path
              d="M90 32v121"
              stroke="#e4dbbd"
              strokeWidth="2"
              opacity=".4"
            />
            <circle cx="118" cy="52" r="5" fill="#e5d2a4" />
          </>
        )}
      </svg>
    </div>
  );
}
export function Help({ children }: { children: ReactNode }) {
  return (
    <details className={s.help}>
      <summary>
        <span>?</span> Como jogar
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function SaveNote({ saved }: { saved: boolean }) {
  return (
    <span className={s.saveNote}>
      {saved
        ? "● Sua carreira fica guardada aqui"
        : "○ Progresso disponível nesta sessão"}
    </span>
  );
}
