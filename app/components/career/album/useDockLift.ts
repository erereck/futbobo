"use client";

import { useEffect } from "react";

/**
 * Celular: o rodapé amarelo (dock, abas, folhas) fica preso em `bottom: var(--dock-lift)`.
 * Depois de telas sem rolagem (a partida de botão) alguns navegadores Android deixam a área de layout
 * maior que a parte visível, e o que está preso no rodapé nasce cortado até a pessoa arrastar a página.
 * Aqui a diferença entre a janela e a área visível vira `--dock-lift`, e o rodapé sobe até o que se vê.
 * Com o teclado aberto, o mesmo cálculo deixa a ação principal logo acima dele.
 */
export function useDockLift() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    // A barra de endereço do Android some e volta durante a rolagem e dispara resize sem parar:
    // só escreve no <html> quando o valor muda (cada escrita recalcula o estilo da página inteira).
    let current = "";
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Com zoom de pinça a área visível encolhe de propósito: aí o rodapé fica onde está.
        const hidden = viewport.scale > 1.01 ? 0 : window.innerHeight - viewport.height - viewport.offsetTop;
        const lift = Math.round(Math.max(0, Math.min(hidden, window.innerHeight * .6)));
        const next = `${lift}px`;
        if (next === current) return;
        current = next;
        root.style.setProperty("--dock-lift", next);
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      root.style.removeProperty("--dock-lift");
    };
  }, []);
}
