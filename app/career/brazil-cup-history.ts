/**
 * Campeões conhecidos antes da bifurcação do save. A edição de 2026 ainda não
 * terminou na data-base do jogo, portanto não recebe um vencedor inventado.
 * Fontes: https://www.cbf.com.br/futebol-brasileiro/noticias/times/a/elenco-do-corinthians-celebra-tetracampeonato-da-copa-do-brasil
 * e https://arquivodabola.com.br/campeonato/copa-do-brasil.html
 */
export const BRAZIL_CUP_HISTORIC_CHAMPIONS: ReadonlyArray<{ season: number; winnerId: string; runnerUpId: string }> = (
  [
    [1989, "gremio", "sport"], [1990, "flamengo", "goias"], [1991, "criciuma", "gremio"],
    [1992, "internacional", "fluminense"], [1993, "cruzeiro", "gremio"], [1994, "gremio", "ceara"],
    [1995, "corinthians", "gremio"], [1996, "cruzeiro", "palmeiras"], [1997, "gremio", "flamengo"],
    [1998, "palmeiras", "cruzeiro"], [1999, "juventude", "botafogo"], [2000, "cruzeiro", "sao-paulo"],
    [2001, "gremio", "corinthians"], [2002, "corinthians", "historic-brasiliense"], [2003, "cruzeiro", "flamengo"],
    [2004, "historic-santo-andre", "flamengo"], [2005, "historic-paulista", "fluminense"],
    [2006, "flamengo", "vasco"], [2007, "fluminense", "figueirense"], [2008, "sport", "corinthians"],
    [2009, "corinthians", "internacional"], [2010, "santos", "vitoria"], [2011, "vasco", "coritiba"],
    [2012, "palmeiras", "coritiba"], [2013, "flamengo", "athletico"], [2014, "atletico-mg", "cruzeiro"],
    [2015, "palmeiras", "santos"], [2016, "gremio", "atletico-mg"], [2017, "cruzeiro", "flamengo"],
    [2018, "cruzeiro", "corinthians"], [2019, "athletico", "internacional"], [2020, "palmeiras", "gremio"],
    [2021, "atletico-mg", "athletico"], [2022, "flamengo", "corinthians"], [2023, "sao-paulo", "flamengo"],
    [2024, "flamengo", "atletico-mg"], [2025, "corinthians", "vasco"],
  ] as Array<[number, string, string]>
).map(([season, winnerId, runnerUpId]) => ({ season, winnerId, runnerUpId }));

/** Clubes históricos sem elenco jogável no catálogo atual. */
export const BRAZIL_CUP_ARCHIVE_ONLY_CLUBS: Record<string, string> = {
  "historic-santo-andre": "Santo André",
  "historic-paulista": "Paulista",
  "historic-brasiliense": "Brasiliense",
};
