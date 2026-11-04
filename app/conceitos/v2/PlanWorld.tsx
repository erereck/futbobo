"use client";
import { useState } from "react";
import {
  PLAN_CARDS,
  commitPlan,
  forecastPlan,
  newPlan,
  nextPlan,
  placeCard,
  planCost,
  type PlanCard,
} from "./systems";
import {
  Action,
  Back,
  Club,
  Help,
  Icon,
  Pips,
  SaveNote,
  Wordmark,
  useRun,
  type WorldProps,
} from "./shared";
import s from "./worlds.module.css";

function CardArt({ kind }: { kind: PlanCard["kind"] }) {
  return (
    <svg viewBox="0 0 160 110" className={s.planCardArt} aria-hidden="true">
      {kind === "match" ? (
        <>
          <path d="M10 85h140V30H10Z" fill="#35614f" />
          <path d="M20 77h120V37H20Zm60-40v40" stroke="#f0e8cb" fill="none" />
          <circle cx="80" cy="57" r="12" stroke="#f0e8cb" fill="none" />
          <path d="m62 83 14-32 20 3 7 34" fill="#bb4139" />
          <circle cx="85" cy="39" r="12" fill="#976340" />
          <circle cx="121" cy="87" r="9" fill="#f0e8cb" />
        </>
      ) : kind === "rest" ? (
        <>
          <path
            d="M24 77h111v15H24M30 77V35h27v42M63 74l52-38 16 22-37 25"
            fill="#4d7063"
          />
          <path d="m21 32 25-16 45 27-15 20-36-19-21 9" fill="#b64b3e" />
          <circle cx="103" cy="25" r="16" fill="#d5b478" />
          <path d="m117 15 12-8m-8 20h17" stroke="#b64b3e" strokeWidth="3" />
        </>
      ) : kind === "training" ? (
        <>
          <path d="m24 86 22-54 22 54Zm61 0 22-54 22 54Z" fill="#b64b3e" />
          <path d="M16 87h120" stroke="#355b4d" strokeWidth="4" />
          <path d="m35 56 22 0m39 0h22" stroke="#f0e8cb" strokeWidth="7" />
          <circle cx="76" cy="25" r="17" fill="#355b4d" />
          <path d="m67 24 9-7 9 7-4 11H71Z" fill="#e9ddbc" />
        </>
      ) : (
        <>
          <path d="m30 23 100 10-12 63-100-10Z" fill="#355b4d" />
          <path d="m48 18 74 8-7 56-74-8Z" fill="#e8d8b0" />
          <path
            d="m62 33 38 4M61 44l38 4M60 55l25 3"
            stroke="#b64b3e"
            strokeWidth="4"
          />
          <circle cx="108" cy="80" r="17" fill="#b64b3e" />
          <path d="M108 70v20m-10-10h20" stroke="#e8d8b0" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
function PlayingCard({
  card,
  selected,
  onClick,
  compact = false,
}: {
  card: PlanCard;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const contents = (
    <>
      <span className={s.cardTopline}>
        <small>{card.subtitle}</small>
        <b>{card.number}</b>
      </span>
      <CardArt kind={card.kind} />
      <strong>{card.title}</strong>
      <p>{card.description}</p>
      <span className={s.cardCost}>
        {Array.from({ length: Math.max(1, card.cost) }, (_, i) => (
          <i key={i} data-free={card.cost === 0} />
        ))}
        <small>
          {card.cost === 0
            ? "RECUPERA FÔLEGO"
            : `${card.cost} TEMPO${card.cost > 1 ? "S" : ""}`}
        </small>
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`${s.playingCard} ${selected ? s.cardLifted : ""} ${compact ? s.compactCard : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {contents}
    </button>
  ) : (
    <div className={`${s.playingCard} ${compact ? s.compactCard : ""}`}>
      {contents}
    </div>
  );
}
export default function PlanWorld({ mode, onStart, onHome }: WorldProps) {
  const [run, update, storage] = useRun("na-mao", newPlan);
  const [selected, setSelected] = useState<string | null>(null);
  const forecast = forecastPlan(run);
  const cost = planCost(run);
  const hand = PLAN_CARDS.filter((c) => !run.slots.includes(c.id));
  if (mode === "menu")
    return (
      <section className={`${s.world} ${s.planMenu}`}>
        <header className={s.worldHeader}>
          <Wordmark />
          <span>NA MÃO / O ANO QUE VOCÊ VAI JOGAR</span>
          <span className={s.tableSerial}>MESA Nº 10</span>
        </header>
        <main className={s.tableHome}>
          <button type="button" className={s.careerAlbum} onClick={onStart}>
            <span className={s.albumCorner} />
            <span className={s.albumLabel}>ÁLBUM DE CARREIRA</span>
            <Club id="flamengo" size={74} />
            <strong>
              CAIO
              <br />
              SILVA
            </strong>
            <span className={s.albumYear}>{run.season}</span>
            <span className={s.albumOpen}>
              ABRIR NA PRÓXIMA TEMPORADA <Icon name="arrow-right" />
            </span>
            <i>10</i>
          </button>
          <div className={s.homeCards}>
            {PLAN_CARDS.slice(0, 3).map((card, i) => (
              <div
                key={card.id}
                style={{
                  transform: `rotate(${(i - 1) * 9}deg) translateY(${i === 1 ? -15 : 0}px)`,
                }}
              >
                <PlayingCard card={card} />
              </div>
            ))}
          </div>
          <aside className={s.albumRecord}>
            <span>JÁ VIROU MEMÓRIA</span>
            <b>{run.results.length.toString().padStart(2, "0")}</b>
            <span>TEMPORADAS</span>
            <p>
              Seu preparo, o jogo
              <br />e o que vem depois.
              <br />
              <i>A ordem muda tudo.</i>
            </p>
            <button
              type="button"
              onClick={() => {
                storage.reset();
                setSelected(null);
                onStart();
              }}
            >
              Abrir um álbum novo ↗
            </button>
          </aside>
        </main>
        <footer className={s.tableFooter}>
          <span>
            SEM CARTA RARA. SEM SORTEIO.
            <br />O QUE FAZ A DIFERENÇA É O QUE VOCÊ COMBINA.
          </span>
          <SaveNote saved={storage.saved} />
        </footer>
      </section>
    );
  return (
    <section className={`${s.world} ${s.planGame}`}>
      <header className={s.planHeader}>
        <Back onClick={onHome}>Álbum</Back>
        <div>
          <Club id="flamengo" size={29} />
          <span>
            CAIO SILVA / <b>{run.season}</b>
          </span>
        </div>
        <Help>
          Toque numa carta e depois em um dos três momentos do ano. Toque numa
          carta já jogada para mover ou trocar. Você tem quatro tempos. A ordem
          cria combinações — e o fôlego passa para a temporada seguinte.
        </Help>
      </header>
      <main className={s.planBoard}>
        <div className={s.planBoardTitle}>
          <div>
            <span>ANTES / DURANTE / DEPOIS</span>
            <h1>
              {run.result ? "Virou temporada." : "O ano está na sua mão."}
            </h1>
          </div>
          <div className={s.timeBudget}>
            <span>TEMPOS DO ANO</span>
            <div>
              {[0, 1, 2, 3].map((i) => (
                <i key={i} data-spent={i < cost} data-over={cost > 4} />
              ))}
            </div>
            <small>{cost} / 4 usados</small>
          </div>
        </div>
        {run.result ? (
          <div className={s.seasonReceipt} aria-live="polite">
            <div className={s.receiptHeader}>
              <span>FUTBOBO / {run.season}</span>
              <Icon name="check" size={28} />
            </div>
            <h2>{run.result.title}</h2>
            <div className={s.receiptScore}>
              <span>
                <b>{run.result.goals}</b>GOLS NA TEMPORADA
              </span>
              <span>
                <b>{run.trust}</b>CONFIANÇA
              </span>
              <span>
                <b>{run.fitness}</b>FÔLEGO RESTANTE
              </span>
            </div>
            <div className={s.receiptCombos}>
              {run.result.combos.length ? (
                run.result.combos.map((c) => (
                  <p key={c}>
                    <Icon name="check" size={16} />
                    {c}
                  </p>
                ))
              ) : (
                <p>
                  O plano foi cumprido. Uma temporada sem combinação especial
                  também deixa sua marca.
                </p>
              )}
            </div>
            <Action
              onClick={() => {
                update(nextPlan);
                setSelected(null);
              }}
            >
              Distribuir o próximo ano
            </Action>
          </div>
        ) : (
          <div className={s.seasonSlots}>
            {run.slots.map((id, i) => {
              const card = PLAN_CARDS.find((c) => c.id === id);
              return (
                <div className={s.seasonSlot} key={i}>
                  <span>
                    <b>0{i + 1}</b>
                    {["PREPARAR", "DISPUTAR", "SUSTENTAR"][i]}
                  </span>
                  {card ? (
                    <button
                      type="button"
                      className={`${s.occupiedSlot} ${selected === card.id ? s.slotChosen : ""}`}
                      onClick={() => {
                        if (selected) {
                          update((current) => placeCard(current, selected, i));
                          setSelected(null);
                        } else setSelected(card.id);
                      }}
                      aria-label={`${card.title} no momento ${i + 1}. Toque para selecionar ou trocar.`}
                    >
                      <PlayingCard card={card} compact />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${s.emptySlot} ${selected ? s.slotReady : ""}`}
                      onClick={() => {
                        if (selected) {
                          update((current) => placeCard(current, selected, i));
                          setSelected(null);
                        }
                      }}
                      disabled={!selected}
                      aria-label={`Jogar a carta selecionada no momento ${i + 1}`}
                    >
                      <span>+</span>
                      <strong>
                        {selected ? "Jogar aqui" : "Um tempo do ano"}
                      </strong>
                      <small>
                        {selected
                          ? PLAN_CARDS.find((c) => c.id === selected)?.title
                          : "Escolha uma carta da mão"}
                      </small>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className={s.planBottomBoard}>
          <div className={s.planResources}>
            <Pips value={run.fitness} max={8} label="Fôlego" />
            <Pips value={run.trust} max={10} label="Confiança" />
          </div>
          {!run.result ? (
            <div className={s.comboReading}>
              <span>LEITURA DO PLANO</span>
              <p>
                {cost > 4
                  ? "Não cabe no ano. Troque uma ação por descanso."
                  : (forecast.combos[0] ??
                    "Prepare o clássico antes de disputá-lo. Pense também no dia seguinte.")}
              </p>
            </div>
          ) : (
            <div className={s.comboReading}>
              <span>O QUE PASSA PARA O PRÓXIMO ANO</span>
              <p>Seu fôlego e suas relações seguem com você.</p>
            </div>
          )}
          {!run.result ? (
            <Action
              disabled={run.slots.some((id) => !id) || cost > 4}
              onClick={() => {
                update(commitPlan);
                setSelected(null);
              }}
            >
              Virar a temporada
            </Action>
          ) : null}
        </div>
      </main>
      <section className={s.cardHandArea}>
        <div>
          <span>
            {run.result ? "SUA PRÓXIMA MÃO ESTÁ TE ESPERANDO" : "SUA MÃO"}
          </span>
          <span>
            {selected
              ? "TOQUE NUM MOMENTO DO ANO PARA JOGAR"
              : "ESCOLHA UMA CARTA. O ANO TEM TRÊS ESPAÇOS."}
          </span>
        </div>
        <div className={s.cardHand}>
          {(run.result ? PLAN_CARDS : hand).map((card, i) => (
            <div
              className={s.handCardWrap}
              key={card.id}
              style={
                {
                  "--fan": `${(i - (hand.length - 1) / 2) * 3}deg`,
                } as React.CSSProperties
              }
            >
              <PlayingCard
                card={card}
                selected={selected === card.id}
                onClick={
                  run.result
                    ? undefined
                    : () => setSelected(selected === card.id ? null : card.id)
                }
              />
            </div>
          ))}
        </div>
      </section>
      <footer className={s.planFooter}>
        <span>O FÔLEGO DESTE ANO ABRE O PRÓXIMO.</span>
        <SaveNote saved={storage.saved} />
      </footer>
    </section>
  );
}
