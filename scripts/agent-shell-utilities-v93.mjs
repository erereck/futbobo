import fs from "node:fs";
const path = "app/components/shell/FutboboShell.tsx";
let source = fs.readFileSync(path, "utf8");
function replaceOnce(search, replacement, label){
 if(source.includes(replacement)) return;
 const first=source.indexOf(search); if(first<0) throw new Error(`Missing ${label}`);
 if(source.indexOf(search,first+search.length)>=0) throw new Error(`Ambiguous ${label}`);
 source=source.slice(0,first)+replacement+source.slice(first+search.length);
}
replaceOnce('import styles from "./FutboboShell.module.css";','import styles from "./FutboboShell.module.css";\nimport { InstallScreen, NewsScreen, SettingsScreen } from "./ShellUtilityScreens";','utility import');
replaceOnce('type ShellScreen = "home" | "modes" | "saves" | "achievements" | "hall" | "career" | "legacy-tool";','type ShellScreen = "home" | "modes" | "saves" | "achievements" | "hall" | "settings" | "install" | "news" | "career" | "legacy-tool";','screen union');
replaceOnce('<button type="button" onClick={() => openLegacyTool("settings")}><span>⚙</span>Configurações</button>','<button type="button" onClick={() => setScreen("settings")}><span>⚙</span>Configurações</button>','settings button');
replaceOnce('<button type="button" onClick={() => openLegacyTool("install")}><span>▣</span>Instalar</button>','<button type="button" onClick={() => setScreen("install")}><span>▣</span>Instalar</button>','install button');
replaceOnce('<button type="button" onClick={() => openLegacyTool("news")}><span>●</span>Novidades</button>','<button type="button" onClick={() => setScreen("news")}><span>●</span>Novidades</button>','news button');
const anchor='      {screen === "modes" && (';
const screens='      {screen === "settings" && <SettingsScreen />}\n      {screen === "install" && <InstallScreen />}\n      {screen === "news" && <NewsScreen />}\n\n';
if(!source.includes(screens)){const i=source.indexOf(anchor); if(i<0) throw new Error("Missing modes anchor"); source=source.slice(0,i)+screens+source.slice(i);}
fs.writeFileSync(path,source);
console.log("Native v93 utility screens integrated.");
