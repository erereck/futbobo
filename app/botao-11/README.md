# Laboratório 11×11

Protótipo desktop isolado do modo 5×5. A rota `/botao-11` existe para responder
uma pergunta antes de integrar qualquer coisa à carreira: **futebol de botão com
11 peças por lado, campo grande e câmera continua divertido e legível?**

## O que o protótipo já testa

- 11 discos por lado, incluindo goleiro, com 4-3-3, 4-4-2, 3-5-2 e 4-2-3-1.
- Física de discos/bola/tabelas/traves inspirada no motor atual do Futbobo.
- Um toque alternado por turno, mantendo a identidade do 5×5.
- CPU sem teleporte: gera candidatos e faz rollouts no mesmo motor antes de agir.
- Campo 1160×720 com câmera suave, pan manual e zoom.
- Minimapa com retângulo da câmera.
- Clubes reais já existentes em `game-data.ts`, sem adicionar nenhum dado novo.
- Telemetria simples do custo do último turno da CPU.

## Controles

- Arraste uma peça sua para trás e solte: toque.
- Arraste o fundo do campo: move a câmera.
- Roda do mouse: zoom ancorado no cursor.
- `F`: centraliza a câmera na bola.
- `Espaço`: liga/desliga câmera automática.
- `R`: nova partida/seed.

## Deliberadamente fora do protótipo

- mobile/touch refinado;
- carreira, temporada, substituições e fadiga;
- laterais/escanteios (a mesa continua com tabelas como o 5×5);
- pênaltis e prorrogação;
- replay e áudio;
- integração com o jogador da carreira.

Se a sensação de jogo passar no teste, o passo seguinte é extrair câmera e
`ruleset` para um contrato comum e decidir o que pode voltar para `app/botao`
sem mudar o comportamento clássico.
