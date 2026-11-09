# Álbum da carreira

A carreira inteira (mesa de decisão, abas, consequência, fim de temporada, mercado) é um **álbum de figurinhas**.
Desktop (≥1024 px): álbum aberto sobre a mesa, duas páginas, abas do índice saindo da borda (≥1280 à direita,
1024–1279 no topo). Celular (<1024 px): uma página que rola, abas do índice presas no rodapé (amarelo da capa).
Concept de origem: `concepts/carreira/02-album.html`.

## Arquivos

| Arquivo | Dono | O quê |
|---|---|---|
| `album.module.css`, `AlbumShell.tsx` | casca | tokens, mesa, capa, páginas (`AlbumPage side="left|right"`), abas do índice, `albumHostClass` |
| `primitives.tsx`, `primitives.module.css` | casca | `ClubBand`, `InkBand`, `PlayerSticker`/`StickerBust`, `BlockTitle`, `Ficha`, `Meters`, `Stamp`, `Seal`, `SpecialSlot` |
| `inks.ts` | casca | cores de impressão do clube (`clubInks`), `darken`/`lighten`/`luminance` |
| `Pictogram.tsx` | casca | pictogramas brancos das figurinhas-escolha e escolha pelo efeito |
| `newsCrest.ts` | casca | escudo de clube/seleção citado numa manchete |
| `CareerSpread.tsx` | aba Carreira | página do jogador + página do ano; decisão e consequência no mesmo componente |
| `tabs/*.tsx` | cada aba | Jogador, Time, Histórico, Estatísticas, Mundo |
| `SeasonResultSpread.tsx`, `SideSpreads.tsx`, `LuckOverlay.tsx` | fases | fim de temporada, mercado, pedido negado, aposentadoria, sorte |
| `BotaoSpreads.tsx` | fases | decisão no futebol de botão: ingresso e a sua figurinha antes, placar carimbado, gols, replay e números da mesa depois |
| `sheets/AlbumSheet.tsx`, `sheets/sheets.module.css` | folhas soltas | pop-ups da carreira presos com fita (faixa de tinta, corpo que rola, rodapé amarelo no celular) |
| `sheets/StoryDecisionSheet.tsx` | folhas soltas | capítulo da história de origem; a coletiva, a QUADRA e o treino especial usam `AlbumSheet` nos próprios arquivos (`../PressConferenceDialog.tsx`, `../CycleShopDialog.tsx`, `../SpecialTrainingPanel.tsx`) |
| `intro/CreationSpread.tsx`, `intro/IntroParts.tsx`, `intro/intro.module.css` | introdução | ficha do atleta: a figurinha se monta à esquerda (cores do país até entrar num clube) e uma pergunta por vez à direita (nome, posição no campo de botão, camisa e pé, visual/país/história, clube da base) |
| `intro/BaseSpreads.tsx` | introdução | base: escolha Simular/Jogar, anos da base colados um por um e o primeiro contrato (propostas iguais às da janela de transferências). O Scorebobo da base fica na própria tela |
| `menu/HomeSpread.tsx`, `menu/menu.module.css` | menu | primeira folha: Rumo ao Estrelato com a figurinha da última carreira (continuar num toque), outras carreiras e o espaço vazio da nova; índice com os outros modos e o resto do álbum |
| `SummarySpread.tsx`, `summary.module.css` | fim de carreira | última página: figurinha final, legado, números, caminho e pôster; taças, prêmios, história, arquivo por clube e Hall. Também é a capa do `HallCareerViewer` (`../HallCareerViewer.tsx`), que abre a carreira arquivada com as mesmas abas, só para ver |
| `useDockLift.ts` | casca | `--dock-lift`: o rodapé fixo (dock, abas, folhas) sobe até a área visível quando o navegador deixa o layout maior que a tela |
| `menu/MenuSpreads.tsx`, `menu/pages.module.css` | menu | Hall da Fama (1º do álbum + ranking), Conquistas (figurinhas numeradas por raridade), folha de excluir carreira e `PaperScreen`, a folha solta sobre a mesa de Configurações, Instalar, Novidades e Outros jogos |

Cada aba calcula o que precisa a partir de `game` (GameState); o `CareerGame` só passa estado e ações.

## Tokens (definidos em `.root` da casca e em `.tokens`)

`.tokens` leva as mesmas tintas para o que monta fora das páginas (as folhas soltas). Some com `clubInks()` inline para a cor do clube.

- Papel `--paper #fbfbf7`, `--paper-2`, `--paper-edge`; tinta `--ink #161616`, `--ink-2`, `--ink-3`; filetes `--rule`, `--rule-strong`.
- Tintas do álbum: `--blue`, `--red`, `--yellow` (capa e ação), `--green`, `--mustard`, cada uma com `-deep`.
- Clube atual: `--club`, `--club-deep`, `--club-soft`, `--club-2` (listra), `--club-ink` (texto sobre a faixa).
- Texturas: `--grain` (papel), `--dots-light` / `--dots-ink` / `--dots-slot` (retícula), `--foil` (brilho).
- Tipo: `--font-display` (Bricolage Grotesque, `font-stretch` 75–85%, 700–800) e `--font-text` (Instrument Sans).
- Movimento: `--ease-out cubic-bezier(.16,1,.3,1)`.

## Cor de cada aba

Carreira = cor do clube · Jogador = azul · Time = vermelho · Histórico = tinta · Estatísticas = mostarda · Mundo = verde.
A faixa de cabeçalho de cada aba (`InkBand`) usa a cor dela.

## Regras

- Papel impresso, não cartão de app: blocos separados por espaço e filetes, figurinhas com sombra de papel, carimbos.
- Nada de rótulo em CAIXA ALTA espaçada acima de bloco, "→" em botão, emoji como ícone, cartões idênticos em grade,
  glassmorphism, gradiente decorativo. Títulos de bloco em `BlockTitle` (frase normal).
- Números comparáveis com `font-variant-numeric: tabular-nums`. Foco visível. Alvos de 44 px no toque.
- Um momento de movimento por tela (figurinhas caindo, voo da escolhida). Todo o resto é feedback curto.
  `prefers-reduced-motion` sempre: conteúdo nunca depende de animação para aparecer.
- Pop-up é folha solta (`AlbumSheet`): desktop no centro com a página de baixo torta e fita nos cantos; celular sobe do rodapé.
  O editor de visual é o componente compartilhado da criação, vestido de papel só dentro da folha (`.editorScope`).
- Celular: página que rola com as abas fixas; a ação principal vira um dock amarelo no rodapé quando não há abas.
  Nada de overflow horizontal em 360 px.
- Jogo idêntico: só apresentação muda. Mesmos textos de consequência, mesmas regras, mesmos botões.
- Sem abas do índice (menu, introdução), `AlbumShell centered` põe o álbum no meio da mesa.
- Fora desta pasta, no mesmo papel: a partida de botão (bloco "v97 — Álbum" no fim de `app/botao/botao.css`, preso em
  `.botao-root`: placar como ingresso, a vez de quem na fita amarela, carimbos, pausas em papel; a mesa e o 3D não mudam),
  a base jogada (`.paper` em `../CareerMinigames.module.css`; o minigame do Scorebobo abre com o visual dele),
  o aviso do Android (`app/AndroidInstallDialog.tsx`, folha solta) e o convite do Modo 3D (`FutboboShell.module.css`).
- Celular: cada tela tenta caber inteira, sem rolar. Listas longas (conquistas, arquivo da carreira) podem rolar.
- O menu continua disparando a carreira pela tela antiga de boas-vindas do `CareerGame` (`.career-new-tile`, `.career-load-tile`);
  ela fica invisível sob o papel (`FutboboShell.module.css`). O índice das carreiras guarda `number` e `appearance` para a figurinha do menu.
