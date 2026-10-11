// Estampas de uniforme. A camisa (busto ou corpo inteiro) recorta o desenho;
// aqui só se pinta o padrão dentro da caixa da camisa.

export type KitBox = { x: number; y: number; w: number; h: number };

export function paintKitPattern(
  ctx: CanvasRenderingContext2D,
  pattern: number,
  primary: string,
  secondary: string,
  box: KitBox,
) {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  ctx.fillStyle = primary;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = secondary;
  switch (pattern) {
    case 0: // Faixa central
      ctx.fillRect(cx - w * 0.12, y, w * 0.24, h);
      break;
    case 2: { // Listras
      const stripe = w / 9;
      for (let index = 1; index < 9; index += 2) ctx.fillRect(x + index * stripe, y, stripe, h);
      break;
    }
    case 3: // Metade a metade
      ctx.fillRect(cx, y, w / 2 + 1, h);
      break;
    case 4: // Faixa diagonal
      ctx.save();
      ctx.translate(cx, y + h * 0.45);
      ctx.rotate(-0.62);
      ctx.fillRect(-w, -w * 0.09, w * 2, w * 0.18);
      ctx.restore();
      break;
    case 5: { // Chevrons
      const top = y + h * 0.16;
      const depth = h * 0.2;
      const band = h * 0.11;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(cx, top + depth);
      ctx.lineTo(x + w, top);
      ctx.lineTo(x + w, top + band);
      ctx.lineTo(cx, top + depth + band);
      ctx.lineTo(x, top + band);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 6: // Ombros
      ctx.fillRect(x, y, w, h * 0.2);
      break;
    case 7: { // Pinstripes
      const gap = w / 14;
      for (let line = x + gap / 2; line < x + w; line += gap) ctx.fillRect(line, y, Math.max(0.8, w * 0.012), h);
      break;
    }
    case 8: // Faixa horizontal
      ctx.fillRect(x, y + h * 0.36, w, h * 0.18);
      break;
    case 9: { // Quadriculado
      const size = w / 6;
      for (let row = 0; row * size < h; row += 1) {
        for (let column = 0; column < 6; column += 1) {
          if ((row + column) % 2 === 0) ctx.fillRect(x + column * size, y + row * size, size, size);
        }
      }
      break;
    }
    case 10: { // Degradê
      const gradient = ctx.createLinearGradient(0, y, 0, y + h);
      gradient.addColorStop(0, primary);
      gradient.addColorStop(1, secondary);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);
      break;
    }
  }
}

/** Cor de cada manga [esquerda, direita] para a estampa. */
export function sleeveColors(pattern: number, primary: string, secondary: string): [string, string] {
  if (pattern === 11 || pattern === 6) return [secondary, secondary];
  if (pattern === 3) return [primary, secondary];
  return [primary, primary];
}
