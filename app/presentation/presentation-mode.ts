// Qual palco a apresentação usa, pelas mesmas preferências do Modo 3D da
// partida. Módulo pequeno de propósito: quem abre a apresentação (com
// next/dynamic) decide o modo sem baixar o componente antes da hora.

import { readBotao3dPerformance, readBotao3dPreference, webglAvailable } from "../botao/view-mode";

export function presentationViewMode(): { mode: "3d" | "2d"; performance: boolean } {
  const mode = readBotao3dPreference() && webglAvailable() ? "3d" : "2d";
  return { mode, performance: readBotao3dPerformance().enabled };
}
