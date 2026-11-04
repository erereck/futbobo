"use client";
import { useRef, useState } from "react";
import { newPulse, pulseEvent, swipePulse } from "./systems";
import {
  Action,
  Back,
  Face,
  Help,
  Icon,
  SaveNote,
  Wordmark,
  useRun,
  type WorldProps,
} from "./shared";
import s from "./worlds.module.css";

export default function PulseWorld({ mode, onStart, onHome }: WorldProps) {
  const [run, update, storage] = useRun("pulso", newPulse);
  const [drag, setDrag] = useState(0);
  const dragDistance = useRef(0);
  const origin = useRef<number | null>(null);
  const lock = useRef(0);
  const event = pulseEvent(run);
  const side = drag < 0 ? "left" : "right";
  const delta = side === "left" ? event.a : event.b;
  const choose = (choice: "left" | "right") => {
    if (Date.now() - lock.current < 230) return;
    lock.current = Date.now();
    update((current) => swipePulse(current, choice));
    dragDistance.current = 0;
    setDrag(0);
  };
  if (mode === "menu")
    return (
      <section className={`${s.world} ${s.pulseMenu}`}>
        <header className={s.worldHeader}>
          <Wordmark />
          <span>PULSO / SEM TEMPO PRA FICAR PARADO</span>
          <Icon name="ball" size={25} />
        </header>
        <main className={s.pulseHome}>
          <span className={s.pulseHomeMark}>
            FUTEBOL
            <br />
            ACONTECE
            <br />
            <i>TODO DIA.</i>
          </span>
          <div className={s.pulseHomePlayer}>
            <span className={s.pulseOrbit} />
            <span className={s.pulseOrbit} />
            <Face person="caio" mood={1} />
            <span className={s.pulseNumber}>10</span>
            <div>
              <span>CAIO SILVA</span>
              <small>
                {run.turn
                  ? `${run.turn} decisões depois, ainda é você.`
                  : "18 anos. O mundo não vai esperar."}
              </small>
            </div>
          </div>
          <div className={s.pulseHomeCommand}>
            <span>
              VOCÊ NÃO CONTROLA TUDO.
              <br />
              <b>MAS ESCOLHE O SEU LADO.</b>
            </span>
            <Action onClick={onStart}>Entrar no ritmo</Action>
            <button
              type="button"
              onClick={() => {
                storage.reset();
                lock.current = 0;
                onStart();
              }}
            >
              Começar outra carreira <span>↗</span>
            </button>
          </div>
        </main>
        <footer className={s.pulseHomeFooter}>
          <span>
            ESQUERDA OU DIREITA.
            <br />A CONSEQUÊNCIA VEM JUNTO.
          </span>
          <span>7 DECISÕES / UM PEDAÇO DE VIDA</span>
          <SaveNote saved={storage.saved} />
        </footer>
      </section>
    );
  return (
    <section className={`${s.world} ${s.pulseGame}`}>
      <header className={s.pulseHeader}>
        <Back onClick={onHome}>Pausa</Back>
        <Wordmark />
        <span>0{Math.min(run.turn + 1, 7)} / 07</span>
      </header>
      <div className={s.pulseGauges}>
        {[
          ["medical", "Corpo"],
          ["team", "Vestiário"],
          ["news", "Torcida"],
        ].map(([icon, label], i) => (
          <div key={label} data-critical={run.values[i] <= 2}>
            <Icon name={icon as "medical" | "team" | "news"} size={22} />
            <span>{label}</span>
            <div>
              {Array.from({ length: 8 }, (_, j) => (
                <i
                  key={j}
                  data-lit={j < run.values[i]}
                  data-preview={
                    Math.abs(drag) > 20 &&
                    ((delta[i] > 0 &&
                      j >= run.values[i] &&
                      j < run.values[i] + delta[i]) ||
                      (delta[i] < 0 &&
                        j >= run.values[i] + delta[i] &&
                        j < run.values[i]))
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <main className={s.pulseArena}>
        {run.done ? (
          <div className={s.pulseEnding}>
            <span>ESSA PARTE DA VIDA FICOU PRA TRÁS.</span>
            <h1>
              {run.values[0] === 0
                ? "O corpo pediu uma pausa."
                : run.values[1] === 0
                  ? "O vestiário sentiu a distância."
                  : "Você encontrou o seu passo."}
            </h1>
            <p>{run.log.length} decisões. Nenhuma aconteceu sozinha.</p>
            <div className={s.pulsePast}>
              {run.log.map((l, i) => (
                <span key={i}>
                  <b>{l.side === "left" ? "←" : "→"}</b>
                  {l.text}
                </span>
              ))}
            </div>
            <Action
              onClick={() => {
                storage.reset();
                lock.current = 0;
              }}
            >
              E se você fosse pelo outro lado?
            </Action>
          </div>
        ) : (
          <>
            <div
              className={`${s.swipeFuture} ${s.futureLeft}`}
              data-active={drag < -20}
            >
              <span>←</span>
              <strong>{event.left}</strong>
              <small>Você abre mão do outro caminho.</small>
            </div>
            <article
              className={s.swipeCard}
              style={{
                transform: `translateX(${drag}px) rotate(${drag / 24}deg)`,
              }}
              onPointerDown={(e) => {
                origin.current = e.clientX;
                dragDistance.current = 0;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (origin.current !== null) {
                  dragDistance.current = Math.max(
                    -180,
                    Math.min(180, e.clientX - origin.current),
                  );
                  setDrag(dragDistance.current);
                }
              }}
              onPointerUp={() => {
                if (origin.current !== null) {
                  if (Math.abs(dragDistance.current) > 75)
                    choose(dragDistance.current < 0 ? "left" : "right");
                  else setDrag(0);
                  dragDistance.current = 0;
                  origin.current = null;
                }
              }}
              onPointerCancel={() => {
                dragDistance.current = 0;
                setDrag(0);
                origin.current = null;
              }}
              aria-label="Arraste a situação para escolher um dos dois caminhos"
            >
              <div className={s.pulseSpeaker}>
                <span>{event.speaker}</span>
                <b>0{run.turn + 1}</b>
              </div>
              <div
                className={`${s.pulseIllustration} ${s[`illustration-${event.scene}`]}`}
              >
                <span className={s.sceneCircle} />
                <span className={s.sceneWindow} />
                {event.scene === "medical" ? (
                  <>
                    <Icon name="medical" size={100} />
                    <span className={s.medicalTape} />
                  </>
                ) : event.scene === "fans" ? (
                  <>
                    <Face person="caio" mood={2} />
                    <span className={s.fanSigns}>
                      10<small>É O NOSSO!</small>
                    </span>
                  </>
                ) : event.scene === "night" ? (
                  <>
                    <Face person="captain" mood={4} />
                    <span className={s.sceneMoon} />
                  </>
                ) : (
                  <Face person="coach" mood={1} />
                )}
              </div>
              <h1>{event.text}</h1>
              <div className={s.swipeCardBottom}>
                <span>CAIO / 2026</span>
                <Icon name="ball" size={18} />
                <span>O DIA NÃO PARA.</span>
              </div>
              <span
                className={s.swipeOverlay}
                data-visible={Math.abs(drag) > 40}
              >
                {drag < 0 ? event.left : event.right}
              </span>
            </article>
            <div
              className={`${s.swipeFuture} ${s.futureRight}`}
              data-active={drag > 20}
            >
              <span>→</span>
              <strong>{event.right}</strong>
              <small>O próximo acontecimento vai lembrar disso.</small>
            </div>
          </>
        )}
      </main>
      {!run.done ? (
        <div className={s.pulseChoiceButtons}>
          <button
            type="button"
            onClick={() => choose("left")}
            aria-label={`Escolher à esquerda: ${event.left}`}
          >
            <span>←</span>
            {event.left}
          </button>
          <span>
            ARRASTE
            <br />
            OU TOQUE
          </span>
          <button
            type="button"
            onClick={() => choose("right")}
            aria-label={`Escolher à direita: ${event.right}`}
          >
            {event.right}
            <span>→</span>
          </button>
        </div>
      ) : null}
      <footer className={s.pulseGameFooter}>
        <p aria-live="polite">
          {run.last || "Cada gesto puxa o próximo acontecimento."}
        </p>
        <div>
          <Help>
            Arraste a carta para um lado ou use os botões. Os três medidores
            indicam o equilíbrio da carreira. Prometer jogar pode trazer uma
            cobrança física no próximo acontecimento.
          </Help>
          <SaveNote saved={storage.saved} />
        </div>
      </footer>
    </section>
  );
}
