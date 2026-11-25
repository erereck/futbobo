import type { Club } from "./game-data";

// Elenco da Ligue Professionnelle 1 da Tunísia na temporada 2026/27 (16 clubes).
// Saíram JS Kairouan, AS Soliman e AS Gabès; subiram ES Hammam-Sousse, PS Sakiet Eddaïer e CS Hammam-Lif.
// As forças e reputações são valores de balanceamento do Futbobo, não avaliações oficiais.
export const TUNISIA_CLUBS: Club[] = [
  // Os quatro grandes: Espérance e Club Africain dividem Túnis; Étoile e Sfaxien representam o litoral.
  { id: "esperance-tunis", name: "Espérance Sportive de Tunis", shortName: "Espérance", abbr: "EST", city: "Túnis", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#c8102e", secondary: "#f2b705", reputation: 5, strength: 77, academy: 5 },
  { id: "club-africain", name: "Club Africain", shortName: "Club Africain", abbr: "AFR", city: "Túnis", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#d71920", secondary: "#ffffff", reputation: 4, strength: 73, academy: 4 },
  { id: "cs-sfaxien", name: "Club Sportif Sfaxien", shortName: "CS Sfaxien", abbr: "CSS", city: "Sfax", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#111111", secondary: "#ffffff", reputation: 4, strength: 72, academy: 4 },
  { id: "etoile-sahel", name: "Étoile Sportive du Sahel", shortName: "Étoile du Sahel", abbr: "ESS", city: "Sousse", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#d71920", secondary: "#ffffff", reputation: 4, strength: 71, academy: 5 },

  // Pelotão intermediário, com clubes que costumam disputar as copas da CAF.
  { id: "us-monastir", name: "Union Sportive Monastirienne", shortName: "US Monastir", abbr: "USM", city: "Monastir", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#1d5fae", secondary: "#ffffff", reputation: 3, strength: 68, academy: 3 },
  { id: "stade-tunisien", name: "Stade Tunisien", shortName: "Stade Tunisien", abbr: "STU", city: "Túnis", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#d71920", secondary: "#08783e", reputation: 3, strength: 67, academy: 4 },
  { id: "us-ben-guerdane", name: "Union Sportive de Ben Guerdane", shortName: "US Ben Guerdane", abbr: "USB", city: "Ben Guerdane", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#f2c200", secondary: "#111111", reputation: 2, strength: 65, academy: 2 },
  { id: "ca-bizertin", name: "Club Athlétique Bizertin", shortName: "CA Bizertin", abbr: "CAB", city: "Bizerta", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#111111", secondary: "#f2c200", reputation: 3, strength: 64, academy: 3 },
  { id: "es-zarzis", name: "Espérance Sportive de Zarzis", shortName: "ES Zarzis", abbr: "ESZ", city: "Zarzis", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#f2c200", secondary: "#d71920", reputation: 2, strength: 64, academy: 2 },

  // Briga contra o rebaixamento.
  { id: "es-metlaoui", name: "Étoile Sportive de Métlaoui", shortName: "ES Métlaoui", abbr: "ESM", city: "Métlaoui", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#d71920", secondary: "#f2c200", reputation: 2, strength: 63, academy: 2 },
  { id: "js-omrane", name: "Jeunesse Sportive d'El Omrane", shortName: "JS Omrane", abbr: "JSO", city: "Túnis", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#f2c200", secondary: "#1d3f8f", reputation: 2, strength: 62, academy: 3 },
  { id: "as-marsa", name: "Avenir Sportif de La Marsa", shortName: "AS Marsa", abbr: "ASM", city: "La Marsa", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#f2c200", secondary: "#08783e", reputation: 2, strength: 61, academy: 3 },
  { id: "olympique-beja", name: "Olympique de Béja", shortName: "Olympique Béja", abbr: "OBJ", city: "Béja", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 61, academy: 2 },

  // Promovidos da Ligue 2 2025/26.
  { id: "cs-hammam-lif", name: "Club Sportif de Hammam-Lif", shortName: "CS Hammam-Lif", abbr: "CSH", city: "Hammam-Lif", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#08783e", secondary: "#ffffff", reputation: 2, strength: 60, academy: 3 },
  { id: "ps-sakiet-eddaier", name: "Progrès Sportif de Sakiet Eddaïer", shortName: "PS Sakiet Eddaïer", abbr: "PSS", city: "Sakiet Eddaïer", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#1d5fae", secondary: "#ffffff", reputation: 1, strength: 59, academy: 2 },
  { id: "es-hammam-sousse", name: "Espoir Sportif de Hammam-Sousse", shortName: "ES Hammam-Sousse", abbr: "EHS", city: "Hammam-Sousse", countryId: "tunisia", leagueId: "tunisia-ligue-1", primary: "#f2c200", secondary: "#111111", reputation: 1, strength: 58, academy: 2 },
];
