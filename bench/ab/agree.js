import { createApps } from "./measure.js";
import {
  orderDocument,
  partialsForDeltas,
  toolCallDeltas,
} from "./order.js";

function edit(mutator) {
  const clone = structuredClone(orderDocument);
  mutator(clone);
  return clone;
}

function preview(value) {
  if (value === undefined) return "undefined";
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

export async function agree() {
  const apps = await createApps();
  const cases = [
    { name: "full order", document: orderDocument, full: true, partial: true },
    {
      name: "missing orderId",
      document: edit((document) => {
        delete document.orderId;
      }),
      full: false,
      partial: true,
    },
    {
      name: "missing notes",
      document: edit((document) => {
        delete document.notes;
      }),
      full: true,
      partial: true,
    },
    {
      name: "missing phone",
      document: edit((document) => {
        delete document.customer.phone;
      }),
      full: true,
      partial: true,
    },
    {
      name: "missing customer",
      document: edit((document) => {
        delete document.customer;
      }),
      full: false,
      partial: true,
    },
    {
      name: "missing items",
      document: edit((document) => {
        delete document.items;
      }),
      full: false,
      partial: true,
    },
    {
      name: "empty items",
      document: edit((document) => {
        document.items = [];
      }),
      full: true,
      partial: true,
    },
    {
      name: "missing sku",
      document: edit((document) => {
        delete document.items[0].sku;
      }),
      full: false,
      partial: true,
    },
    {
      name: "qty string",
      document: edit((document) => {
        document.items[0].qty = "2";
      }),
      full: false,
      partial: false,
    },
    {
      name: "bad method",
      document: edit((document) => {
        document.fulfillment.method = "drone";
      }),
      full: false,
      partial: false,
    },
    {
      name: "missing city",
      document: edit((document) => {
        delete document.fulfillment.address.city;
      }),
      full: false,
      partial: true,
    },
    {
      name: "city number",
      document: edit((document) => {
        document.fulfillment.address.city = 1;
      }),
      full: false,
      partial: false,
    },
    {
      name: "missing line1",
      document: edit((document) => {
        delete document.fulfillment.address.line1;
      }),
      full: true,
      partial: true,
    },
    { name: "empty object", document: {}, full: false, partial: true },
    {
      name: "orderId only",
      document: { orderId: "ord_8f3a21" },
      full: false,
      partial: true,
    },
    {
      name: "sku only item",
      document: { items: [{ sku: "FLOUR-00" }] },
      full: false,
      partial: true,
    },
    {
      name: "bad qty item",
      document: { items: [{ qty: "2" }] },
      full: false,
      partial: false,
    },
    { name: "null customer", document: { customer: null }, full: false, partial: false },
    {
      name: "method only",
      document: { fulfillment: { method: "courier" } },
      full: false,
      partial: true,
    },
    {
      name: "drone method only",
      document: { fulfillment: { method: "drone" } },
      full: false,
      partial: false,
    },
  ];

  for (const spec of cases) {
    for (const app of [apps.zod, apps.adaptate, apps.valibot]) {
      const full = app.validateFull(spec.document);
      const partial = app.validatePartial(spec.document);
      if (full !== spec.full || partial !== spec.partial) {
        throw new Error(
          `${app.name} ${spec.name}: full ${full} (wanted ${spec.full}), partial ${partial} (wanted ${spec.partial})`,
        );
      }
    }
  }

  const { deltas } = toolCallDeltas(orderDocument);
  const partials = partialsForDeltas(deltas, apps.parsePartialJson);
  const read = apps.adaptate.readStream();
  for (let index = 0; index < deltas.length; index += 1) {
    const parsed = partials[index];
    const zodResult = apps.zod.validatePartial(parsed);
    const valibotResult = apps.valibot.validatePartial(parsed);
    const adaptateResult = apps.adaptate.validatePartial(parsed);
    const outcome = read(deltas[index]);
    const pushed = outcome === undefined ? undefined : outcome.results.receipt.valid;
    if (
      zodResult !== valibotResult ||
      zodResult !== adaptateResult ||
      zodResult !== pushed
    ) {
      throw new Error(
        `chunk ${index} zod=${zodResult} adaptate=${adaptateResult} valibot=${valibotResult} push=${pushed} partial=${preview(parsed)}`,
      );
    }
    if (outcome === undefined) {
      if (parsed !== undefined) {
        throw new Error(`chunk ${index} parser disagreed: ${preview(parsed)}`);
      }
      continue;
    }
    if (JSON.stringify(outcome.partial) !== JSON.stringify(parsed)) {
      throw new Error(
        `chunk ${index} partial ${preview(outcome.partial)} vs ${preview(parsed)}`,
      );
    }
  }
  return { chunks: deltas.length, bytes: toolCallDeltas(orderDocument).bytes };
}
