export type ProductSize = 'square' | 'landscape' | 'large';

export function priceCents(size: ProductSize, pages: number): number {
  if (!Number.isInteger(pages) || pages < 1 || pages > 80) throw new Error('Invalid page count');
  return (
    {
      square: 2900,
      landscape: 3500,
      large: 4900,
    }[size] +
    Math.max(0, pages - 20) * 125
  );
}

export const sizes = {
  square: { widthMm: 210, heightMm: 210 },
  landscape: { widthMm: 280, heightMm: 210 },
  large: { widthMm: 300, heightMm: 300 },
} as const;

export function resolutionDpi(pixels: number, widthMm: number, elementWidth: number): number {
  return pixels / ((widthMm * elementWidth) / 1000 / 25.4);
}

export const jobOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: false,
} as const;
