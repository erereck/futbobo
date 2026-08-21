# Arquitetura da carreira

O `app/page.tsx` é apenas a entrada da rota. A implementação da carreira fica separada por responsabilidade:

- `model.ts`: contrato do save, fases, estatísticas e demais tipos persistidos.
- `shared.ts`: primitivas determinísticas sem dependências do restante da carreira.
- `sponsors.ts`: catálogo de patrocinadores.
- `state.ts`: estado inicial, migração de saves, atributos, rivais e premiações.
- `academy.ts`: nacionalidade, categorias de base e classificação continental.
- `performance.ts`: desempenho, valor, público, saúde e economia.
- `transfer-market.ts`: motor central do mercado. Calcula contexto, elegibilidade, necessidade posicional, papel, taxa real, salário, empréstimo, retorno e registro histórico. As regras de mercado não devem ser recriadas na interface ou na simulação.
- `world-player-model.ts`: contrato persistido dos jogadores fictícios, população agregada, histórico, honrarias e vínculos com rivais.
- `world-players.ts`: geração compacta, migração, avanço anual determinístico e APIs neutras de consulta. Só jogadores relevantes viram entidades completas.
- `events.ts`: escolha e aplicação de eventos, histórias e coletivas.
- `simulation.ts`: resolução da temporada e simulação Monte Carlo.

A interface está em `app/components/career/`:

- `CareerGame.tsx`: orquestra estado, ações e telas da carreira.
- `CareerPrimitives.tsx`: escudos, métricas, prêmios e galeria de títulos reutilizáveis.
- `TransferMarketScreen.tsx`: janela enxuta de propostas; consome propostas prontas do domínio e deixa contrato/detalhes sob demanda.

## Mercado e compatibilidade

`transferOffers` (IDs) permanece no save como adaptador para eventos e saves antigos. Novos fluxos usam `transferMarketOffers`, que guarda a proposta assinada pelo clube: tipo, taxa, salário, duração, papel e motivo. Uma transferência aceita entra em `transferHistory`; esse histórico é a fonte futura para rankings mundiais.

Empréstimos usam `activeLoan` como contrato próprio e preservam os campos legados `loanParentClubId`, `loanParentLeagueId` e `loanEndSeason`. Ao aceitar, o vínculo de origem é estendido quando necessário para cobrir a temporada emprestada. O retorno sempre passa por `completeLoanReturn`, inclusive para saves antigos ou quando o vínculo termina. Não implemente retornos paralelos em componentes.

`clubPositionNeed` é hoje um provedor determinístico leve. Ele existe como ponto de troca para o futuro modo treinador fornecer necessidade real do elenco sem obrigar o mercado a conhecer jogadores fictícios agora.

`rankMarketDestinations` é o contrato neutro usado pelo protagonista e pelos World Players. Sistemas futuros devem fornecer um `MarketPlayerProfile` e consumir esse ranking, sem recriar critérios de força, papel, região, necessidade ou valor.

## World Players

Cada carreira possui seu próprio `worldPlayers`, portanto slots nunca compartilham IDs ou evolução. A maior parte do universo fica em `population`, como coortes agregadas; `players` contém apenas a camada promovida e persistente. Rivais continuam sendo o contrato antigo da carreira, ligados por `rivalLinks`, e podem migrar gradualmente sem quebrar saves ou eventos existentes.

O avanço é idempotente por `lastAdvancedSeason`. Nomes conhecidos de cerimônias podem ser resolvidos ou promovidos com `ensureKnownWorldPlayer`, enquanto `recordWorldPlayerHonor` registra prêmio ou taça sem conhecer critérios, rankings ou interface.

## Regra para novos updates

Conteúdo e regras pertencem ao módulo do domínio. JSX específico do fluxo fica em `CareerGame`; componentes reutilizáveis vão para `CareerPrimitives` ou para um novo arquivo com responsabilidade clara. A rota não deve voltar a acumular lógica.
