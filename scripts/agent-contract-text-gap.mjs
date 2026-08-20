import fs from "node:fs";

const path = "app/components/career/PlayerCreationV2.module.css";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  [
    ".contractOffers button { grid-template-columns:44px minmax(0,1fr) 20px; gap:10px; min-width:0; }",
    ".contractOffers button { grid-template-columns:44px minmax(0,1fr) 20px; gap:12px; min-width:0; }",
    "contract offer gap <=760",
  ],
  [
    ".contractOffers span { min-width:0; }",
    ".contractOffers span { min-width:0; padding-left:6px; }",
    "contract offer text spacing",
  ],
  [
    ".contractOffers button { grid-template-columns:40px minmax(0,1fr) 18px; padding:11px 9px; }",
    ".contractOffers button { grid-template-columns:40px minmax(0,1fr) 18px; gap:12px; padding:11px 9px; }",
    "contract offer gap <=480",
  ],
];

for (const [from, to, label] of replacements) {
  if (source.includes(to)) continue;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0 && label === "contract offer text spacing") {
    throw new Error(`Ambiguous ${label}`);
  }
  source = source.replace(from, to);
}

fs.writeFileSync(path, source);
console.log("First-contract mobile text spacing tightened.");
