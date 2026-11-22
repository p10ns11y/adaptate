import { z } from "zod";

export let tokenNames = ["plume-core", "thrust", "ember", "void", "ocean", "cloud", "sky", "exhaust"] as const;

let tokenSchema = z.object({
  hex: z.string().regex(/^#[0-9A-F]{6}$/),
  role: z.string().min(3),
});

export let paletteSchema = z.object({
  tokens: z.object(Object.fromEntries(tokenNames.map((name) => [name, tokenSchema])) as Record<(typeof tokenNames)[number], typeof tokenSchema>).strict(),
});

export type Palette = z.infer<typeof paletteSchema>;

function channel(value: number): number {
  let scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  let red = Number.parseInt(hex.slice(1, 3), 16);
  let green = Number.parseInt(hex.slice(3, 5), 16);
  let blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrastRatio(foreground: string, background: string): number {
  let first = relativeLuminance(foreground);
  let second = relativeLuminance(background);
  let [light, dark] = first > second ? [first, second] : [second, first];
  return (light + 0.05) / (dark + 0.05);
}
