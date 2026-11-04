import Link from "next/link";
import { CONCEPTS } from "./data";
import { Club, Face, Icon, Jersey, Wordmark } from "./v2/shared";
import s from "./v2/worlds.module.css";

export default function Gallery() {
  return (
    <div className={`${s.studio} ${s.gallery}`}>
      <header className={s.galleryHeader}>
        <Wordmark />
        <span>ESTÚDIO FUTBOBO / RODADA 02</span>
        <a href="https://github.com/erereck/futbobo/blob/concept/six-new-worlds/docs/concepts-round-two.md">
          O estudo por trás dos jogos <Icon name="arrow-right" size={16} />
        </a>
      </header>
      <main>
        <div className={s.galleryIntro}>
          <div>
            <span>ESCOLHA UMA FORMA DE JOGAR.</span>
            <h1>
              Uma carreira.
              <br />
              <i>Seis atos de jogar.</i>
            </h1>
          </div>
          <aside>
            <span>02</span>
            <p>
              O campo, a estrada, a mesa,
              <br />a conversa, a mão, o gesto.
              <br />
              <b>Entre e descubra o que muda.</b>
            </p>
            <small>MENU + SITUAÇÃO JOGÁVEL EM CADA PROPOSTA</small>
          </aside>
        </div>
        <div className={s.gameLibrary}>
          {CONCEPTS.map((c) => (
            <article key={c.id} className={s.libraryEntry}>
              <Link
                href={`/conceitos/${c.id}/`}
                className={`${s.gameCover} ${s[`cover-${c.id}`]}`}
                aria-label={`Entrar em ${c.name}`}
              >
                {c.id === "na-bola" ? (
                  <div className={s.miniPitch}>
                    <div className={s.miniScore}>
                      FLA <b>1 : 1</b> FLU <span>87′</span>
                    </div>
                    <span>
                      ENXERGA O<br />
                      ESPAÇO?
                    </span>
                    <svg viewBox="0 0 400 200" aria-hidden="true">
                      <path
                        d="M12 12h376v176H12Zm250 0v176m126-134h-76v92h76"
                        fill="none"
                        stroke="#d5d9af66"
                      />
                      <path
                        d="M125 146Q177 30 276 70"
                        fill="none"
                        stroke="#edcd78"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                      />
                      <circle
                        cx="125"
                        cy="146"
                        r="15"
                        fill="#c8563f"
                        stroke="#ead7a9"
                        strokeWidth="2"
                      />
                      <circle cx="276" cy="70" r="15" fill="#e4cb88" />
                      <circle cx="320" cy="130" r="15" fill="#bd4d3a" />
                      <circle cx="248" cy="119" r="11" fill="#7e9877" />
                      <circle cx="348" cy="78" r="11" fill="#7e9877" />
                      <text
                        x="125"
                        y="151"
                        textAnchor="middle"
                        fill="#f0e2b9"
                        fontSize="14"
                      >
                        10
                      </text>
                      <text
                        x="276"
                        y="75"
                        textAnchor="middle"
                        fill="#25452d"
                        fontSize="14"
                      >
                        7
                      </text>
                    </svg>
                    <div className={s.miniTouch}>
                      <i />
                      <i />
                      <i />
                      <span>3 TOQUES · UM LANCE</span>
                    </div>
                  </div>
                ) : null}
                {c.id === "estrada" ? (
                  <div className={s.miniRoad}>
                    <span>PASSAPORTE DE FUTEBOL / CAIO SILVA</span>
                    <svg viewBox="0 0 400 260" aria-hidden="true">
                      <path
                        d="M200 45Q170 90 95 120m105-75q30 45 105 75M95 120q0 50 50 90m-50-90q40 50 105 90m105-90q0 50-50 90"
                        stroke="#7b8d64"
                        strokeDasharray="4 4"
                        fill="none"
                        strokeWidth="2"
                      />
                      <path
                        d="M200 45Q170 90 95 120"
                        stroke="#b16a4e"
                        strokeWidth="3"
                        fill="none"
                      />
                      {[
                        [200, 45],
                        [95, 120],
                        [305, 120],
                        [145, 210],
                        [255, 210],
                      ].map(([x, y], i) => (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r={i < 2 ? 17 : 12}
                          stroke={i === 1 ? "#aa654a" : "#80956b"}
                          strokeWidth="2"
                          fill={i < 2 ? "#ede5c9" : "#dce0c5"}
                        />
                      ))}
                      <text
                        x="95"
                        y="160"
                        fontSize="10"
                        textAnchor="middle"
                        fill="#385b3a"
                      >
                        DISPUTAR ESPAÇO
                      </text>
                      <text
                        x="305"
                        y="160"
                        fontSize="10"
                        textAnchor="middle"
                        fill="#748767"
                      >
                        MINUTOS NO SPORT
                      </text>
                    </svg>
                    <Club id="flamengo" size={24} />
                    <b>Você está aqui.</b>
                    <small>O OUTRO CAMINHO VAI FICAR PARA TRÁS.</small>
                  </div>
                ) : null}
                {c.id === "contrato" ? (
                  <div className={s.miniContract}>
                    <span>UMA PROPOSTA. MAIS DE UMA VIDA.</span>
                    <div>
                      <Club id="sport" size={31} />
                      <span>CONTRATO DESPORTIVO</span>
                      <h3>Caio Silva</h3>
                      <small>01 / REMUNERAÇÃO</small>
                      <b>
                        R$ 24 <i>mil</i>
                      </b>
                      <hr />
                      <span>02 / TEMPO DE VÍNCULO</span>
                      <p>
                        1 ano <b>2 anos</b> 3 anos
                      </p>
                      <label>☑ Titularidade garantida</label>
                      <span className={s.miniSignature}>Caio Silva</span>
                      <i className={s.miniStamp}>
                        EM
                        <br />
                        NEGOCIAÇÃO
                      </i>
                    </div>
                    <span className={s.miniPen} />
                  </div>
                ) : null}
                {c.id === "entrelinhas" ? (
                  <div className={s.miniDialogue}>
                    <span>ENTRE O PEDIDO E A PROMESSA.</span>
                    <div className={s.miniCoach}>
                      <Face person="coach" mood={1} />
                    </div>
                    <div className={s.miniYou}>
                      <Face person="caio" mood={1} />
                    </div>
                    <div className={s.miniSpeech}>
                      “Não foi falta de confiança.
                      <br />
                      Eu quero você inteiro.”
                    </div>
                    <div className={s.miniPhrase}>
                      <span>A SUA VOZ</span>
                      <p>Professor, vamos conversar.</p>
                      <div>
                        <i>OUVIR</i>
                        <i>ENTENDER</i>
                        <i>SE COMPROMETER</i>
                      </div>
                    </div>
                  </div>
                ) : null}
                {c.id === "na-mao" ? (
                  <div className={s.miniPlan}>
                    <span>PREPARAR / DISPUTAR / SUSTENTAR</span>
                    <div>
                      {[
                        ["01", "TREINO EXTRA", "training"],
                        ["02", "CLÁSSICO", "match"],
                        ["03", "PÉ NO FREIO", "rest"],
                      ].map(([n, t, k], i) => (
                        <span
                          key={n}
                          style={{
                            transform: `rotate(${(i - 1) * 7}deg) translateY(${i === 1 ? -7 : 8}px)`,
                          }}
                        >
                          <small>
                            {n} /{" "}
                            {k === "match"
                              ? "JOGO"
                              : k === "rest"
                                ? "CORPO"
                                : "PREPARO"}
                          </small>
                          <Icon
                            name={
                              k === "match"
                                ? "ball"
                                : k === "rest"
                                  ? "medical"
                                  : "player"
                            }
                            size={45}
                          />
                          <b>{t}</b>
                          <i>{k === "rest" ? "RECUPERAR" : "SE COMPROMETER"}</i>
                        </span>
                      ))}
                    </div>
                    <p>O ANO TEM TRÊS ESPAÇOS.</p>
                    <span className={s.miniCombo}>
                      TREINO → CLÁSSICO = A PREPARAÇÃO VIRA GOL.
                    </span>
                  </div>
                ) : null}
                {c.id === "pulso" ? (
                  <div className={s.miniPulse}>
                    <span>UM GESTO. O PRÓXIMO DIA.</span>
                    <div>
                      <small>PROFESSOR</small>
                      <div>
                        <Face person="coach" mood={1} />
                      </div>
                      <h3>
                        Você banca
                        <br />
                        esse jogo?
                      </h3>
                      <footer>
                        <span>← ENTRO DEPOIS</span>
                        <span>EU BANCO →</span>
                      </footer>
                    </div>
                    <span className={s.miniSwipeLeft}>←</span>
                    <span className={s.miniSwipeRight}>→</span>
                  </div>
                ) : null}
                <span className={s.coverEnter}>
                  ENTRAR <Icon name="arrow-right" size={16} />
                </span>
              </Link>
              <div className={s.libraryCaption}>
                <span>{c.number}</span>
                <div>
                  <Link href={`/conceitos/${c.id}/`}>
                    <h2>{c.name}</h2>
                  </Link>
                  <p>{c.verb}.</p>
                </div>
                <Link
                  className={s.libraryPlay}
                  href={`/conceitos/${c.id}/#jogo`}
                >
                  Jogar <Icon name="play" size={24} />
                </Link>
              </div>
              <p className={s.libraryMechanic}>{c.stakes}</p>
            </article>
          ))}
        </div>
        <section className={s.studyNote}>
          <span>
            O QUE FOI ABERTO
            <br />
            ANTES DE ESCOLHER SEIS.
          </span>
          <p>
            22 caminhos explorados. Os escolhidos precisavam de uma decisão que
            fizesse sentido no futebol, de um controle próprio e de uma
            consequência que continuasse na carreira.
          </p>
          <a href="https://github.com/erereck/futbobo/blob/concept/six-new-worlds/docs/concepts-round-two.md">
            Ler a exploração <span>↗</span>
          </a>
        </section>
      </main>
      <footer className={s.galleryFooter}>
        <Wordmark />
        <span>ESTUDO DE JOGO / SEIS SISTEMAS INDEPENDENTES</span>
        <a href="https://github.com/erereck/futbobo/pull/61">
          Ver no repositório ↗
        </a>
      </footer>
    </div>
  );
}
