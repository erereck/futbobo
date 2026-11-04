"use client";
import { useState } from "react";
import {
  ROUTE_NODES,
  newRoute,
  routeReason,
  travel,
  type RouteState,
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

function RouteMap({
  run,
  selected,
  select,
  menu,
}: {
  run: RouteState;
  selected: string | null;
  select: (id: string) => void;
  menu: boolean;
}) {
  return (
    <div className={`${s.routeMap} ${menu ? s.mapOverview : ""}`}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={s.routeRoads}
        aria-hidden="true"
      >
        <path
          className={s.mapCoast}
          d="M7 0q11 14 3 29T13 57Q3 82 15 100M90 0q-7 19 2 28t-3 27q9 25 1 45"
        />
        {ROUTE_NODES.flatMap((n) =>
          n.edges.map((id) => {
            const other = ROUTE_NODES.find((o) => o.id === id)!;
            const done = run.visited.includes(n.id) && run.visited.includes(id);
            return (
              <path
                key={n.id + id}
                className={
                  done
                    ? s.roadTaken
                    : run.at === n.id
                      ? s.roadAvailable
                      : s.roadFuture
                }
                d={`M${16 + n.col * 34} ${12 + n.row * 25} C${16 + n.col * 34} ${24 + n.row * 25}, ${16 + other.col * 34} ${other.row * 25}, ${16 + other.col * 34} ${12 + other.row * 25}`}
              />
            );
          }),
        )}
      </svg>
      <span className={s.mapCompass}>
        N<span>↑</span>
        <i>O + L</i>
        <small>S</small>
      </span>
      <span className={s.mapWatermark}>
        UM CAMINHO
        <br />
        NUNCA É SÓ
        <br />
        UMA LINHA.
      </span>
      {ROUTE_NODES.map((n) => {
        const visited = run.visited.includes(n.id);
        const active = ROUTE_NODES.find((o) => o.id === run.at)?.edges.includes(
          n.id,
        );
        const reason = routeReason(run, n.id);
        return (
          <button
            type="button"
            key={n.id}
            className={`${s.routeNode} ${visited ? s.nodeVisited : ""} ${run.at === n.id ? s.nodeCurrent : ""} ${active && !reason ? s.nodeReachable : ""} ${selected === n.id ? s.nodeSelected : ""}`}
            style={{ left: `${16 + n.col * 34}%`, top: `${12 + n.row * 25}%` }}
            onClick={() => select(n.id)}
            aria-label={`${n.title}${run.at === n.id ? ", você está aqui" : visited ? ", caminho percorrido" : active ? (reason ? `, ${reason}` : ", disponível") : ", caminho futuro"}`}
          >
            <span className={s.mapPin}>
              {n.club ? (
                <Club id={n.club} size={28} />
              ) : (
                <Icon
                  name={
                    n.kind === "rest"
                      ? "medical"
                      : n.kind === "train"
                        ? "player"
                        : "career"
                  }
                  size={19}
                />
              )}
            </span>
            <strong>{n.title}</strong>
            <small>
              {run.at === n.id
                ? menu
                  ? "CONTINUAR DAQUI"
                  : "VOCÊ ESTÁ AQUI"
                : visited
                  ? "NA SUA HISTÓRIA"
                  : n.kind === "final"
                    ? "DESTINO"
                    : active && reason
                      ? "SEM FÔLEGO / CONDIÇÃO"
                      : n.place.split(" · ")[0]}
            </small>
          </button>
        );
      })}
    </div>
  );
}
export default function RouteWorld({ mode, onStart, onHome }: WorldProps) {
  const [run, update, storage] = useRun("estrada", newRoute);
  const [selected, setSelected] = useState<string | null>(null);
  const node =
    ROUTE_NODES.find((n) => n.id === (selected ?? run.at)) ?? ROUTE_NODES[0];
  const here = ROUTE_NODES.find((n) => n.id === run.at)!;
  const reason = routeReason(run, node.id);
  const menu = mode === "menu";
  return (
    <section className={`${s.world} ${s.roadWorld}`}>
      <header className={s.roadHeader}>
        <Wordmark />
        <span>ESTRADA / CARREIRA DE CAIO SILVA</span>
        {menu ? (
          <button
            type="button"
            onClick={() => {
              storage.reset();
              setSelected(null);
              onStart();
            }}
          >
            Traçar outra carreira <span>↗</span>
          </button>
        ) : (
          <Back onClick={onHome}>Atlas da carreira</Back>
        )}
      </header>
      <main className={s.roadLayout}>
        <div className={s.roadMapArea}>
          <div className={s.atlasTitle}>
            <span>ARQUIVO DE VIAGEM Nº 010</span>
            <h1>
              {menu ? (
                <>
                  A carreira
                  <br />
                  tem bifurcações.
                </>
              ) : (
                <>
                  Você está
                  <br />
                  {here.place.split(" · ")[0].toLowerCase()}.
                </>
              )}
            </h1>
            <span className={s.routeScale}>
              12 → 18 → <b>{18 + run.visited.length - 1} ANOS</b>
            </span>
          </div>
          <RouteMap
            run={run}
            selected={selected}
            menu={menu}
            select={(id) => {
              setSelected(id);
              if (menu) onStart();
            }}
          />
          <div className={s.mapLegend}>
            <span>
              <i /> Caminho percorrido
            </span>
            <span>
              <i /> Próxima oportunidade
            </span>
            <span>1 ETAPA = 1 CAPÍTULO DA CARREIRA</span>
          </div>
        </div>
        <aside className={s.passport}>
          <div className={s.passportTop}>
            <Icon name="globe" size={27} />
            <span>
              PASSAPORTE
              <br />
              DE FUTEBOL
            </span>
            <span>BR</span>
          </div>
          <div className={s.passportPlayer}>
            <Club id={run.club} size={45} />
            <div>
              <span>CAIO SILVA</span>
              <small>18 anos · atacante</small>
            </div>
            <b>10</b>
          </div>
          <div className={s.routeResources}>
            <Pips value={run.energy} label="Fôlego" />
            <Pips value={run.trust} max={8} label="Confiança" />
          </div>
          <div className={s.destination} aria-live="polite">
            <span>
              {run.done
                ? "VOCÊ ESCREVEU ESSE CAMINHO"
                : selected && selected !== run.at
                  ? "A PRÓXIMA BIFURCAÇÃO"
                  : "UM PASSO ANTES DA DECISÃO"}
            </span>
            <h2>{node.title}</h2>
            <small>{node.place}</small>
            <p>{node.note}</p>
            {selected && selected !== run.at && !run.done ? (
              <div className={s.routePrice}>
                <span>
                  {node.energy > 0 ? "+" : ""}
                  {node.energy} fôlego
                </span>
                <span>+{node.trust} confiança</span>
              </div>
            ) : null}
          </div>
          {menu ? (
            <Action onClick={onStart}>Retomar a viagem</Action>
          ) : run.done ? (
            <>
              <div className={s.passportStamp}>
                CARREIRA
                <br />
                <b>VIVIDA</b>
                <span>{run.visited.length} CAPÍTULOS</span>
              </div>
              <Action
                onClick={() => {
                  storage.reset();
                  setSelected(null);
                }}
              >
                Explorar o outro caminho
              </Action>
            </>
          ) : (
            <>
              <Action
                disabled={!selected || !!reason}
                onClick={() => {
                  if (selected) {
                    update((current) => travel(current, selected));
                    setSelected(null);
                  }
                }}
              >
                Seguir por aqui
              </Action>
              <span className={s.routeWarning}>
                {selected && selected !== run.at
                  ? reason || "Ao seguir, a outra oportunidade fica para trás."
                  : "Toque em um ponto ligado à sua posição atual."}
              </span>
            </>
          )}
          <Help>
            Os caminhos têm custos e condições. O fôlego que sobra abre ou fecha
            oportunidades. Toque numa bifurcação para examinar o destino antes
            de viajar.
          </Help>
          <SaveNote saved={storage.saved} />
        </aside>
      </main>
    </section>
  );
}
