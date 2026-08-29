from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)

# ------------------------------------------------------------------ types.ts
path = Path("app/botao/types.ts")
text = path.read_text()
text = replace_once(
    text,
    '  /** Quando presente, a partida começa com o jogador saindo do banco. */\n  entry?: BotaoMatchEntry;\n',
    '  /** Quando presente, a partida começa com o jogador saindo do banco. */\n  entry?: BotaoMatchEntry;\n  /** Metadado de carreira: o adversário é um ex-clube do protagonista. */\n  formerClub?: { id: string; name: string; shortName: string };\n',
    "setup formerClub",
)
text = replace_once(
    text,
    '  /** Clipes vetoriais de baixa frequência: apenas os segundos que antecedem cada gol. */\n  replays?: BotaoGoalReplay[];\n',
    '  /** Clipes vetoriais de baixa frequência: apenas os segundos que antecedem cada gol. */\n  replays?: BotaoGoalReplay[];\n  /** Como o protagonista reagiu a cada gol marcado contra um ex-clube. */\n  formerClubCelebrations?: Array<"celebrate" | "respect">;\n  /** Quantidade de gols do protagonista contra o ex-clube nesta partida. */\n  formerClubGoalCount?: number;\n',
    "result formerClub fields",
)
path.write_text(text)

# --------------------------------------------------------------- adapter.ts
path = Path("app/botao/adapter.ts")
text = path.read_text()
start = text.index("export function buildFinalSetup")
end = text.index("export function buildNationalMatchSetup", start)
segment = text[start:end]
segment = replace_once(
    segment,
    '  visuals?: BotaoMatchSetup["visuals"];\n',
    '  visuals?: BotaoMatchSetup["visuals"];\n  formerClub?: boolean;\n',
    "buildFinalSetup formerClub arg",
)
segment = replace_once(
    segment,
    '    visuals: args.visuals,\n',
    '    visuals: args.visuals,\n    formerClub: args.formerClub\n      ? { id: args.opponent.id, name: args.opponent.name, shortName: args.opponent.shortName }\n      : undefined,\n',
    "buildFinalSetup formerClub output",
)
text = text[:start] + segment + text[end:]
path.write_text(text)

# ------------------------------------------------------------- CareerGame.tsx
path = Path("app/components/career/CareerGame.tsx")
text = path.read_text()
helper = '''function isFormerClubOpponent(state: GameState, clubId: string) {\n  if (!clubId || clubId === state.currentClubId) return false;\n  return (\n    state.history.some((record) => record.clubId === clubId) ||\n    state.transferHistory.some((record) => record.fromClubId === clubId || record.toClubId === clubId)\n  );\n}\n\n'''
text = replace_once(
    text,
    "export default function CareerGame({ initialHallEntry = null, onCloseHallPreview }: CareerGameProps = {}) {\n",
    helper + "export default function CareerGame({ initialHallEntry = null, onCloseHallPreview }: CareerGameProps = {}) {\n",
    "former club helper",
)
text = replace_once(
    text,
    '    const club = clubById(state.currentClubId);\n    const opponent = clubById(match.opponentId);\n    return buildFinalSetup({\n',
    '    const club = clubById(state.currentClubId);\n    const opponent = clubById(match.opponentId);\n    const formerClub = match.source === "club" && isFormerClubOpponent(state, opponent.id);\n    return buildFinalSetup({\n',
    "setup former club detection",
)
# Insert into the first club buildFinalSetup object after stageName.
setup_anchor = '      stageName: match.stageName,\n'
setup_pos = text.index(setup_anchor, text.index('const formerClub = match.source === "club"'))
text = text[: setup_pos + len(setup_anchor)] + '      formerClub,\n' + text[setup_pos + len(setup_anchor) :]
old_former = '''      const formerClub = match.source === "club" && current.history.some((record) => record.clubId === match.opponentId)\n        ? clubById(match.opponentId)\n        : null;\n'''
new_former = '''      const formerClub = match.source === "club" && isFormerClubOpponent(current, match.opponentId)\n        ? clubById(match.opponentId)\n        : null;\n'''
text = replace_once(text, old_former, new_former, "result former club detection")
text = replace_once(
    text,
    '          : interviewEligible && matchResult.manOfTheMatch && resolvedSetup\n            ? buildPressConference(current, match, matchResult, resolvedSetup.cpuTeam.shortName)\n',
    '          : interviewEligible && (matchResult.manOfTheMatch || matchResult.playerGoals >= 3) && resolvedSetup\n            ? buildPressConference(current, match, matchResult, resolvedSetup.cpuTeam.shortName)\n',
    "hat trick interview eligibility",
)
path.write_text(text)

# --------------------------------------------------------------- BotaoMatch.tsx
path = Path("app/botao/BotaoMatch.tsx")
text = path.read_text()
text = replace_once(
    text,
    '  const goalReplaysRef = useRef<BotaoGoalReplay[]>([]);\n',
    '  const goalReplaysRef = useRef<BotaoGoalReplay[]>([]);\n  const formerClubCelebrationsRef = useRef<Array<"celebrate" | "respect">>([]);\n  const formerClubPromptRef = useRef(false);\n',
    "former club refs",
)
text = replace_once(
    text,
    '  const [paused, setPaused] = useState(false);\n  const pausedRef = useRef(false);\n',
    '  const [paused, setPaused] = useState(false);\n  const [formerClubGoalPrompt, setFormerClubGoalPrompt] = useState<{ goalNumber: number } | null>(null);\n  const pausedRef = useRef(false);\n',
    "former club state",
)
callback = '''  const chooseFormerClubCelebration = useCallback((choice: "celebrate" | "respect") => {\n    formerClubCelebrationsRef.current.push(choice);\n    formerClubPromptRef.current = false;\n    setFormerClubGoalPrompt(null);\n    const clubName = setup.formerClub?.shortName ?? "ex-clube";\n    if (choice === "celebrate") {\n      setAnnouncement(`Você comemorou o gol contra o ${clubName}. A reação das arquibancadas mudou na hora.`);\n      showFlash("COMEMOROU!", "goal", 1050);\n    } else {\n      setAnnouncement(`Você segurou a comemoração contra o ${clubName} em respeito à sua história no clube.`);\n      showFlash("SEM COMEMORAR", "info", 1050);\n    }\n    bump();\n  }, [bump, setup.formerClub?.shortName, showFlash]);\n\n'''
text = replace_once(
    text,
    '  // Assinatura do motor: muda só quando a partida realmente avança. É o que\n',
    callback + '  // Assinatura do motor: muda só quando a partida realmente avança. É o que\n',
    "celebration callback",
)
text = replace_once(
    text,
    '          setAnnouncement(`${text} ${event.scorer}. Placar ${machine.score.user} a ${machine.score.cpu}.`);\n',
    '          setAnnouncement(`${text} ${event.scorer}. Placar ${machine.score.user} a ${machine.score.cpu}.`);\n          if (!localMatch && mine && event.byUser && setup.formerClub) {\n            formerClubPromptRef.current = true;\n            setFormerClubGoalPrompt({ goalNumber: formerClubCelebrationsRef.current.length + 1 });\n          }\n',
    "goal prompt trigger",
)
text = replace_once(
    text,
    '    [bump, localMatch, machine, playerNames, showFlash],\n',
    '    [bump, localMatch, machine, playerNames, setup.formerClub, showFlash],\n',
    "goal callback deps",
)
text = replace_once(
    text,
    '      if (pausedRef.current) {\n        timersRef.current.goal = window.setTimeout(resumeGoal, 120);\n',
    '      if (pausedRef.current || formerClubPromptRef.current) {\n        timersRef.current.goal = window.setTimeout(resumeGoal, 120);\n',
    "goal timer wait",
)
text = replace_once(
    text,
    '    if (!state || state.phase !== "finished" || !state.result || finishedRef.current) return;\n',
    '    if (!state || state.phase !== "finished" || !state.result || finishedRef.current || formerClubPromptRef.current) return;\n',
    "finish waits for prompt",
)
text = replace_once(
    text,
    '    const result = { ...state.result, replays: goalReplaysRef.current.map((replay) => ({\n',
    '    const result = {\n      ...state.result,\n      formerClubCelebrations: formerClubCelebrationsRef.current.slice(),\n      formerClubGoalCount: formerClubCelebrationsRef.current.length,\n      replays: goalReplaysRef.current.map((replay) => ({\n',
    "result celebration memory",
)
# Close object formatting stays valid because the existing `})) };` closes replays + object.
text = replace_once(
    text,
    '  }, [signature, showFlash, localMatch]);\n\n  // -------------------------------------------------------------- interação\n',
    '  }, [signature, showFlash, localMatch, formerClubGoalPrompt]);\n\n  // -------------------------------------------------------------- interação\n',
    "finish deps",
)
popup = '''      {formerClubGoalPrompt && setup.formerClub && (\n        <div className="botao-former-club-decision" role="dialog" aria-modal="true" aria-label="Comemoração contra ex-clube">\n          <div className="botao-former-club-card">\n            <small>LEI DO EX · {formerClubGoalPrompt.goalNumber}º GOL</small>\n            <strong>Gol contra o {setup.formerClub.shortName}</strong>\n            <p>Você passou por esse clube. O estádio está olhando para a sua reação.</p>\n            <div className="botao-former-club-actions">\n              <button type="button" className="botao-former-celebrate" onClick={() => chooseFormerClubCelebration("celebrate")}>\n                <b>🔥 Comemorar</b>\n                <span>Assume a camisa atual e aceita a reação.</span>\n              </button>\n              <button type="button" className="botao-former-respect" onClick={() => chooseFormerClubCelebration("respect")}>\n                <b>🤝 Não comemorar</b>\n                <span>Respeita sua história com o ex-clube.</span>\n              </button>\n            </div>\n          </div>\n        </div>\n      )}\n\n'''
text = replace_once(
    text,
    '      <div\n        className={`botao-table-wrapper ${desktopLandscape ? "botao-table-landscape" : ""} ${shaking ? "botao-shake" : ""}`}\n',
    popup + '      <div\n        className={`botao-table-wrapper ${desktopLandscape ? "botao-table-landscape" : ""} ${shaking ? "botao-shake" : ""}`}\n',
    "popup JSX",
)
path.write_text(text)

# ---------------------------------------------------------------- botao.css
path = Path("app/botao/botao.css")
text = path.read_text()
css = r'''

/* Decisão contextual da Lei do Ex. A partida fica parada até o jogador escolher. */
.botao-former-club-decision {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(3, 10, 7, 0.76);
  backdrop-filter: blur(8px);
  animation: botao-former-in 180ms ease-out both;
}

.botao-former-club-card {
  width: min(100%, 430px);
  padding: 20px;
  border: 1px solid rgba(255, 199, 44, 0.32);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(20, 48, 35, 0.98), rgba(8, 25, 17, 0.98));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
  text-align: left;
}

.botao-former-club-card small {
  display: block;
  margin-bottom: 8px;
  color: var(--gold, #ffc72c);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.botao-former-club-card > strong {
  display: block;
  font: 900 clamp(22px, 7vw, 30px)/1 var(--display, "Arial Black", Impact, sans-serif);
  letter-spacing: -0.035em;
}

.botao-former-club-card > p {
  margin: 10px 0 16px;
  color: var(--muted, #9fb3a6);
  font-size: 13px;
  line-height: 1.45;
}

.botao-former-club-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.botao-former-club-actions button {
  display: flex;
  min-height: 92px;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 13px;
  border-radius: 15px;
  color: var(--text, #f5f7f2);
  cursor: pointer;
  text-align: left;
}

.botao-former-club-actions b { font-size: 13px; }
.botao-former-club-actions span { color: var(--muted, #9fb3a6); font-size: 10.5px; line-height: 1.35; }
.botao-former-celebrate { border: 1px solid rgba(255, 199, 44, 0.38); background: rgba(255, 199, 44, 0.1); }
.botao-former-respect { border: 1px solid rgba(168, 211, 181, 0.22); background: rgba(168, 211, 181, 0.06); }
.botao-former-club-actions button:active { transform: scale(0.985); }

@keyframes botao-former-in {
  from { opacity: 0; transform: scale(1.025); }
  to { opacity: 1; transform: scale(1); }
}

@media (max-width: 420px) {
  .botao-former-club-actions { grid-template-columns: 1fr; }
  .botao-former-club-actions button { min-height: 70px; }
}

@media (prefers-reduced-motion: reduce) {
  .botao-former-club-decision { animation: none; }
}
'''
if ".botao-former-club-decision" in text:
    raise SystemExit("former club CSS already present")
path.write_text(text.rstrip() + css + "\n")

# ------------------------------------------------------- press-conferences.ts
path = Path("app/career/press-conferences.ts")
text = path.read_text()
insert_before = "function wasComebackVictory(result: BotaoMatchResult) {\n"
extras = '''const HAT_TRICK_ANSWERS: AnswerDraft[] = [\n  { label: "Hoje tudo que eu tentei parecia terminar dentro do gol", tone: "bold", toneLabel: "Abraça a noite", result: "A frase vira a síntese de uma atuação que ninguém consegue ignorar.", effect: { reputation: 8, morale: 6, followers: 70_000 } },\n  { label: "Três gols são bonitos, mas eu quero que lembrem da vitória", tone: "team", toneLabel: "Puxa para o coletivo", result: "O vestiário gosta de ver o feito individual colocado dentro do resultado do time.", effect: { leadership: 8, fans: 4, morale: 3 } },\n  { label: "O terceiro foi o momento em que eu percebi que era uma noite diferente", tone: "calm", toneLabel: "Reconhece o momento", result: "A resposta soa segura e dá peso ao hat-trick sem transformar a fala em provocação.", effect: { mediaRelation: 6, reputation: 4, morale: 3 } },\n  { label: "Eu queria o quarto", tone: "bold", toneLabel: "Nunca basta", result: "A ambição agrada parte da torcida e aumenta a imagem de atacante insaciável.", effect: { reputation: 7, followers: 48_000, discipline: -1 } },\n  { label: "Guardo a bola, mas divido a noite com quem me colocou na cara do gol", tone: "team", toneLabel: "Divide o hat-trick", result: "Companheiros e torcida compram o discurso de gratidão.", effect: { leadership: 7, mediaRelation: 4, fans: 4 } },\n];\n\nfunction hatTrickQuestion(state: GameState, match: PendingBotaoMatch, result: BotaoMatchResult, opponentName: string): PressQuestion {\n  const goalsLabel = result.playerGoals === 3 ? "hat-trick" : `${result.playerGoals} gols`;\n  return question(state, "hat-trick", match.season * 2153 + match.id.length,\n    [\n      `Você marcou ${goalsLabel} contra o ${opponentName}. A bola da partida já foi separada para você.`,\n      `O placar guarda ${result.playerGoals} gols seus. Foi uma atuação fora da curva até para os seus padrões.`,\n      `Cada vez que você chegou perto da área, o estádio começou a esperar outro gol. Foram ${result.playerGoals} no total.`,\n    ],\n    [\n      "Em qual gol você percebeu que estava vivendo uma noite de hat-trick?",\n      "O que muda na cabeça de um jogador depois de marcar três vezes na mesma partida?",\n      result.playerGoals > 3 ? `Depois do terceiro, você ainda estava pensando no quarto e no quinto?` : "Depois do segundo, você já estava procurando o terceiro?",\n    ], HAT_TRICK_ANSWERS);\n}\n\nconst FORMER_CELEBRATE_ANSWERS: AnswerDraft[] = [\n  { label: "Eu respeito minha história, mas hoje defendo outra camisa", tone: "bold", toneLabel: "Não pede desculpas", result: "A torcida atual adota a frase; parte da antiga entende como uma ruptura definitiva.", effect: { fans: 8, reputation: 5, followers: 60_000, mediaRelation: -2 } },\n  { label: "Foi emoção do jogo. Eu não planejei nada", tone: "calm", toneLabel: "Tira o peso", result: "A resposta reduz a temperatura sem negar que a comemoração aconteceu.", effect: { mediaRelation: 6, discipline: 3, fans: 2 } },\n  { label: "Quem me conhece sabe o carinho que eu tenho pelo clube", tone: "team", toneLabel: "Preserva a ponte", result: "A fala recupera parte do carinho sem enfraquecer o compromisso com o time atual.", effect: { leadership: 4, mediaRelation: 5, morale: 2 } },\n  { label: "Se doeu, é porque esse jogo significava muito para todo mundo", tone: "bold", toneLabel: "Aumenta a rivalidade", result: "A declaração vira corte de vídeo e garante que o próximo reencontro venha carregado.", effect: { reputation: 7, followers: 85_000, discipline: -4, mediaRelation: -4 } },\n];\n\nconst FORMER_RESPECT_ANSWERS: AnswerDraft[] = [\n  { label: "Eu não conseguiria apagar o que vivi aqui por causa de um gol", tone: "team", toneLabel: "Mostra carinho", result: "A antiga torcida reconhece o gesto e o reencontro perde parte da hostilidade.", effect: { leadership: 7, mediaRelation: 7, fans: 2 } },\n  { label: "Não comemorar não significa que eu não queria vencer", tone: "calm", toneLabel: "Separa respeito e competição", result: "A resposta é tratada como maturidade competitiva.", effect: { discipline: 5, reputation: 3, mediaRelation: 5 } },\n  { label: "Na hora eu lembrei de muita gente que ainda trabalha lá", tone: "team", toneLabel: "Lembra das pessoas", result: "O gesto ganha uma leitura humana em vez de virar apenas protocolo de futebol.", effect: { leadership: 6, morale: 3, mediaRelation: 6 } },\n  { label: "O respeito termina no apito; durante o jogo eu queria fazer outro", tone: "bold", toneLabel: "Respeita sem aliviar", result: "A torcida atual gosta do equilíbrio entre memória e competitividade.", effect: { fans: 5, reputation: 5, discipline: 2 } },\n];\n\nfunction formerCelebrationQuestion(state: GameState, match: PendingBotaoMatch, result: BotaoMatchResult, formerClub: Club): PressQuestion | null {\n  const choices = result.formerClubCelebrations ?? [];\n  if (!choices.length) return null;\n  const celebrated = choices.filter((choice) => choice === "celebrate").length;\n  const respected = choices.length - celebrated;\n  if (celebrated > 0 && respected > 0) {\n    return question(state, "former-celebration-mixed", match.season * 2273 + match.id.length,\n      [\n        `Você marcou mais de uma vez contra o ${formerClub.shortName}: em um gol segurou a comemoração e em outro deixou a emoção sair.`,\n        `Sua relação com o ${formerClub.shortName} apareceu até nas comemorações: houve respeito em um momento e explosão em outro.`,\n      ],\n      [\n        "Por que sua reação mudou de um gol para o outro?",\n        "O que fez o respeito virar comemoração durante a mesma partida?",\n      ], [...FORMER_CELEBRATE_ANSWERS, ...FORMER_RESPECT_ANSWERS]);\n  }\n  if (celebrated > 0) {\n    return question(state, "former-celebration", match.season * 2281 + match.id.length,\n      [\n        `Você marcou contra o ${formerClub.shortName} e comemorou. A imagem dividiu imediatamente as duas torcidas.`,\n        `Seu gol contra o ex-clube veio acompanhado de uma comemoração sem esconder a emoção.`,\n      ],\n      [\n        "Você pensou por um segundo em não comemorar?",\n        `O que você diria para o torcedor do ${formerClub.shortName} que se incomodou com a comemoração?`,\n        "Comemorar foi uma forma de mostrar que esse capítulo da carreira acabou?",\n      ], FORMER_CELEBRATE_ANSWERS);\n  }\n  return question(state, "former-respect", match.season * 2293 + match.id.length,\n    [\n      `Você marcou contra o ${formerClub.shortName}, mas conteve a comemoração enquanto seus companheiros corriam até você.`,\n      `A bola entrou contra seu ex-clube e sua primeira reação foi não comemorar. O gesto foi notado pelo estádio inteiro.`,\n    ],\n    [\n      "Foi respeito, carinho ou simplesmente uma decisão do momento?",\n      `O que o ${formerClub.shortName} ainda representa para você?`,\n      "Foi difícil segurar a comemoração em uma partida tão importante?",\n    ], FORMER_RESPECT_ANSWERS);\n}\n\n'''
text = replace_once(text, insert_before, extras + insert_before, "press extras")
# Hat-trick-only conference for the rare case of 3+ goals without MOTM (e.g. defeat).
text = replace_once(
    text,
    'export function buildPressConference(state: GameState, match: PendingBotaoMatch, result: BotaoMatchResult, opponentName: string): PressConference {\n  const wonTitle = result.champion && match.stageName === "Final";\n',
    'export function buildPressConference(state: GameState, match: PendingBotaoMatch, result: BotaoMatchResult, opponentName: string): PressConference {\n  if (!result.manOfTheMatch && result.playerGoals >= 3) {\n    return {\n      kind: "post-match",\n      matchId: match.id,\n      competitionName: match.competitionName,\n      opponentName,\n      questionIndex: 0,\n      questions: [hatTrickQuestion(state, match, result, opponentName)],\n    };\n  }\n  const wonTitle = result.champion && match.stageName === "Final";\n',
    "hat trick only conference",
)
# Append guaranteed hat-trick question after the existing guaranteed comeback question block.
return_anchor = '''  return {\n    kind: "post-match",\n    matchId: match.id,\n'''
return_pos = text.index(return_anchor, text.index("export function buildPressConference"))
text = text[:return_pos] + '  if (result.playerGoals >= 3) {\n    questions.push(hatTrickQuestion(state, match, result, opponentName));\n  }\n' + text[return_pos:]
# Former-club generic law-of-ex prompt no longer pretends the celebration was hypothetical.
text = text.replace(
    '["Por que a lei do ex parece funcionar tanto?", "Você pensou em comemorar contra o antigo clube?", "Esse gol foi mais pessoal do que os outros?"]',
    '["Por que a lei do ex parece funcionar tanto?", "Marcar contra quem conhece seu jogo torna o gol diferente?", "Esse gol foi mais pessoal do que os outros?"]',
    1,
)
# Append celebration memory + hat trick to former-club conference, guaranteed.
former_map = '''  const questions = ordered(candidates, state, match.season * 2237 + match.id.length).slice(0, count).map((entry, index) => ({\n    id: entry.id,\n    context: entry.context,\n    question: pick(entry.prompts, state.seed, match.season * 2251 + index * 19),\n    answers: formerAnswers(state, match.season * 2267 + index * 23),\n  }));\n'''
former_new = former_map + '''  const celebration = formerCelebrationQuestion(state, match, result, formerClub);\n  if (celebration) questions.push(celebration);\n  if (result.playerGoals >= 3) questions.push(hatTrickQuestion(state, match, result, formerClub.shortName));\n'''
text = replace_once(text, former_map, former_new, "former guaranteed questions")
path.write_text(text)

print("Smart Law of Ex patch applied")
