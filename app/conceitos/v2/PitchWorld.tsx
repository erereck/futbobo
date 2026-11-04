"use client";
import { useState } from "react";
import {
  newPitch,
  nextPitch,
  PITCH_PEOPLE,
  pitchChance,
  playPitch,
  type PitchTarget,
} from "./systems";
import {
  Action,
  Back,
  Club,
  Help,
  Icon,
  Jersey,
  SaveNote,
  Wordmark,
  useRun,
  type WorldProps,
} from "./shared";
import s from "./worlds.module.css";

export default function PitchWorld({ mode, onStart, onHome }: WorldProps) {
  const [run, update, storage] = useRun("na-bola", newPitch);
  const [target, setTarget] = useState<PitchTarget | null>(null);
  const holder = PITCH_PEOPLE[run.holder];
  const targetPoint =
    target === "goal" ? { x: 94, y: 50 } : target ? PITCH_PEOPLE[target] : null;
  const act = () => {
    if (target) {
      update((current) => playPitch(current, target));
      setTarget(null);
    }
  };
  if (mode === "menu")
    return (
      <section className={`${s.world} ${s.pitchMenu}`}>
        <header className={s.worldHeader}>
          <Wordmark />
          <span>MARACANÃ · VESTIÁRIO 01</span>
          <Club id="flamengo" />
        </header>
        <div className={s.lockerWall}>
          <div className={s.lockerSide}>
            <span>09</span>
            <Jersey number={9} />
            <i />
            <small>DAVI</small>
          </div>
          <button type="button" className={s.yourLocker} onClick={onStart}>
            <span className={s.lockerPlaque}>
              <b>CAIO SILVA</b>
              <small>ATACANTE · 18 ANOS</small>
            </span>
            <span className={s.hanger} />
            <Jersey />
            <span className={s.lockerResume}>
              <span>
                <i /> A PARTIDA TE ESPERA
                <strong>
                  {run.result
                    ? "O próximo jogo"
                    : `${run.clock}′ · clássico empatado`}
                </strong>
              </span>
              <Icon name="arrow-right" size={25} />
            </span>
            <span className={s.lockerSeat}>PEGAR A CAMISA E ENTRAR</span>
          </button>
          <div className={s.lockerSide}>
            <span>07</span>
            <Jersey number={7} />
            <i />
            <small>NICO</small>
          </div>
        </div>
        <footer className={s.lockerFooter}>
          <div className={s.boots} aria-hidden="true">
            <i />
            <i />
          </div>
          <div>
            <span>O TÉCNICO TE CHAMOU.</span>
            <p>Três toques podem mudar o seu lugar no time.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              storage.reset();
              setTarget(null);
              onStart();
            }}
          >
            Uma nova estreia <span>↗</span>
          </button>
          <SaveNote saved={storage.saved} />
        </footer>
      </section>
    );
  return (
    <section className={`${s.world} ${s.pitchGame}`}>
      <header className={s.matchHeader}>
        <Back onClick={onHome} />
        <div className={s.scoreboard}>
          <Club id="flamengo" size={27} />
          <b>FLA</b>
          <strong>
            {run.score}
            <i>:</i>1
          </strong>
          <b>FLU</b>
          <Club id="fluminense" size={27} />
          <span>{run.clock}′</span>
        </div>
        <Help>
          Toque num companheiro para ler a linha de passe, ou no gol para
          chutar. Cada ação consome um toque. A posição da bola muda a chance da
          próxima finalização.
        </Help>
      </header>
      <main className={s.pitchStage}>
        <div className={s.pitchCaption}>
          <span>VOCÊ ENTROU AOS 87.</span>
          <h1>Enxerga o espaço?</h1>
          <p>{run.text}</p>
        </div>
        <div className={s.footballField}>
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className={s.fieldLines}
            aria-hidden="true"
          >
            <defs>
              <pattern
                id="grass-v2"
                width="160"
                height="600"
                patternUnits="userSpaceOnUse"
              >
                <rect width="80" height="600" fill="#254d39" />
                <rect x="80" width="80" height="600" fill="#2b553e" />
              </pattern>
            </defs>
            <rect width="1000" height="600" fill="url(#grass-v2)" />
            <g fill="none" stroke="#d7e2b67a" strokeWidth="2">
              <rect x="30" y="30" width="940" height="540" rx="2" />
              <path d="M420 30v540M30 120h140v360H30M970 120H800v360h170M970 225h-65v150h65M30 225h65v150H30" />
              <ellipse cx="420" cy="300" rx="92" ry="95" />
              <path d="M800 221c-69 0-69 158 0 158" />
            </g>
            <path
              d="M975 245h22v110h-22"
              stroke="#efedcf"
              strokeWidth="3"
              fill="#d2dfb11a"
            />
            <path
              d="M977 247h20M977 260h20M977 273h20M977 286h20M977 299h20M977 312h20M977 325h20M977 338h20M977 351h20"
              stroke="#efedcf66"
            />
            {targetPoint && !run.result ? (
              <path
                d={`M${holder.x * 10} ${holder.y * 6} Q${(holder.x + targetPoint.x) * 5} ${(holder.y + targetPoint.y) * 3 - 75} ${targetPoint.x * 10} ${targetPoint.y * 6}`}
                fill="none"
                stroke="#f4d077"
                strokeWidth="4"
                strokeDasharray="10 9"
              />
            ) : null}
          </svg>
          {[
            [58, 46, 4],
            [73, 58, 3],
            [85, 39, 6],
            [94, 50, 1],
          ].map(([x, y, n]) => (
            <span
              key={n}
              className={s.fieldOpponent}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <i>{n}</i>
            </span>
          ))}
          {(
            Object.entries(PITCH_PEOPLE) as [
              Exclude<PitchTarget, "goal">,
              typeof holder,
            ][]
          ).map(([id, person]) => (
            <button
              type="button"
              key={id}
              className={`${s.fieldPlayer} ${id === run.holder ? s.ballHolder : ""} ${target === id ? s.targetPlayer : ""}`}
              style={{ left: `${person.x}%`, top: `${person.y}%` }}
              disabled={!!run.result || id === run.holder}
              onClick={() => setTarget(id)}
              aria-label={`Passar para ${person.name}, ${pitchChance(run, id)}% de chance`}
            >
              <span>{person.number}</span>
              <strong>
                {person.name}
                {id === "caio" ? " · você" : ""}
              </strong>
              {id !== run.holder ? (
                <small>{pitchChance(run, id)}%</small>
              ) : null}
            </button>
          ))}
          <span
            className={s.matchBall}
            style={{
              transform: `translate(${run.result === "goal" ? 97 : holder.x + 3}%, ${run.result === "goal" ? 50 : holder.y + 4}%)`,
            }}
          >
            ●
          </span>
          <button
            type="button"
            className={`${s.goalTarget} ${target === "goal" ? s.goalSelected : ""}`}
            onClick={() => setTarget("goal")}
            disabled={!!run.result}
            aria-label={`Finalizar ao gol, ${pitchChance(run, "goal")}% de chance`}
          >
            <span>+</span>
            <small>GOL</small>
          </button>
          <span className={s.stadiumText}>MARACANÃ</span>
        </div>
        <div className={s.matchCommand} aria-live="polite">
          {run.result ? (
            <>
              <div className={s.matchOutcome}>
                <span>
                  {run.result === "goal"
                    ? "GOL. ERA ESSE O ESPAÇO."
                    : "FIM DO LANCE."}
                </span>
                <strong>
                  {run.result === "goal"
                    ? "Você leu o jogo."
                    : "O futebol cobra a escolha."}
                </strong>
                <small>
                  Confiança do treinador: {run.trust} · {run.chain.length} ações
                  na jogada
                </small>
              </div>
              <Action
                onClick={() => {
                  update(nextPitch(run));
                  setTarget(null);
                }}
              >
                Próxima oportunidade
              </Action>
            </>
          ) : (
            <>
              <div className={s.touches}>
                <span>TOQUES RESTANTES</span>
                <div>
                  {[0, 1, 2].map((i) => (
                    <i key={i} data-lit={i < run.touches} />
                  ))}
                </div>
              </div>
              <div className={s.reading}>
                <strong>
                  {target === "goal"
                    ? `${pitchChance(run, "goal")}% · finalizar agora`
                    : target
                      ? `${pitchChance(run, target)}% · passe para ${PITCH_PEOPLE[target].name}`
                      : "Toque em um companheiro ou no gol."}
                </strong>
                <small>
                  {target === "nico"
                    ? "O lateral deu o espaço. A próxima finalização melhora."
                    : target === "davi"
                      ? "O centroavante está sob pressão. A linha existe, mas cobra risco."
                      : target === "goal"
                        ? "Você troca a construção pela chance de decidir agora."
                        : "O campo é a decisão. O relógio também joga."}
                </small>
              </div>
              <Action onClick={act} disabled={!target}>
                {target === "goal" ? "Chutar" : "Tocar a bola"}
              </Action>
            </>
          )}
        </div>
      </main>
      <footer className={s.pitchBottom}>
        <span>
          CAIO SILVA / Nº 10 <i /> PROMESSA DO ELENCO
        </span>
        <span>CLÁSSICO · RODADA 12</span>
        <SaveNote saved={storage.saved} />
      </footer>
    </section>
  );
}
