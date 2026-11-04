# Futbobo: seis atos de jogar — rodada 02

A galeria em `/conceitos/` reúne seis hipóteses de interação, selecionadas depois de [explorar 22 possibilidades](concepts-round-two.md). A primeira rodada trocava a apresentação e reutilizava a mesma lista de respostas. Essa implementação foi retirada; o histórico Git preserva aquele estudo.

| Conceito | Menu | Como jogar | O que permanece da decisão |
| --- | --- | --- | --- |
| Na Bola | Sua camisa no armário do vestiário | Toque no companheiro ou no gol e execute a ação. Três toques, sem teste de reflexo. | Posição da bola, tempo restante, placar e confiança |
| Estrada | Atlas no ponto em que a carreira parou | Examine uma bifurcação e viaje. O custo e as condições ficam no passaporte. | Clube, caminho percorrido e portas que fecharam |
| Contrato | Pasta com uma proposta na mesa do empresário | Edite salário, duração e cláusulas. O clube aceita, contrapropõe ou retira a oferta. | Um compromisso concreto entre renda, minutos e liberdade |
| Entrelinhas | Seu lugar no ônibus da delegação | Ouça, componha o pedido e o tom; enfrente uma situação que cobra a promessa. | Relação com o treinador e uma oportunidade/saída/recuperação diferente |
| Na Mão | Álbum de temporadas numa mesa | Jogue três cartas em ordem. Quatro tempos limitam os compromissos. | Combinações, gols, confiança, torcida e fôlego para o próximo ano |
| Pulso | Seu jogador e o ritmo da carreira | Arraste a situação para um lado ou use os botões. | Equilíbrio entre corpo, grupo e torcida; a próxima situação lembra o gesto |

## O que está implementado

- Seis menus e seis situações com controles próprios. Nenhum componente comum de escolhas.
- Seis estados independentes em `app/conceitos/v2/systems.ts`; utilidades visuais e salvamento em `shared.tsx`.
- Persistência isolada em `futbobo:game-study:v2:<conceito>`, com esquema versionado, recuperação e reconstrução de rotas/gestos pelo histórico.
- Personagens desenhados com o renderer do próprio jogo, escudos reais e fontes locais. Nenhuma fotografia de campanha participa das novas telas.
- Responsividade por largura do palco; a opção `414px` usa os mesmos estilos de celular. Na Mão reorganiza a mão antes dos espaços da temporada; Estrada mantém percurso vertical; Pulso oferece botões equivalentes ao arraste.
- Rotas próprias, fora do fluxo principal da versão publicada do jogo.

## Limites das hipóteses

Cada situação prova um ato principal, não uma carreira completa reimplementada. Na Bola aproxima o jogo de decisões táticas; Contrato demonstra o potencial do mercado e dos compromissos; Entrelinhas enfatiza relações. A escolha de uma direção para produção ainda exige testar como ela recebe os outros tipos de evento. Custos e probabilidades demonstrativos não substituem o balanceamento do motor atual.

## Verificação desta rodada

- Oito grupos de testes cobrem sequências de campo, os três destinos da rota, 468 propostas, informação/tom/promessa, ordem e limite das cartas, árvores de gestos, dados corrompidos e exportação das seis rotas.
- As seis interfaces foram exercitadas em DOM simulado: entrada pelo próprio menu, ação principal, consequência, retorno, retomada, controle da largura e isolamento dos saves reais.
- A ferramenta de navegador continua desabilitada no ambiente. DOM simulado não mede layout nem prova aparência, foco ou gestos num aparelho real. A inspeção visual de desktop e celular permanece pendente.

As referências de design, as razões para descartar caminhos e as premissas estão no estudo da exploração. Os prompts e as três artes da rodada 01 foram preservados como histórico, sem uso nas novas interfaces.
