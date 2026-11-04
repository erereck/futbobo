"use client";
import { useRef } from "react";
import {
  CONTRACT_CLUBS,
  changeTerms,
  contractWeight,
  negotiate,
  newContract,
} from "./systems";
import {
  Action,
  Back,
  Club,
  Face,
  Help,
  Icon,
  SaveNote,
  Wordmark,
  useRun,
  type WorldProps,
} from "./shared";
import s from "./worlds.module.css";

export default function ContractWorld({ mode, onStart, onHome }: WorldProps) {
  const [run, update, storage] = useRun("contrato", newContract);
  const submitting = useRef(0);
  const club = CONTRACT_CLUBS[run.club];
  const weight = contractWeight(run);
  const settled = run.status === "signed" || run.status === "closed";
  const patch = (terms: Parameters<typeof changeTerms>[1]) => {
    submitting.current = 0;
    update((current) => changeTerms(current, terms));
  };
  const submit = () => {
    if (Date.now() - submitting.current < 250) return;
    submitting.current = Date.now();
    update((current) => negotiate(current));
  };
  if (mode === "menu")
    return (
      <section className={`${s.world} ${s.contractMenu}`}>
        <header className={s.worldHeader}>
          <Wordmark />
          <span>BASTIDORES / ESCRITÓRIO DO RAFA</span>
          <span className={s.wallClock}>18:42</span>
        </header>
        <main className={s.agentDesk}>
          <div className={s.deskNotebook}>
            <span>
              RAFA MENDES
              <br />
              GESTÃO DE CARREIRA
            </span>
            <i />
            <p>
              O clube escolhe
              <br />
              um jogador.
              <br />
              <b>
                Você escolhe
                <br />
                uma vida.
              </b>
            </p>
            <span>CAIO SILVA · PASTA 010</span>
          </div>
          <button type="button" className={s.careerFolder} onClick={onStart}>
            <span className={s.folderTab}>CAIO / ATACANTE</span>
            <div className={s.folderPaper}>
              <Club id={club.id} size={55} />
              <span>
                {run.status === "signed"
                  ? "CONTRATO ASSINADO"
                  : "PROPOSTA NA MESA"}
              </span>
              <strong>{club.name}</strong>
              <small>
                {run.terms.starter
                  ? "Titularidade em negociação"
                  : "Projeto de rotação"}{" "}
                · {run.terms.years} anos
              </small>
              <div>
                <span>SALÁRIO PROPOSTO</span>
                <b>
                  R$ {run.terms.salary}
                  <small> mil/mês</small>
                </b>
              </div>
              <span className={s.paperSignature}>Caio Silva</span>
            </div>
            <span className={s.folderOpen}>
              ABRIR A NEGOCIAÇÃO <Icon name="arrow-right" />
            </span>
          </button>
          <aside className={s.deskMessage}>
            <span className={s.paperclip} />
            <Face person="captain" />
            <p>
              “O dinheiro é uma parte. Pergunta onde você vai jogar. E por
              quanto tempo.”
            </p>
            <span>RAFA · SEU EMPRESÁRIO</span>
          </aside>
          <span className={s.deskPen} />
        </main>
        <footer className={s.deskFooter}>
          <button
            type="button"
            onClick={() => {
              storage.reset();
              submitting.current = 0;
              onStart();
            }}
          >
            Abrir uma nova negociação ↗
          </button>
          <span>3 CLUBES INTERESSADOS · UMA CARREIRA EM JOGO</span>
          <SaveNote saved={storage.saved} />
        </footer>
      </section>
    );
  return (
    <section className={`${s.world} ${s.contractGame}`}>
      <header className={s.contractHeader}>
        <Back onClick={onHome}>Escritório</Back>
        <span>JANELA DE TRANSFERÊNCIAS · JULHO DE 2026</span>
        <Wordmark />
      </header>
      <div className={s.contractWorkspace}>
        <aside className={s.agentRail}>
          <span className={s.smallLabel}>AS PROPOSTAS CHEGARAM.</span>
          <h1>
            Três propostas.
            <br />
            Qual é o seu plano?
          </h1>
          <nav className={s.clubFiles} aria-label="Selecionar proposta">
            {CONTRACT_CLUBS.map((c, i) => (
              <button
                type="button"
                key={c.id}
                aria-pressed={run.club === i}
                onClick={() => {
                  submitting.current = 0;
                  update(newContract(i));
                }}
              >
                <Club id={c.id} size={33} />
                <span>
                  <b>{c.name}</b>
                  <small>{c.city}</small>
                </span>
                <Icon name="arrow-right" size={16} />
              </button>
            ))}
          </nav>
          <div className={s.agentAdvice}>
            <Face person="captain" />
            <p>“{club.phrase}”</p>
            <span>LEITURA DO EMPRESÁRIO</span>
          </div>
          <Help>
            Edite o salário, a duração e as condições no documento. Pedir tudo
            cobra uma contraproposta. Depois de três recusas, o clube retira o
            convite. Trocar de pasta abre uma negociação nova.
          </Help>
        </aside>
        <main className={s.contractPaper}>
          <header>
            <Club id={club.id} size={47} />
            <div>
              <b>{club.name.toUpperCase()}</b>
              <span>DEPARTAMENTO DE FUTEBOL</span>
            </div>
            <span>
              CONFIDENCIAL
              <br />
              Nº 010 / 2026
            </span>
          </header>
          <div className={s.contractTitle}>
            <span>CONTRATO DE TRABALHO DESPORTIVO</span>
            <h2>
              Condições propostas
              <br />
              para Caio Silva.
            </h2>
          </div>
          <p className={s.contractIntro}>
            Entre <b>{club.name}</b> e <b>Caio Silva</b>, atleta profissional de
            18 anos, ficam propostas as seguintes condições:
          </p>
          <div className={s.salaryClause}>
            <span>01 / REMUNERAÇÃO MENSAL</span>
            <label>
              <b>
                R$ {run.terms.salary}
                <small> mil</small>
              </b>
              <input
                type="range"
                min="18"
                max="54"
                step="3"
                value={run.terms.salary}
                disabled={settled}
                onChange={(e) => patch({ salary: Number(e.target.value) })}
                aria-label="Salário em milhares de reais por mês"
              />
            </label>
            <div>
              <span>R$ 18 MIL</span>
              <span>R$ 54 MIL</span>
            </div>
          </div>
          <div className={s.termClause}>
            <span>02 / DURAÇÃO DO VÍNCULO</span>
            <div>
              {[1, 2, 3].map((year) => (
                <button
                  type="button"
                  key={year}
                  aria-pressed={run.terms.years === year}
                  disabled={settled}
                  onClick={() => patch({ years: year })}
                >
                  {year} ano{year > 1 ? "s" : ""}
                  <small>
                    {year === 1
                      ? "Mais liberdade"
                      : year === 2
                        ? "Meio-termo"
                        : "Projeto longo"}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <div className={s.contractClauses}>
            <span>03 / CONDIÇÕES NEGOCIADAS</span>
            <label>
              <input
                type="checkbox"
                checked={run.terms.starter}
                disabled={settled}
                onChange={(e) => patch({ starter: e.target.checked })}
              />
              <span>
                <b>Garantia de titularidade</b>
                <small>O clube se compromete a te dar protagonismo.</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={run.terms.release}
                disabled={settled}
                onChange={(e) => patch({ release: e.target.checked })}
              />
              <span>
                <b>Saída facilitada</b>
                <small>Uma proposta maior não pode te prender aqui.</small>
              </span>
            </label>
          </div>
          <footer className={s.contractSignLine}>
            <span>
              {run.status === "signed" ? "Caio Silva" : "__________________"}
              <small>ATLETA</small>
            </span>
            <span>
              {run.status === "signed" ? club.name : "__________________"}
              <small>CLUBE</small>
            </span>
          </footer>
          {run.status === "signed" ? (
            <div className={s.signedStamp}>
              ACORDO
              <br />
              <b>FECHADO</b>
            </div>
          ) : run.status === "counter" ? (
            <div className={s.counterStamp}>
              REVISADO
              <br />
              <b>PELO CLUBE</b>
            </div>
          ) : null}
        </main>
        <aside className={s.negotiationRail}>
          <div className={s.negotiationState}>
            <span>NA OUTRA PONTA DA MESA</span>
            <h2>
              {settled
                ? run.status === "signed"
                  ? "A camisa tem um novo dono."
                  : "Essa porta fechou."
                : weight <= club.cap
                  ? "A conversa está aberta."
                  : weight <= club.cap + 4
                    ? "Vai precisar ceder."
                    : "O clube vai resistir."}
            </h2>
            <div className={s.paperTension}>
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} data-lit={i < Math.ceil(weight / 3)} />
              ))}
            </div>
            <p>{run.reply}</p>
          </div>
          <div className={s.negotiationTrade}>
            <span>O QUE VOCÊ ESTÁ PRIORIZANDO</span>
            <div>
              <Icon name="wallet" />
              <b>
                {run.terms.salary > club.base
                  ? "Renda maior"
                  : "Projeto viável"}
              </b>
            </div>
            <div>
              <Icon name="player" />
              <b>
                {run.terms.starter ? "Minutos garantidos" : "Disputar o espaço"}
              </b>
            </div>
            <div>
              <Icon name="career" />
              <b>
                {run.terms.years === 1 || run.terms.release
                  ? "Liberdade para sair"
                  : "Construir algo longo"}
              </b>
            </div>
          </div>
          <div aria-live="polite" className={s.negotiationSubmit}>
            {settled ? (
              <Action
                onClick={() => {
                  storage.reset();
                  submitting.current = 0;
                }}
              >
                Outra proposta, outra vida
              </Action>
            ) : (
              <Action onClick={submit}>
                {run.status === "counter"
                  ? "Aceitar a contraproposta"
                  : "Devolver ao clube"}
              </Action>
            )}
            <small>
              {run.rounds} / 3 rodadas de negociação
              {run.status === "counter" ? " · edite um termo para reabrir" : ""}
            </small>
          </div>
          <SaveNote saved={storage.saved} />
        </aside>
      </div>
    </section>
  );
}
