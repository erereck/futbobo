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
| `BotaoSpreads.tsx` | fases | decisão no futebol de botão: ingresso e regras da mesa antes, placar carimbado, gols, replay e números da mesa depois |
| `sheets/AlbumSheet.tsx`, `sheets/sheets.module.css` | folhas soltas | pop-ups da carreira presos com fita (faixa de tinta, corpo que rola, rodapé amarelo no celular) |
| `sheets/StoryDecisionSheet.tsx` | folhas soltas | capítulo da história de origem; a coletiva, a QUADRA e o treino especial usam `AlbumSheet` nos próprios arquivos (`../PressConferenceDialog.tsx`, `../CycleShopDialog.tsx`, `../SpecialTrainingPanel.tsx`) |

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
