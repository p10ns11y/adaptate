import { err, ok, parse, type Issues } from "@adaptate/core/result";
import { z } from "zod";

export let order = z.object({ sku: z.string(), qty: z.number().int().positive() });
let stock: Record<string, number> = { "tea-01": 12, "mug-02": 0 };

export let price = (line: z.infer<typeof order>) => ({ ...line, total: line.qty * 4 });
export let reserve = (line: ReturnType<typeof price>) =>
  (stock[line.sku] ?? 0) >= line.qty ? ok(line) : err(`${line.sku} sold out`);
let field = ({ path = [] }: Issues[number]) =>
  path.map((part) => String(typeof part === "object" ? part.key : part)).join(".");
export let hold = (reason: Issues | string) => ({
  hold: typeof reason === "string" ? reason : `check ${reason.map(field).join(", ")}`,
});

export let ship = (input: unknown) => parse(order, input).map(price).flatMap(reserve).recover(hold);
