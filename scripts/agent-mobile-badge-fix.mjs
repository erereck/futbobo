import fs from "node:fs";

function patch(path, replacements) {
  let source = fs.readFileSync(path, "utf8");
  for (const [from, to, label] of replacements) {
    if (source.includes(to)) continue;
    const first = source.indexOf(from);
    if (first < 0) throw new Error(`Missing ${label} in ${path}`);
    if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label} in ${path}`);
    source = source.slice(0, first) + to + source.slice(first + from.length);
  }
  fs.writeFileSync(path, source);
}

patch("app/components/career/PlayerCreationV2.module.css", [
  [
    ".contractOffers button { grid-template-columns:58px minmax(0,1fr) 20px; gap:10px; min-width:0; }\n  .contractOffers :global(.club-badge-lg) { width:58px !important; height:58px !important; min-width:58px !important; }",
    ".contractOffers button { grid-template-columns:44px minmax(0,1fr) 20px; gap:10px; min-width:0; }\n  .contractOffers :global(.club-badge-lg) { width:44px !important; height:44px !important; min-width:44px !important; max-width:44px !important; max-height:44px !important; }",
    "contract badges <=760",
  ],
  [
    ".contractOffers button { grid-template-columns:52px minmax(0,1fr) 18px; padding:11px 9px; }\n  .contractOffers :global(.club-badge-lg) { width:52px !important; height:52px !important; min-width:52px !important; }",
    ".contractOffers button { grid-template-columns:40px minmax(0,1fr) 18px; padding:11px 9px; }\n  .contractOffers :global(.club-badge-lg) { width:40px !important; height:40px !important; min-width:40px !important; max-width:40px !important; max-height:40px !important; }",
    "contract badges <=480",
  ],
]);

patch("app/components/career/CareerTimeline.module.css", [
  [
    "  .row { grid-template-columns:46px 14px 38px minmax(0,1fr) 40px; gap:6px; min-height:76px; padding-right:6px; }",
    "  .row { grid-template-columns:46px 14px 32px minmax(0,1fr) 40px; gap:7px; min-height:76px; padding-right:6px; }\n  .row :global(.club-badge-sm) { width:32px !important; height:32px !important; min-width:32px !important; max-width:32px !important; max-height:32px !important; }",
    "timeline mobile badge",
  ],
]);

console.log("Mobile club badges tightened.");
