"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CLUBS, POSITIONS, leagueById } from "../../game-data";
import type { PositionKey } from "../../game-data";
import type {
  AppSettings,
  CustomClubDefinition,
  InstallPromptEvent,
} from "../../career/model";
import { SETTINGS_KEY, applyCustomClubDefinitions } from "../../career/state";
import {
  ANDROID_APP_VERSION,
  checkForAndroidUpdate,
  isAndroidDevice,
  isNativeAndroid,
  openAndroidDownload,
} from "../../android-app";
import type { AndroidRelease } from "../../android-app";
import { ClubBadge } from "../career/CareerPrimitives";
import styles from "./ShellUtilityScreens.module.css";
import { FUTBOBO_VERSION } from "../../version";
import FutboboIcon from "../FutboboIcon";

const DEFAULT_SETTINGS: AppSettings = {
  customCharacters: [],
  customClubs: [],
  finalMatchMode: "play-key-matches",
  botaoGoalLimit: 3,
  botaoHalfSeconds: 120,
  botaoExtraSeconds: 45,
  botaoPenaltyRounds: 5,
  characterButtonsEnabled: true,
};

function sanitizeSettings(value: Partial<AppSettings>): AppSettings {
  return {
    customCharacters: Array.isArray(value.customCharacters)
      ? value.customCharacters
          .filter(
            (item) =>
              item &&
              typeof item.name === "string" &&
              POSITIONS.some((position) => position.key === item.position),
          )
          .slice(0, 12)
      : [],
    customClubs: Array.isArray(value.customClubs)
      ? value.customClubs
          .filter(
            (club) =>
              club &&
              CLUBS.some((candidate) => candidate.id === club.replacedClubId) &&
              typeof club.name === "string",
          )
          .slice(0, 8)
      : [],
    finalMatchMode: value.finalMatchMode ?? "play-key-matches",
    botaoGoalLimit: [0, 3, 5].includes(value.botaoGoalLimit ?? 3)
      ? (value.botaoGoalLimit ?? 3)
      : 3,
    botaoHalfSeconds: [90, 120, 180].includes(value.botaoHalfSeconds ?? 120)
      ? (value.botaoHalfSeconds ?? 120)
      : 120,
    botaoExtraSeconds: [30, 45, 60].includes(value.botaoExtraSeconds ?? 45)
      ? (value.botaoExtraSeconds ?? 45)
      : 45,
    botaoPenaltyRounds: value.botaoPenaltyRounds === 3 ? 3 : 5,
    characterButtonsEnabled: value.characterButtonsEnabled !== false,
  };
}

function loadSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    return sanitizeSettings(
      JSON.parse(
        localStorage.getItem(SETTINGS_KEY) ?? "{}",
      ) as Partial<AppSettings>,
    );
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.settingRow}>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className={styles.settingControl}>{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segmented}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [editor, setEditor] = useState<"club" | "characters" | null>(null);
  const [characterName, setCharacterName] = useState("");
  const [characterPosition, setCharacterPosition] =
    useState<PositionKey>("MEI");
  const [clubReplacement, setClubReplacement] = useState(CLUBS[0].id);
  const [clubName, setClubName] = useState("");
  const [clubShortName, setClubShortName] = useState("");
  const [clubAbbr, setClubAbbr] = useState("");
  const [clubPrimary, setClubPrimary] = useState("#0b6b45");
  const [clubSecondary, setClubSecondary] = useState("#f4c542");
  const [clubBadge, setClubBadge] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    applyCustomClubDefinitions(settings.customClubs ?? []);
  }, [settings]);

  const replaceableClubs = useMemo(
    () =>
      [...CLUBS].sort((a, b) =>
        a.shortName.localeCompare(b.shortName, "pt-BR"),
      ),
    [],
  );

  const readBadge = (file?: File) => {
    if (!file || file.size > 1_000_000) return;
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" && setClubBadge(reader.result);
    reader.readAsDataURL(file);
  };

  const saveClub = () => {
    const name = clubName.trim().replace(/\s+/g, " ");
    const shortName = (clubShortName.trim() || name).replace(/\s+/g, " ");
    const abbr = clubAbbr
      .trim()
      .toLocaleUpperCase("pt-BR")
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
    if (name.length < 2 || shortName.length < 2 || abbr.length < 2) return;
    const safeBadge =
      clubBadge.startsWith("data:image/") ||
      /^https:\/\//i.test(clubBadge.trim())
        ? clubBadge.trim()
        : "";
    const definition: CustomClubDefinition = {
      replacedClubId: clubReplacement,
      name,
      shortName,
      abbr,
      primary: clubPrimary,
      secondary: clubSecondary,
      badge: safeBadge,
    };
    setSettings((current) => ({
      ...current,
      customClubs: [
        definition,
        ...(current.customClubs ?? []).filter(
          (club) => club.replacedClubId !== clubReplacement,
        ),
      ].slice(0, 8),
    }));
    setClubName("");
    setClubShortName("");
    setClubAbbr("");
    setClubBadge("");
  };

  const addCharacter = () => {
    const name = characterName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || settings.customCharacters.length >= 12) return;
    setSettings((current) => ({
      ...current,
      customCharacters: [
        ...current.customCharacters,
        { id: `custom-${Date.now()}`, name, position: characterPosition },
      ].slice(0, 12),
    }));
    setCharacterName("");
  };

  return (
    <section className={styles.utilityScreen}>
      <header className={styles.hero}>
        <span>CONFIGURAÇÕES</span>
        <h2>Seu Futbobo.</h2>
        <p>Só o que muda a experiência. O resto fica fora do caminho.</p>
      </header>

      <div className={styles.settingsStack}>
        <article className={styles.settingsCard}>
          <header>
            <span>PARTIDAS</span>
            <strong>Como você quer jogar</strong>
          </header>
          <SettingRow
            title="Jogos decisivos"
            description="Escolha quando o futebol de botão entra na carreira."
          >
            <Segmented
              value={settings.finalMatchMode ?? "play-key-matches"}
              options={[
                { value: "simulate", label: "Simular" },
                { value: "finals-only", label: "Só finais" },
                { value: "play-key-matches", label: "Jogos-chave" },
              ]}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  finalMatchMode: value,
                }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Gols para vencer"
            description="0 usa apenas o cronômetro."
          >
            <Segmented
              value={settings.botaoGoalLimit ?? 3}
              options={[
                { value: 0, label: "Sem limite" },
                { value: 3, label: "3" },
                { value: 5, label: "5" },
              ]}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  botaoGoalLimit: value as 0 | 3 | 5,
                }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Tempo por etapa"
            description="Duração normal de cada tempo."
          >
            <Segmented
              value={settings.botaoHalfSeconds ?? 120}
              options={[
                { value: 90, label: "1:30" },
                { value: 120, label: "2:00" },
                { value: 180, label: "3:00" },
              ]}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  botaoHalfSeconds: value as 90 | 120 | 180,
                }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Prorrogação"
            description="Tempo extra por etapa quando necessário."
          >
            <Segmented
              value={settings.botaoExtraSeconds ?? 45}
              options={[
                { value: 30, label: "0:30" },
                { value: 45, label: "0:45" },
                { value: 60, label: "1:00" },
              ]}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  botaoExtraSeconds: value as 30 | 45 | 60,
                }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Pênaltis"
            description="Cobranças iniciais da disputa."
          >
            <Segmented
              value={settings.botaoPenaltyRounds ?? 5}
              options={[
                { value: 3, label: "3" },
                { value: 5, label: "5" },
              ]}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  botaoPenaltyRounds: value as 3 | 5,
                }))
              }
            />
          </SettingRow>
        </article>

        <article className={styles.settingsCard}>
          <header>
            <span>PERSONALIZAÇÃO</span>
            <strong>Conteúdo seu, só quando precisar</strong>
          </header>
          <button
            className={styles.editorLauncher}
            type="button"
            onClick={() => setEditor(editor === "club" ? null : "club")}
          >
            <div>
              <b>Time personalizado</b>
              <span>Substitua até 8 clubes sem ocupar a tela inteira.</span>
            </div>
            <em>{(settings.customClubs ?? []).length}/8</em>
            <strong>{editor === "club" ? "−" : "+"}</strong>
          </button>
          {editor === "club" && (
            <div className={styles.editorPanel}>
              <label>
                Clube substituído
                <select
                  value={clubReplacement}
                  onChange={(event) => setClubReplacement(event.target.value)}
                >
                  {replaceableClubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.shortName} · {leagueById(club.leagueId).name}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.twoCols}>
                <label>
                  Nome completo
                  <input
                    maxLength={42}
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="Futbobo FC"
                  />
                </label>
                <label>
                  Nome curto
                  <input
                    maxLength={24}
                    value={clubShortName}
                    onChange={(e) => setClubShortName(e.target.value)}
                    placeholder="Futbobo"
                  />
                </label>
              </div>
              <div className={styles.threeCols}>
                <label>
                  Sigla
                  <input
                    maxLength={4}
                    value={clubAbbr}
                    onChange={(e) => setClubAbbr(e.target.value)}
                    placeholder="FTB"
                  />
                </label>
                <label>
                  Principal
                  <input
                    type="color"
                    value={clubPrimary}
                    onChange={(e) => setClubPrimary(e.target.value)}
                  />
                </label>
                <label>
                  Secundária
                  <input
                    type="color"
                    value={clubSecondary}
                    onChange={(e) => setClubSecondary(e.target.value)}
                  />
                </label>
              </div>
              <label>
                Escudo por link HTTPS
                <input
                  value={clubBadge.startsWith("data:") ? "" : clubBadge}
                  onChange={(e) => setClubBadge(e.target.value)}
                  placeholder="https://.../escudo.png"
                />
              </label>
              <div className={styles.editorActions}>
                <button type="button" onClick={() => fileRef.current?.click()}>
                  Enviar imagem
                </button>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(e) => readBadge(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    clubName.trim().length < 2 || clubAbbr.trim().length < 2
                  }
                  onClick={saveClub}
                >
                  Salvar time
                </button>
              </div>
              {(settings.customClubs ?? []).length > 0 && (
                <div className={styles.compactList}>
                  {(settings.customClubs ?? []).map((item) => {
                    const original = CLUBS.find(
                      (club) => club.id === item.replacedClubId,
                    );
                    return (
                      <div key={item.replacedClubId}>
                        <span>
                          {original && <ClubBadge club={original} size="sm" />}
                        </span>
                        <b>{item.shortName}</b>
                        <small>
                          no lugar de{" "}
                          {original?.shortName ?? item.replacedClubId}
                        </small>
                        <button
                          type="button"
                          onClick={() =>
                            setSettings((current) => ({
                              ...current,
                              customClubs: (current.customClubs ?? []).filter(
                                (club) =>
                                  club.replacedClubId !== item.replacedClubId,
                              ),
                            }))
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            className={styles.editorLauncher}
            type="button"
            onClick={() =>
              setEditor(editor === "characters" ? null : "characters")
            }
          >
            <div>
              <b>Personagens personalizados</b>
              <span>Nomes extras para o universo e partidas.</span>
            </div>
            <em>{settings.customCharacters.length}/12</em>
            <strong>{editor === "characters" ? "−" : "+"}</strong>
          </button>
          {editor === "characters" && (
            <div className={styles.editorPanel}>
              <div className={styles.characterAdder}>
                <input
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="Nome do personagem"
                  maxLength={32}
                />
                <select
                  value={characterPosition}
                  onChange={(e) =>
                    setCharacterPosition(e.target.value as PositionKey)
                  }
                >
                  {POSITIONS.map((position) => (
                    <option key={position.key} value={position.key}>
                      {position.key}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.primary}
                  type="button"
                  onClick={addCharacter}
                >
                  Adicionar
                </button>
              </div>
              {settings.customCharacters.length > 0 && (
                <div className={styles.compactList}>
                  {settings.customCharacters.map((character) => (
                    <div key={character.id}>
                      <b>{character.name}</b>
                      <small>{character.position}</small>
                      <button
                        type="button"
                        onClick={() =>
                          setSettings((current) => ({
                            ...current,
                            customCharacters: current.customCharacters.filter(
                              (item) => item.id !== character.id,
                            ),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <SettingRow
            title="Botões de personagem"
            description="Mostra atalhos visuais na criação quando disponíveis."
          >
            <button
              type="button"
              className={styles.toggle}
              data-active={settings.characterButtonsEnabled !== false}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  characterButtonsEnabled:
                    current.characterButtonsEnabled === false,
                }))
              }
            >
              <span />
            </button>
          </SettingRow>
        </article>
      </div>
    </section>
  );
}

export function InstallScreen() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [android, setAndroid] = useState(false);
  const [native, setNative] = useState(false);
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setAndroid(isAndroidDevice());
      setNative(isNativeAndroid());
    });
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    if (isNativeAndroid()) void checkForAndroidUpdate().then(setRelease);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  const installWeb = async () => {
    if (!prompt) {
      setMessage(
        "No Chrome/Edge, use o menu do navegador e escolha Instalar aplicativo.",
      );
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setMessage(
      choice.outcome === "accepted"
        ? "Instalação iniciada."
        : "Instalação cancelada.",
    );
    setPrompt(null);
  };

  return (
    <section className={styles.utilityScreen}>
      <header className={styles.hero}>
        <span>INSTALAR</span>
        <h2>Futbobo no seu aparelho.</h2>
        <p>Escolha a versão certa. Sem tutorial de quinze parágrafos.</p>
      </header>
      <div className={styles.installGrid}>
        <article className={`${styles.installCard} ${styles.featured}`}>
          <span>RECOMENDADO</span>
          <b>Aplicativo web</b>
          <p>
            Abre em tela cheia e fica no menu iniciar ou tela inicial. Atualiza
            junto com o site.
          </p>
          <ul>
            <li>Windows, Android e desktop</li>
            <li>Sem baixar APK manualmente</li>
            <li>Mesmo save do navegador</li>
          </ul>
          <button type="button" className={styles.primary} onClick={installWeb}>
            {prompt ? "Instalar agora" : "Como instalar"}
          </button>
        </article>
        <article className={styles.installCard}>
          <span>ANDROID</span>
          <b>APK nativo</b>
          <p>Versão empacotada do Futbobo para Android.</p>
          <ul>
            <li>Versão instalada: {native ? ANDROID_APP_VERSION : "—"}</li>
            <li>
              {release
                ? `Update ${release.version} disponível`
                : native
                  ? "Você está no app Android"
                  : android
                    ? "APK disponível"
                    : "Também pode baixar no celular"}
            </li>
          </ul>
          <button
            type="button"
            onClick={() => void openAndroidDownload(release?.url)}
          >
            {release ? "Atualizar APK" : "Baixar APK"}
          </button>
        </article>
      </div>
      {message && <div className={styles.inlineMessage}>{message}</div>}
      <article className={styles.installNote}>
        <b>Se você já joga no navegador</b>
        <span>
          Instalar não cria outra conta nem muda a carreira. É só outra forma de
          abrir o mesmo Futbobo naquele aparelho.
        </span>
      </article>
    </section>
  );
}

const UPDATES = [
  {
    version: FUTBOBO_VERSION,
    date: "AGORA",
    title: "Carreira de Técnico",
    lead: "O banco agora é seu: escolha um clube, cuide dos cinco e viva cada competição na mesa.",
    items: [
      "Mesmo ritmo e estrutura visual da carreira de jogador",
      "Técnico começa aos 40 anos e envelhece com a carreira",
      "Prancheta com seis formações e calendário de liga, copa e continental",
      "Escalação arrastável com cinco titulares e três reservas",
      "Fôlego por jogador baseado somente no que você moveu na partida",
      "Até três trocas por jogo, no seu turno e com a bola parada — sem desfazer",
      "Histórico coletivo, novas estatísticas e Mundo completo",
      "Confiança, reputação e propostas de outros clubes para contratar o técnico",
    ],
  },
  {
    version: "v94",
    date: "ANTERIOR",
    title: "Zona Mista & QUADRA",
    lead: "Sua carreira ganhou voz, memória e uma nova janela de investimento.",
    items: [
      "Entrevistas pós-jogo muito mais variadas",
      "Coletiva de apresentação para grandes contratações",
      "Reencontros e lei do ex com perguntas próprias",
      "Loja QUADRA a cada quatro temporadas",
      "+1 OVR, recalibração oculta e investimentos balanceados",
      "Corrupção com risco real de cinco anos de banimento",
      "Avião de transferências orientado corretamente",
    ],
  },
  {
    version: "v93",
    date: "ANTERIOR",
    title: "Dono da Área",
    lead: "O maior rework do Rumo ao Estrelato.",
    items: [
      "Menu e criação refeitos",
      "Até 10 carreiras",
      "Histórico vertical e nova aba Mundo",
      "Arquivo Vivo com recordes reais + seu save",
      "CONMEBOL Sudamericana",
      "Iconografia SVG própria em toda a interface",
      "Eventos exclusivos de grandes clubes",
      "Conquistas globais e backups melhores",
    ],
  },
];

export function NewsScreen() {
  const [openVersion, setOpenVersion] = useState(FUTBOBO_VERSION);
  return (
    <section className={styles.utilityScreen}>
      <header className={styles.hero}>
        <span>NOVIDADES</span>
        <h2>O que mudou.</h2>
        <p>
          Sem parede de patch note. Só as coisas que você vai perceber jogando.
        </p>
      </header>
      <div className={styles.newsStack}>
        {UPDATES.map((update) => (
          <article
            className={styles.newsCard}
            key={update.version}
            data-open={openVersion === update.version}
          >
            <button
              type="button"
              onClick={() =>
                setOpenVersion((current) =>
                  current === update.version ? "" : update.version,
                )
              }
            >
              <span>
                <em>{update.date}</em>
                <b>{update.version}</b>
              </span>
              <div>
                <strong>{update.title}</strong>
                <p>{update.lead}</p>
              </div>
              <i>{openVersion === update.version ? "−" : "+"}</i>
            </button>
            {openVersion === update.version && (
              <div className={styles.newsDetails}>
                {update.items.map((item) => (
                  <span key={item}>
                    <FutboboIcon name="check" /> {item}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
