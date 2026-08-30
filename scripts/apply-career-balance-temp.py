from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"Expected one match in {path}, found {text.count(old)}")
    file.write_text(text.replace(old, new), encoding="utf-8")

replace_once(
    "app/career/events.ts",
    '''  const hiddenCeiling = fateRoll < 0.18
    ? 61 + Math.floor(ceilingRoll * 11)
    : fateRoll < 0.80
      ? 70 + Math.floor(ceilingRoll * 13)
      : fateRoll < 0.96
        ? 82 + Math.floor(ceilingRoll * 7)
        : fateRoll < 0.99
          ? 89 + Math.floor(ceilingRoll * 6)
          : 95 + Math.floor(ceilingRoll * 5);''',
    '''  // Só uma carreira realmente azarada nasce com teto abaixo de 70.
  // A distribuição foi centrada em ~80 para que craques sejam comuns sem banalizar 90+.
  const hiddenCeiling = fateRoll < 0.01
    ? 61 + Math.floor(ceilingRoll * 9)
    : fateRoll < 0.65
      ? 70 + Math.floor(ceilingRoll * 13)
      : fateRoll < 0.90
        ? 82 + Math.floor(ceilingRoll * 8)
        : fateRoll < 0.98
          ? 90 + Math.floor(ceilingRoll * 5)
          : 95 + Math.floor(ceilingRoll * 5);''',
)

replace_once(
    "app/career/events.ts",
    '''export function applyEffect(state: GameState, effect: Effect) {
  const overall = clamp(state.overall + (effect.ovr ?? 0), 40, 99);''',
    '''export function applyEffect(state: GameState, effect: Effect) {
  const nextPotential = clamp(state.potential + (effect.potential ?? 0), 45, 99);
  // Potencial volta a funcionar como teto real: eventos podem elevar o teto, mas não furá-lo.
  const overall = clamp(state.overall + (effect.ovr ?? 0), 40, Math.max(state.overall, nextPotential));''',
)

replace_once(
    "app/career/events.ts",
    '''    potential: clamp(state.potential + (effect.potential ?? 0), 45, 99),''',
    '''    potential: nextPotential,''',
)

replace_once(
    "app/career/simulation.ts",
    '''  const quality = clamp((affected.overall - 48) / 35, 0.45, 1.5);
  const roleProductionBonus = seasonRole === "estrela" ? 0.12 : seasonRole === "titular" ? 0.07 : seasonRole === "rotacao" ? 0.02 : seasonRole === "reserva" ? -0.03 : 0;
  const productionMomentum = clamp(
    1.1 + roleProductionBonus + (affected.morale - 50) / 250 + (affected.managerTrust - 50) / 300 + (affected.fitness - 70) / 500 + (affected.lifeBalance - 55) / 620,
    0.9,
    1.45,
  ) * consistencySwing;
  const finishingFactor = clamp(0.45 + finishingSkill / 100, 0.68, 1.44) * (hasTrait("clinical-finisher") ? 1.13 : 1) * (hasTrait("free-kick") ? 1.04 : 1);
  const creationFactor = clamp(0.45 + creationSkill / 100, 0.68, 1.44) * (hasTrait("playmaker") ? 1.13 : 1);
  const lowOverallProductionBrake = affected.overall < 80 ? 0.76 + Math.max(0, affected.overall - 42) / 100 : 1;
  const goalRate = position.goals * quality * finishingFactor * productionMomentum * lowOverallProductionBrake * (0.82 + seeded(state.seed, state.season * 7) * 1.02);
  const assistRate = position.assists * quality * creationFactor * productionMomentum * (affected.overall < 80 ? 0.88 : 1) * (0.82 + seeded(state.seed, state.season * 13) * 1.02);''',
    '''  // Produção é centrada em 1x no nível ~80. Antes, só o sorteio de forma tinha média 1.33x,
  // o que transformava jogadores bons em recordistas históricos quase automaticamente.
  const quality = clamp(0.62 + (affected.overall - 60) * 0.018, 0.48, 1.35);
  const roleProductionBonus = seasonRole === "estrela" ? 0.12 : seasonRole === "titular" ? 0.07 : seasonRole === "rotacao" ? 0.02 : seasonRole === "reserva" ? -0.03 : 0;
  const productionMomentum = clamp(
    0.96 + roleProductionBonus + (affected.morale - 50) / 300 + (affected.managerTrust - 50) / 360 + (affected.fitness - 70) / 600 + (affected.lifeBalance - 55) / 720,
    0.8,
    1.22,
  ) * consistencySwing;
  const finishingFactor = clamp(0.58 + finishingSkill / 190, 0.75, 1.12) * (hasTrait("clinical-finisher") ? 1.1 : 1) * (hasTrait("free-kick") ? 1.03 : 1);
  const creationFactor = clamp(0.58 + creationSkill / 190, 0.75, 1.12) * (hasTrait("playmaker") ? 1.1 : 1);
  const lowOverallProductionBrake = affected.overall < 75 ? clamp(0.82 + (affected.overall - 55) * 0.009, 0.72, 1) : 1;
  const goalForm = 0.84 + seeded(state.seed, state.season * 7) * 0.32;
  const assistForm = 0.84 + seeded(state.seed, state.season * 13) * 0.32;
  const goalRate = position.goals * quality * finishingFactor * productionMomentum * lowOverallProductionBrake * goalForm;
  const assistRate = position.assists * quality * creationFactor * productionMomentum * lowOverallProductionBrake * assistForm;''',
)

replace_once(
    "app/career/simulation.ts",
    '''  if (affected.age <= 22) {
    const catchUp = affected.overall < 56 ? 4 : affected.overall < 61 ? 3 : affected.overall < 66 ? 2 : affected.overall < 70 ? 1 : 0;
    development += Math.max(0, catchUp - (appearances < 10 ? 1 : 0));
  }
  const performanceScore = seasonPerformanceScore(affected.position, {''',
    '''  if (affected.age <= 22) {
    const catchUp = affected.overall < 56 ? 4 : affected.overall < 61 ? 3 : affected.overall < 66 ? 2 : affected.overall < 70 ? 1 : 0;
    development += Math.max(0, catchUp - (appearances < 10 ? 1 : 0));
  }
  // Quem ainda está muito longe do próprio teto recebe uma pressão leve de desenvolvimento.
  // Isso reduz diferenças artificiais entre posições sem dar OVR grátis a quem já chegou perto do potencial.
  if (affected.age <= 27 && affected.overall < affected.potential) {
    const potentialGap = affected.potential - affected.overall;
    const gapCatchUpChance = potentialGap >= 10 ? 0.9 : potentialGap >= 7 ? 0.65 : potentialGap >= 4 ? 0.32 : 0;
    if (gapCatchUpChance > 0 && seeded(state.seed, state.season * 1877 + 41) < gapCatchUpChance) development += 1;
  }
  const performanceScore = seasonPerformanceScore(affected.position, {''',
)

replace_once(
    "app/career/simulation.ts",
    '''  const chosenPosition = pick(POSITIONS, seed, 701 + careerIndex).key;''',
    '''  // Amostragem estratificada: evita correlação entre a seed que escolhe a posição e a seed do potencial.
  const chosenPosition = POSITIONS[careerIndex % POSITIONS.length].key;''',
)

print("Career balance patch applied")
