import type { PressConference } from "../../career/model";
import FutboboIcon from "../FutboboIcon";
import styles from "./CareerOverlays.module.css";

type Props = {
  conference: PressConference;
  onAnswer: (answerIndex: number) => void;
};

const COPY = {
  "post-match": { eyebrow: "ZONA MISTA", title: "A palavra é sua" },
  presentation: { eyebrow: "COLETIVA DE APRESENTAÇÃO", title: "Primeiras palavras" },
  "former-club": { eyebrow: "REENCONTRO", title: "Depois do apito" },
  betrayal: { eyebrow: "TRANSFERÊNCIA ENTRE RIVAIS", title: "A cidade quer uma resposta" },
} as const;

export default function PressConferenceDialog({ conference, onAnswer }: Props) {
  const kind = conference.kind ?? "post-match";
  const copy = COPY[kind];
  const question = conference.questions[conference.questionIndex];
  if (!question) return null;

  return (
    <div className={styles.backdrop} role="presentation">
      <section aria-labelledby="press-question" aria-modal="true" className={styles.dialog} role="dialog">
        <header className={styles.pressHero}>
          <div className={styles.iconTile}><FutboboIcon name="microphone" size={24} /></div>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h2 className={styles.heroTitle}>{copy.title}</h2>
          </div>
          <span className={styles.counter}>{conference.questionIndex + 1}/{conference.questions.length}</span>
        </header>
        <div className={styles.pressBody}>
          <p className={styles.context}>{conference.competitionName} · {conference.opponentName}<br />{question.context}</p>
          <h3 className={styles.question} id="press-question">{question.question}</h3>
          <div className={styles.answers}>
            {question.answers.slice(0, 3).map((answer, index) => (
              <button className={styles.answer} key={`${question.id}-${answer.label}`} onClick={() => onAnswer(index)} type="button">
                <span>
                  <span className={styles.answerLabel}>{answer.label}</span>
                  <span className={styles.answerTone}>{answer.toneLabel ?? (answer.tone === "bold" ? "Resposta forte" : answer.tone === "team" ? "Valoriza o grupo" : "Resposta serena")}</span>
                </span>
                <FutboboIcon className={styles.answerArrow} name="arrow-right" size={20} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
