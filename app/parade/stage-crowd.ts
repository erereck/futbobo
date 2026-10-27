// Multidão, trio elétrico, taça e efeitos da festa do título.
//
// Unidades em METROS (ver `stage-city.ts`). Tudo instanciado e animado no
// shader sempre que der: milhares de pessoas em poucos draw calls. A
// implementação mora nos módulos `crowd-*`; este arquivo é o contrato que o
// palco (`parade-stage.ts`) importa.
//
// Draw calls: multidão 6 (+1 lanternas de celular à tarde/noite), trio 3 (+1
// fachos de luz à tarde/noite), efeitos 3, taça 2. O modo desempenho corta
// quantidade (pessoas, papel, fumaça), não draw calls. Sem mapa de sombra.

export { buildCrowd, type CrowdArgs, type CrowdBuild, type CrowdState } from "./crowd-people";
export { buildTrio, type TrioArgs, type TrioBuild } from "./crowd-trio";
export { buildWorldCupTrophy, WORLD_CUP_TROPHY_HEIGHT } from "./crowd-trophy";
export { buildEffects, type EffectsArgs, type EffectsBuild } from "./crowd-effects";
