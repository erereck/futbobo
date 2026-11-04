"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONCEPTS, type Concept } from "../data";
import PitchWorld from "../v2/PitchWorld";
import RouteWorld from "../v2/RouteWorld";
import ContractWorld from "../v2/ContractWorld";
import DialogueWorld from "../v2/DialogueWorld";
import PlanWorld from "../v2/PlanWorld";
import PulseWorld from "../v2/PulseWorld";
import { Icon } from "../v2/shared";
import s from "../v2/worlds.module.css";

const WORLDS = {
  "na-bola": PitchWorld,
  estrada: RouteWorld,
  contrato: ContractWorld,
  entrelinhas: DialogueWorld,
  "na-mao": PlanWorld,
  pulso: PulseWorld,
};
export default function ConceptExperience({ concept }: { concept: Concept }) {
  const [mode, setMode] = useState<"menu" | "play">("menu");
  const [phone, setPhone] = useState(false);
  const [about, setAbout] = useState(false);
  useEffect(() => {
    if (window.location.hash === "#jogo") setMode("play");
  }, []);
  const change = (next: "menu" | "play") => {
    setMode(next);
    window.history.replaceState(null, "", next === "play" ? "#jogo" : "#menu");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const World = WORLDS[concept.id];
  return (
    <div className={s.studio}>
      <nav className={s.studioBar} aria-label="Explorar os conceitos">
        <Link href="/conceitos">
          <Icon name="arrow-left" size={15} />
          <span>6 formas de jogar</span>
        </Link>
        <details className={s.worldPicker}>
          <summary>
            <span>{concept.number}</span>
            {concept.name}
            <span>⌄</span>
          </summary>
          <div>
            {CONCEPTS.map((c) => (
              <Link
                key={c.id}
                href={`/conceitos/${c.id}/`}
                aria-current={c.id === concept.id ? "page" : undefined}
              >
                <b>{c.number}</b>
                {c.name}
                <small>{c.verb}</small>
              </Link>
            ))}
          </div>
        </details>
        <div className={s.studioViews}>
          <button
            type="button"
            aria-pressed={mode === "menu"}
            onClick={() => change("menu")}
          >
            Menu
          </button>
          <button
            type="button"
            aria-pressed={mode === "play"}
            onClick={() => change("play")}
          >
            Jogar
          </button>
        </div>
        <div className={s.studioTools}>
          <button
            type="button"
            aria-pressed={phone}
            onClick={() => setPhone(!phone)}
            title="Ver com largura de celular"
          >
            414px
          </button>
          <button
            type="button"
            aria-expanded={about}
            onClick={() => setAbout(!about)}
          >
            Por quê?
          </button>
        </div>
      </nav>
      {about ? (
        <aside className={s.designRationale}>
          <span>
            {concept.number} / {concept.verb}
          </span>
          <h2>{concept.stakes}</h2>
          <p>{concept.scope}</p>
          <p>{concept.description}</p>
          <button type="button" onClick={() => setAbout(false)}>
            Voltar ao jogo ×
          </button>
        </aside>
      ) : null}
      <div className={`${s.worldSurround} ${phone ? s.phoneMode : ""}`}>
        <div className={s.worldViewport}>
          <World
            mode={mode}
            onStart={() => change("play")}
            onHome={() => change("menu")}
          />
        </div>
      </div>
    </div>
  );
}
