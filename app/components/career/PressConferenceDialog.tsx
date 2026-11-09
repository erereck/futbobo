import type { PressConference } from "../../career/model";
import { Pictogram } from "./album/Pictogram";
import AlbumSheet, { sheetStyles as styles } from "./album/sheets/AlbumSheet";

type Props = {
  conference: PressConference;
  /** Cores do clube (ou da seleção) para a tinta da folha. */
  club: { primary: string; secondary: string };
  onAnswer: (answerIndex: number) => void;
};

const COPY = {
  "post-match": { eyebrow: "Zona mista", title: "A palavra é sua" },
  presentation: { eyebrow: "Coletiva de apresentação", title: "Primeiras palavras" },
  "former-club": { eyebrow: "Reencontro", title: "Depois do apito" },
  betrayal: { eyebrow: "Transferência entre rivais", title: "A cidade quer uma resposta" },
} as const;

const TONE_LABEL = { bold: "Resposta forte", team: "Valoriza o grupo", calm: "Resposta serena" } as const;

/** Coletiva no álbum: recorte de jornal com a pergunta em destaque e três respostas numeradas. */
export default function PressConferenceDialog({ conference, club, onAnswer }: Props) {
  const kind = conference.kind ?? "post-match";
  const copy = COPY[kind];
  const question = conference.questions[conference.questionIndex];
  if (!question) return null;
  const total = conference.questions.length;

  return (
    <AlbumSheet
      ink="ink"
      club={club}
      titleId="press-title"
      labelledBy="press-title press-question"
      kicker={copy.eyebrow}
      title={copy.title}
      emblem={<Pictogram name="press" />}
      aside={(
        <span className={styles.pips} role="img" aria-label={`Pergunta ${conference.questionIndex + 1} de ${total}`}>
          {conference.questions.map((item, index) => <i key={item.id} data-on={index <= conference.questionIndex ? "" : undefined} />)}
          <b className={styles.num}>{conference.questionIndex + 1}/{total}</b>
        </span>
      )}
    >
      <p className={styles.pressMeta}><b>{conference.competitionName}</b><span>{conference.opponentName}</span></p>
      <p className={styles.situation}>{question.context}</p>
      <blockquote className={styles.question}>
        <h3 id="press-question">{question.question}</h3>
      </blockquote>
      <ol className={styles.answers}>
        {question.answers.slice(0, 3).map((answer, index) => (
          <li key={`${question.id}-${answer.label}`}>
            <button className={styles.answer} onClick={() => onAnswer(index)} type="button">
              <span className={styles.answerNo} aria-hidden="true">{index + 1}</span>
              <span className={styles.answerText}>
                <strong>{answer.label}</strong>
                <em className={styles.tone} data-tone={answer.tone}>{answer.toneLabel ?? TONE_LABEL[answer.tone]}</em>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </AlbumSheet>
  );
}
