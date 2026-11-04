"use client";
import {
  dialoguePhrase,
  keepPromise,
  listen,
  newDialogue,
  speak,
  type DialogueTopic,
} from "./systems";
import {
  Action,
  Back,
  Club,
  Figure,
  Help,
  Icon,
  SaveNote,
  Wordmark,
  useRun,
  type WorldProps,
} from "./shared";
import s from "./worlds.module.css";

export default function DialogueWorld({ mode, onStart, onHome }: WorldProps) {
  const [run, update, storage] = useRun("entrelinhas", newDialogue);
  const followup = {
    chance: {
      situation:
        "Sexta, no aquecimento, a dor voltou. O médico pergunta na frente do professor se está tudo bem. Você quer muito aquela vaga.",
      keep: "Contar sobre a dor",
      shortcut: "Esconder e fazer o treino",
    },
    rotacao: {
      situation:
        "Seu concorrente fez dois gols no treino. Você vê o vídeo de casa, ainda em recuperação. O próximo lugar na lista está em disputa.",
      keep: "Seguir a recuperação",
      shortcut: "Voltar a treinar escondido",
    },
    saida: {
      situation:
        "O Sport quer uma resposta até hoje. Rafa diz que pode acertar tudo por fora. O professor ainda não sabe dessa ligação.",
      keep: "Telefonar para o professor",
      shortcut: "Acertar antes de avisar",
    },
  }[run.topic];
  const mood = run.done
    ? run.trust > 65
      ? 2
      : 10
    : run.scene
      ? run.trust > 55
        ? 1
        : 0
      : 1;
  if (mode === "menu")
    return (
      <section className={`${s.world} ${s.busMenu}`}>
        <header className={s.worldHeader}>
          <Wordmark />
          <span>ENTRELINHAS / DOMINGO, 06:40</span>
          <Club id="flamengo" />
        </header>
        <div className={s.busWindow}>
          <span className={s.busSun} />
          <div className={s.busHorizon} />
          <span>
            PRÓXIMA PARADA
            <br />
            <b>O VESTIÁRIO.</b>
          </span>
        </div>
        <main className={s.busSeats}>
          <div className={s.busSeat}>
            <Figure person="captain" mood={4} />
            <span>ANDRÉ / CAPITÃO</span>
          </div>
          <button
            type="button"
            className={`${s.busSeat} ${s.yourBusSeat}`}
            onClick={onStart}
          >
            <Figure person="caio" mood={1} />
            <span className={s.busTicket}>
              <small>SEU LUGAR ESTÁ GUARDADO</small>
              <strong>Caio Silva</strong>
              <span>
                {run.scene
                  ? "O combinado ainda importa."
                  : "O professor quer conversar."}
              </span>
              <b>
                Sentar e continuar <Icon name="arrow-right" size={19} />
              </b>
            </span>
          </button>
          <div className={s.busSeat}>
            <span className={s.emptySeatNumber}>12</span>
            <button
              type="button"
              onClick={() => {
                storage.reset();
                onStart();
              }}
            >
              Outra história
              <br />
              <b>+</b>
            </button>
          </div>
        </main>
        <footer className={s.busFooter}>
          <span>
            Nem tudo que muda um jogo
            <br />
            acontece com a bola.
          </span>
          <span>
            CONFIRMAÇÃO DA DELEGAÇÃO
            <br />
            <b>CAIO SILVA · ATACANTE · 18 ANOS</b>
          </span>
          <SaveNote saved={storage.saved} />
        </footer>
      </section>
    );
  return (
    <section className={`${s.world} ${s.dialogueGame}`}>
      <header className={s.dialogueHeader}>
        <Back onClick={onHome}>Ônibus da equipe</Back>
        <span>
          {run.scene === 0
            ? "DEPOIS DO TREINO"
            : run.scene === 1
              ? "UMA SEMANA DEPOIS"
              : "NA PRÓXIMA LISTA"}
        </span>
        <Wordmark />
      </header>
      <main className={s.conversationStage}>
        <div className={s.trainingGround}>
          <span />
          <i />
          <b />
        </div>
        <div className={s.dialogueContext}>
          <span>PROFESSOR SÉRGIO</span>
          <small>Treinador do profissional</small>
          <div>
            <i data-warm={run.trust >= 55} />
            <span>
              {run.trust >= 70
                ? "A palavra ganhou peso."
                : run.trust >= 55
                  ? "Ele está aberto a te ouvir."
                  : "A relação pede cuidado."}
            </span>
          </div>
        </div>
        <div className={s.dialoguePlayer}>
          <Figure person="caio" mood={run.done ? 4 : 1} />
          <span>CAIO / VOCÊ</span>
        </div>
        <div className={s.dialogueCoach}>
          <Figure person="coach" mood={mood} />
          <span>PROFESSOR SÉRGIO</span>
        </div>
        <div className={s.coachSpeech} aria-live="polite">
          <span>
            {run.done
              ? "O QUE FICOU DESSA CONVERSA"
              : run.scene === 1
                ? "O COMBINADO VAI SER TESTADO"
                : run.heard.length
                  ? "ELE ESTÁ TE DIZENDO ALGO"
                  : "ANTES DE RESPONDER, ESCUTE."}
          </span>
          <p>{run.reply}</p>
          {run.heard.includes("coach") && !run.scene ? (
            <small>
              <Icon name="medical" size={15} /> Você descobriu: o médico pediu
              cautela.
            </small>
          ) : null}
        </div>
        {run.scene === 0 ? (
          <div className={s.listenActions}>
            <button
              type="button"
              disabled={run.heard.includes("coach")}
              onClick={() => update((current) => listen(current, "coach"))}
            >
              <Icon
                name={run.heard.includes("coach") ? "check" : "hourglass"}
                size={18}
              />
              {run.heard.includes("coach")
                ? "Você ouviu o motivo"
                : "Ouvir o professor"}
            </button>
            <button
              type="button"
              disabled={run.heard.includes("captain")}
              onClick={() => update((current) => listen(current, "captain"))}
            >
              <Icon
                name={run.heard.includes("captain") ? "check" : "team"}
                size={18}
              />
              {run.heard.includes("captain")
                ? "Conselho guardado"
                : "Puxar o capitão de lado"}
            </button>
          </div>
        ) : null}
      </main>
      <section className={s.responseStage}>
        {run.done ? (
          <div className={s.dialogueResolution}>
            <span>A CONVERSA VIROU RELAÇÃO.</span>
            <h1>
              {run.trust >= 65
                ? run.topic === "saida"
                  ? "Sua palavra atravessou a transferência."
                  : "O combinado abriu uma porta."
                : "A próxima conversa começa daqui."}
            </h1>
            <p>
              {run.outcome} Confiança: {run.trust}.
            </p>
            <Action onClick={storage.reset}>
              Viver a conversa de outro jeito
            </Action>
          </div>
        ) : run.scene === 1 ? (
          <div className={s.promiseStage}>
            <span>TRÊS DIAS DEPOIS / O COMBINADO FOI ESSE:</span>
            <h1>{run.promise}.</h1>
            <p>{followup.situation}</p>
            <div>
              <Action
                onClick={() => update((current) => keepPromise(current, true))}
              >
                {followup.keep}
              </Action>
              <button
                type="button"
                onClick={() => update((current) => keepPromise(current, false))}
              >
                {followup.shortcut} <span>↗</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={s.sentenceComposer}>
              <span>O QUE VOCÊ QUER PEDIR?</span>
              <div className={s.topicTabs}>
                {(
                  [
                    ["chance", "Uma chance"],
                    ["rotacao", "Respeitar o tempo"],
                    ["saida", "Buscar minutos"],
                  ] as [DialogueTopic, string][]
                ).map(([id, title]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={run.topic === id}
                    onClick={() =>
                      update((current) => ({ ...current, topic: id }))
                    }
                  >
                    {title}
                  </button>
                ))}
              </div>
              <div className={s.toneSlider}>
                <label>
                  COMO VOCÊ VAI FALAR
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="1"
                    value={run.tone}
                    onChange={(e) =>
                      update((current) => ({
                        ...current,
                        tone: Number(e.target.value),
                      }))
                    }
                    aria-label="Tom da conversa"
                  />
                </label>
                <div>
                  <span>Com cuidado</span>
                  <span>Direto</span>
                  <span>Confrontando</span>
                </div>
              </div>
            </div>
            <div className={s.yourSpeech}>
              <span>A SUA VOZ</span>
              <p>“{dialoguePhrase(run)}”</p>
              <Action onClick={() => update(speak)}>Dizer isso para ele</Action>
            </div>
          </>
        )}
        <div className={s.dialogueFoot}>
          <Help>
            Ouvir revela contexto. Combine o pedido com um tom. O professor
            reage à forma e à intenção. Depois, sua promessa será cobrada numa
            situação seguinte.
          </Help>
          <SaveNote saved={storage.saved} />
        </div>
      </section>
    </section>
  );
}
