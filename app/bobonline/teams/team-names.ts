// Listas de nomes do Bobonline: times de várzea inventados, apelidos e jogadores.
//
// Os nomes brasileiros são uma CÓPIA dos de `app/career/world-player-name-pools.ts`
// (POOLS.brazil). Importar a carreira puxaria `career/shared.ts` → `game-data.ts`
// (275 KB de fonte) para dentro de /bobonline, então a lista mora aqui.
// Só se acrescenta no fim: o sorteio por seed depende dos índices.

/** Começo do nome do time ("Esporte Clube" + " " + lugar). */
export const TEAM_PREFIXES = [
  "Esporte Clube", "Atlético", "Grêmio", "Sport Club", "União", "Associação", "Real", "Independente",
  "Juventude", "Operário", "Ferroviário", "Comercial", "Botafogo", "Paulista", "América", "Nacional",
  "Estrela", "Unidos de", "Sociedade Esportiva", "Clube Atlético", "Ypiranga", "Guarany", "Palmeirinha", "Vila",
] as const;

/** Bairros e lugares de várzea. Alguns já trazem a preposição ("do Morro"). */
export const TEAM_PLACES = [
  "Vila Nova", "São Bento", "Ipiranga", "Bela Vista", "Santa Rita", "Boa Esperança", "do Morro", "Campo Grande",
  "Itaquera", "Madureira", "Penha", "Jardim Alegre", "Três Rios", "Barra Funda", "Lagoa Seca", "Mooca",
  "Bonsucesso", "Cachoeira", "Pirituba", "Tatuapé", "Olaria", "Cascadura", "Piedade", "Realengo",
  "Água Branca", "Pedra Branca", "Monte Alegre", "Serra Azul", "Rio Claro", "Vale Verde", "Ponte Alta", "Areia Branca",
  "Bom Jesus", "Lapa", "Tijuca", "Engenho Novo", "do Sertão", "da Serra", "do Vale", "da Praia",
  "Capão Redondo", "Vila Formosa", "Palmital", "Ribeirão", "Mangueira", "Morro Azul", "Brás", "Butantã",
  "Jaguaré", "Mandaqui",
] as const;

/** Nomes inteiros, sem prefixo nem lugar (10% dos sorteios e o plano B do sorteio). */
export const FUN_TEAM_NAMES = [
  "Bobo FC", "Palheta Futebol Clube", "Unidos da Mesa", "Botão de Ouro EC", "Peteleco FC", "Real Feltro",
  "Sporting Dedinho", "Grêmio da Garagem",
] as const;

/** Apelido padrão do perfil (todos com no máximo 16 letras). */
export const DEFAULT_NICKNAMES = [
  "Rei do Peteleco", "Craque da Mesa", "Mestre do Botão", "Dedo de Ouro", "Palheta Veloz", "Fera do Feltro",
  "Lenda da Várzea", "Goleiro Paredão", "Professor Botão", "Zagueiro de Aço", "Camisa 10", "Rei da Pelada",
  "Chute de Trivela", "Artilheiro Bobo", "Capitão Botão", "Maestro da Mesa", "Furacão da Mesa", "Dona da Bola",
  "Rainha do Toque", "Fominha", "Canhotinha", "Treinador Raiz", "Bobo da Corte", "Peteleco Fino",
] as const;

/** Cópia de POOLS.brazil.first (90 nomes). */
export const BR_FIRST_NAMES = [
  "Adriel", "Alan", "Alex", "Alexandre", "Alisson", "Anderson", "André", "Ângelo", "Arthur", "Augusto",
  "Bernardo", "Breno", "Bruno", "Caio", "Carlos", "Cássio", "Cauã", "Christian", "Darlan", "Davi",
  "Diego", "Douglas", "Ederson", "Eduardo", "Emerson", "Everton", "Fábio", "Felipe", "Fernando", "Gabriel",
  "Geovane", "Guilherme", "Gustavo", "Heitor", "Henrique", "Hugo", "Igor", "Jean", "Jeferson", "João",
  "Jonathan", "José", "Kelvin", "Leandro", "Leonardo", "Luan", "Lucas", "Luiz", "Maicon", "Marcelo",
  "Marcos", "Marlon", "Matheus", "Michel", "Murilo", "Nathan", "Pablo", "Patrick", "Paulo", "Pedro",
  "Rafael", "Ramon", "Renan", "Renato", "Ricardo", "Riquelme", "Roberto", "Rodrigo", "Ruan", "Samuel",
  "Thales", "Thiago", "Tiago", "Vagner", "Vanderson", "Victor", "Vinícius", "Wallace", "Wanderson", "Wendel",
  "Wesley", "William", "Yago", "Ygor", "Cícero", "Danilo", "Éder", "Fabricio", "Joanderson", "Kauã",
] as const;

/** Cópia de POOLS.brazil.last (90 sobrenomes). */
export const BR_SURNAMES = [
  "Aguiar", "Almeida", "Alves", "Amorim", "Andrade", "Araújo", "Assis", "Azevedo", "Barbosa", "Barros",
  "Bastos", "Batista", "Bezerra", "Borges", "Brito", "Cabral", "Campos", "Cardoso", "Carvalho", "Castro",
  "Cavalcante", "Coelho", "Correia", "Costa", "Coutinho", "Cunha", "Diniz", "Duarte", "Farias", "Fernandes",
  "Figueiredo", "Fonseca", "Freitas", "Galvão", "Gomes", "Guimarães", "Lacerda", "Leite", "Lima", "Lopes",
  "Macedo", "Machado", "Magalhães", "Martins", "Matos", "Medeiros", "Melo", "Mendes", "Menezes", "Miranda",
  "Monteiro", "Moraes", "Morais", "Moreira", "Mota", "Moura", "Nascimento", "Neves", "Nunes", "Oliveira",
  "Pacheco", "Paiva", "Peixoto", "Pereira", "Pinto", "Porto", "Prado", "Queiroz", "Ramos", "Rangel",
  "Rezende", "Ribeiro", "Rocha", "Rodrigues", "Sales", "Santos", "Silva", "Siqueira", "Sousa", "Souza",
  "Tavares", "Teixeira", "Valente", "Varela", "Vasconcelos", "Viana", "Vieira", "Xavier", "Cavalcanti", "Maranhão",
] as const;

/** Preposições que não contam como palavra do nome (e não podem se repetir na emenda). */
export const NAME_PREPOSITIONS = ["de", "da", "do", "dos", "das", "e"] as const;
