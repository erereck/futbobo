# Arquitetura da carreira

O `app/page.tsx` é apenas a entrada da rota. A implementação da carreira fica separada por responsabilidade:

- `model.ts`: contrato do save, fases, estatísticas e demais tipos persistidos.
- `shared.ts`: primitivas determinísticas sem dependências do restante da carreira.
- `sponsors.ts`: catálogo de patrocinadores.
- `state.ts`: estado inicial, migração de saves, atributos, rivais e premiações.
- `academy.ts`: nacionalidade, categorias de base e classificação continental.
- `performance.ts`: desempenho, valor, público, saúde e economia.
- `transfer-market.ts`: elegibilidade e montagem das propostas.
- `events.ts`: escolha e aplicação de eventos, histórias e coletivas.
- `simulation.ts`: resolução da temporada e simulação Monte Carlo.

A interface está em `app/components/career/`:

- `CareerGame.tsx`: orquestra estado, ações e telas da carreira.
- `CareerPrimitives.tsx`: escudos, métricas, prêmios e galeria de títulos reutilizáveis.

## Regra para novos updates

Conteúdo e regras pertencem ao módulo do domínio. JSX específico do fluxo fica em `CareerGame`; componentes reutilizáveis vão para `CareerPrimitives` ou para um novo arquivo com responsabilidade clara. A rota não deve voltar a acumular lógica.
