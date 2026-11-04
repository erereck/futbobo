export const CONCEPTS = [
  {
    id: "na-bola",
    number: "01",
    name: "Na Bola",
    verb: "Ler o campo",
    accent: "#e9c36a",
    description:
      "Um lance por turnos. O espaço, o companheiro e o relógio mudam a sua decisão.",
    control: "Toque no campo",
    stakes: "O passe muda a próxima chance.",
    scope:
      "Mais perto do futebol jogado. A carreira reage à sua leitura do lance.",
  },
  {
    id: "estrada",
    number: "02",
    name: "Estrada",
    verb: "Escolher o caminho",
    accent: "#adc4a0",
    description:
      "A carreira tem bifurcações. Cada destino custa algo e deixa outro para trás.",
    control: "Explore as bifurcações",
    stakes: "O caminho fecha e abre portas.",
    scope:
      "A carreira vira um percurso legível. Você planeja além do próximo evento.",
  },
  {
    id: "contrato",
    number: "03",
    name: "Contrato",
    verb: "Negociar a vida",
    accent: "#d9c5a4",
    description:
      "Dinheiro, minutos ou liberdade. Uma proposta boa para o clube pode ser ruim para você.",
    control: "Edite as cláusulas",
    stakes: "O clube responde aos seus termos.",
    scope:
      "O mercado deixa de ser uma lista de destinos. O compromisso vira parte da história.",
  },
  {
    id: "entrelinhas",
    number: "04",
    name: "Entrelinhas",
    verb: "Dar a sua palavra",
    accent: "#d69972",
    description:
      "Ouvir muda o que faz sentido dizer. E o que você promete volta para te encontrar.",
    control: "Escute e componha a resposta",
    stakes: "A promessa reaparece depois.",
    scope:
      "Pessoas, contexto e confiança têm memória. A decisão não se encerra no diálogo.",
  },
  {
    id: "na-mao",
    number: "05",
    name: "Na Mão",
    verb: "Montar uma temporada",
    accent: "#d7bb78",
    description:
      "Preparar, disputar, recuperar. As mesmas cartas podem fazer anos muito diferentes.",
    control: "Combine e ordene as cartas",
    stakes: "A ordem muda a temporada.",
    scope:
      "Preserva a carreira rápida, com estratégia na preparação e no custo de cada compromisso.",
  },
  {
    id: "pulso",
    number: "06",
    name: "Pulso",
    verb: "Escolher no gesto",
    accent: "#eaa751",
    description:
      "Um acontecimento, dois lados. O próximo dia vai lembrar do que você decidiu hoje.",
    control: "Arraste ou toque num lado",
    stakes: "Um gesto puxa o próximo acontecimento.",
    scope:
      "Uma versão para jogar com uma mão: decisões curtas e consequências que se encadeiam.",
  },
] as const;
export type Concept = (typeof CONCEPTS)[number];
export type ConceptId = Concept["id"];
export const assetRoot = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export function art(name: string) {
  return `${assetRoot}/concept-art/${name}.webp`;
}
