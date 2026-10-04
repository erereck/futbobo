import type { BotaoMatchResult } from "./types";

export default function BotaoMatchStats({ result }: { result: BotaoMatchResult }) {
  const rows: Array<[string, number, number]> = [
    ["Toques dados", result.stats.user.flicks, result.stats.cpu.flicks],
    ["Encostou na bola", result.stats.user.touches, result.stats.cpu.touches],
    ["Na trave", result.stats.user.posts, result.stats.cpu.posts],
  ];
  return <section className="botao-card" aria-label="Números da mesa">
    <span className="botao-card-title">Números da mesa</span>
    {rows.map(([label, mine, theirs]) => <div key={label} className="botao-stat-row">
      <b className={mine >= theirs ? "botao-stat-lead" : ""}>{mine}</b>
      <span>{label}</span>
      <b className={theirs >= mine ? "botao-stat-lead" : ""}>{theirs}</b>
    </div>)}
  </section>;
}
