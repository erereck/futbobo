# ⚽ Futbobo

**Um jogo de carreira no futebol feito para transformar números em histórias.**

Futbobo começou como uma experiência rápida de carreira pensada primeiro para celular e cresceu para um pequeno universo de futebol: formação na base, transferências, Seleção, mercado, imprensa, vida pessoal, rivalidades, títulos, recordes, jogadores persistentes e modos jogáveis separados.

Você começa aos **12 anos**, escolhe posição e caminho de formação, é revelado entre os **16 e 18** e segue até a aposentadoria. Uma carreira pode durar poucos minutos ou virar uma saga atravessando clubes, países, continentes e gerações de jogadores.

> O objetivo não é reproduzir Football Manager ou EA FC em escala menor. A ideia é comprimir uma carreira inteira em decisões rápidas, consequências claras e acontecimentos que façam cada save contar uma história diferente.

---

## 🎮 Modos

### Carreira de Jogador

O coração do Futbobo.

- Categorias de base dos 12 aos 16–18 anos.
- 12 posições e quatro caminhos de formação.
- 512 clubes distribuídos por 28 ligas.
- Evolução de OVR, potencial, atributos, moral, forma, reputação e condicionamento.
- Contratos, salários, transferências, empréstimos e pedidos de saída.
- Seleções de base, Olímpica e principal.
- Brasileirão, Copa do Brasil, Libertadores, competições europeias, asiáticas e Mundial de Clubes.
- Promoção e rebaixamento em ligas compatíveis, incluindo playoffs ingleses.
- Lesões, suspensões, fadiga, aposentadoria e declínio.
- Bola de Ouro, premiações, artilharias, títulos e recordes.
- Seguidores, imprensa, patrocinadores, torcida e vida extracampo.
- Eventos narrativos, escolhas e consequências que permanecem no save.
- Rivais pessoais, reencontros com ex-clubes e reações a transferências.
- Aba **Time** com companheiros persistentes, titulares, banco e vagas de mercado.
- Traição entre clubes rivais, foco de país do empresário e novas coletivas de repercussão.
- Histórico completo por temporada, clube e competição.
- Hall da Fama local e cartão final compartilhável.

### 🌍 Mundo da carreira

A carreira possui uma camada persistente além do protagonista.

- **World Players** com idade, OVR, potencial, reputação e carreira própria.
- Transferências e empréstimos entre clubes.
- Histórico de clubes, estatísticas, honrarias e aposentadoria.
- Rivais e candidatos a prêmios podem continuar existindo durante anos.
- O sistema foi construído para permitir que o mundo ganhe cada vez mais vida sem transformar todo jogador irrelevante em uma entidade pesada no save.

### 🏆 Copa do Mundo

Modo separado para entrar direto na competição e jogar uma Copa sem precisar iniciar uma carreira inteira.

### 🔘 Futebol de Botão

Um jogo dentro do jogo, com física própria.

- Partidas completas.
- IA adversária.
- Formações.
- Pênaltis.
- Física de bola e peças.
- Integração com partes da carreira.

O modo ainda funciona como laboratório para futuras ideias de torneios, multiplayer local, customização e desafios.

### ⚡ Arena

Protótipo experimental de futebol arcade em tempo real. É uma área de laboratório do projeto e não representa o modo principal do Futbobo.

---

## 🧠 Filosofia do projeto

O Futbobo tenta evitar a sensação de que toda carreira acaba convergindo para a mesma coisa.

Alguns princípios usados no desenvolvimento:

- **Consequências antes de quantidade:** uma decisão boa deve afetar outros sistemas.
- **Mundo persistente:** jogadores, clubes e relações devem sobreviver à temporada atual.
- **Carreiras imperfeitas são mais interessantes:** lesões, temporadas ruins, banco e propostas estranhas fazem parte da história.
- **Mobile first:** a interface precisa funcionar bem em uma tela pequena sem virar uma planilha de Football Manager.
- **Saves longos importam:** vários sistemas são deterministicamente reproduzíveis e pensados para carreiras de muitas temporadas.
- **O jogo pode ser absurdo sem perder coerência:** há espaço tanto para futebol sério quanto para eventos extremamente improváveis.

---

## 🏗️ Estrutura técnica

O projeto usa:

- **Next.js 16**
- **React 19**
- **TypeScript**
- Exportação estática
- GitHub Pages
- Capacitor para a versão Android

A lógica da carreira vem sendo gradualmente separada da interface. Sistemas como mercado, World Players, simulação, patrocinadores, coletivas e progressão vivem em módulos próprios dentro de `app/career/`.

Isso também facilita a expansão futura para outros modos sem duplicar as regras do universo.

---

## 🚀 Rodar localmente

Requer **Node.js 22.13 ou superior**.

```bash
npm install
npm run dev
```

Depois abra:

```text
http://localhost:3000
```

### Build

```bash
npm run build
```

### Verificações

```bash
npm run lint
npm test
```

`npm test` executa o build e também valida o HTML exportado.

---

## 🆕 v93.10 — Time de Verdade

A v93.10 transforma o clube e a Seleção em elencos vivos durante toda a carreira. Companheiros evoluem, envelhecem e se transferem; a nova aba **Time** exibe titulares e banco; e decisões de mercado agora registram traições entre rivais. A QUADRA também ganhou o foco de país do empresário, enquanto patrocinadores e alcance social foram recalibrados para carreiras de superestrelas.

---

## 🧪 Laboratório Monte Carlo

O Futbobo possui um simulador headless para medir o balanceamento de carreiras completas.

Com o servidor local aberto:

```text
http://localhost:3000/?montecarlo=100&seed=20260723
```

- `montecarlo` define a quantidade de carreiras simuladas.
- `seed` torna o lote reproduzível.

O laboratório reutiliza as mesmas regras de evolução, eventos, mercado, transferências e premiações do jogo normal. Ele é usado para encontrar extremos de balanceamento que seriam difíceis de perceber jogando apenas uma ou duas carreiras manualmente.

---

## 📱 Android

O projeto também possui estrutura Capacitor para Android.

Comandos disponíveis:

```bash
npm run android:prepare
npm run android:open
npm run android:apk
```

Consulte [`ANDROID.md`](ANDROID.md) para detalhes específicos.

---

## 📦 Dados do futebol

Clubes, ligas, países, posições e vários parâmetros básicos ficam centralizados em:

[`app/game-data.ts`](app/game-data.ts)

Cada clube possui informações como:

- ID
- nome e nome curto
- abreviação
- cidade
- país
- liga
- cores
- reputação
- força

Esse arquivo é grande de propósito: ele funciona como uma das bases de dados centrais do jogo.

---

## 🗂️ Algumas áreas importantes

```text
app/career/       regras e sistemas da carreira
app/components/   interface reutilizável
app/botao/        futebol de botão
app/copa/         modo Copa do Mundo
app/arena/        protótipo arcade experimental
app/game-data.ts  clubes, países, ligas e dados-base
```

---

## 🌐 Deploy

A versão web é gerada como site estático e publicada automaticamente pelo **GitHub Actions / GitHub Pages** a cada push na branch `main`.

O workflow de deploy executa o build antes da publicação; uma `main` que não compila não deve chegar ao site.

---

## 🎨 Créditos visuais

Os escudos e emblemas de competições são sincronizados pela API do [TheSportsDB](https://www.thesportsdb.com/) e usados sem alteração.

As bandeiras são fornecidas pelo [FlagCDN](https://flagcdn.com/), com alguns emblemas adicionais vindos do [FCLogo](https://fclogo.top/) e [Football Logos](https://football-logos.cc/).

Marcas, escudos e demais identidades visuais pertencem aos seus respectivos titulares.

---

## 🛠️ Status

Futbobo é um projeto em desenvolvimento ativo. Sistemas podem mudar bastante entre versões e alguns modos funcionam deliberadamente como laboratórios experimentais.

A regra principal do projeto continua a mesma desde o começo:

**uma carreira precisa gerar uma história que dê vontade de contar para alguém depois.**
