const fulfillmentMethods = ["pickup", "courier"];

export const receiptConfig = {
  orderId: true,
  customer: { name: true, email: true },
  items: { "*": { sku: true, qty: true } },
  fulfillment: {
    method: true,
    address: { city: true, postalCode: true },
  },
};

export const orderCardConfig = {
  orderId: true,
  customer: { name: true },
};

export const orderItemsConfig = {
  items: { "*": { sku: true, qty: true } },
};

export const orderDeliveryConfig = {
  fulfillment: {
    method: true,
    address: { city: true, postalCode: true },
  },
};

export const orderViewConfigs = [
  orderCardConfig,
  orderItemsConfig,
  orderDeliveryConfig,
  receiptConfig,
];

export const deltaCharacters = 24;

export const orderDocument = {
  orderId: "ord_8f3a21",
  placedAt: "2026-11-20T18:04:11.000Z",
  customer: {
    name: "Ada Lovelace",
    email: "ada@analytical.example",
    phone: "+468123456",
  },
  items: [
    { sku: "FLOUR-00", name: "Tipo 00 flour", qty: 2, unitPrice: 4.5 },
    { sku: "TOMATO-SAN", name: "San Marzano tomatoes", qty: 6, unitPrice: 1.2 },
    { sku: "MOZZ-FIOR", name: "Fior di latte", qty: 3, unitPrice: 3.4 },
    { sku: "BASIL-GEN", name: "Genovese basil", qty: 1, unitPrice: 2 },
    { sku: "OLIVE-OIL", name: "Olive oil 500ml", qty: 1, unitPrice: 8.75 },
    { sku: "SALT-MAL", name: "Maldon salt", qty: 1, unitPrice: 3.1 },
    { sku: "YEAST-DRY", name: "Dry yeast", qty: 2, unitPrice: 1.05 },
    { sku: "HONEY-WIL", name: "Wildflower honey", qty: 1, unitPrice: 6.4 },
  ],
  fulfillment: {
    method: "courier",
    address: {
      line1: "12 Analytical Street",
      city: "Stockholm",
      postalCode: "11122",
      country: "SE",
    },
    windowStart: "2026-11-21T17:00:00.000Z",
    windowEnd: "2026-11-21T19:00:00.000Z",
  },
  notes: "Leave the tomatoes out of the cold bag.",
};

function requireSchema(required, schema) {
  return required ? schema : schema.optional();
}

export function orderSchema(zod, mode) {
  const strict = mode === "strict";
  const text = (required) => requireSchema(required, zod.string());
  const amount = (required) => requireSchema(required, zod.number());
  const method = (required) =>
    requireSchema(required, zod.enum(fulfillmentMethods));
  return zod.object({
    orderId: text(strict),
    placedAt: text(false),
    customer: requireSchema(
      strict,
      zod.object({
        name: text(strict),
        email: text(strict),
        phone: text(false),
      }),
    ),
    items: requireSchema(
      strict,
      zod.array(
        zod.object({
          sku: text(strict),
          name: text(false),
          qty: amount(strict),
          unitPrice: amount(false),
        }),
      ),
    ),
    fulfillment: requireSchema(
      strict,
      zod.object({
        method: method(strict),
        address: requireSchema(
          strict,
          zod.object({
            line1: text(false),
            city: text(strict),
            postalCode: text(strict),
            country: text(false),
          }),
        ),
        windowStart: text(false),
        windowEnd: text(false),
      }),
    ),
    notes: text(false),
  });
}

export function toolCallDeltas(document = orderDocument) {
  const text = JSON.stringify(document);
  const deltas = [];
  for (let cursor = 0; cursor < text.length; cursor += deltaCharacters) {
    deltas.push(text.slice(cursor, cursor + deltaCharacters));
  }
  return {
    text,
    deltas,
    bytes: new TextEncoder().encode(text).length,
  };
}

export function encodePartials(partials) {
  return partials.map((partial) =>
    partial === undefined
      ? { missing: true }
      : { missing: false, value: partial },
  );
}

export function decodePartials(encoded) {
  return encoded.map((entry) => (entry.missing ? undefined : entry.value));
}

export function partialsForDeltas(deltas, parsePartialJson) {
  const partials = [];
  let buffer = "";
  for (const delta of deltas) {
    buffer += delta;
    partials.push(parsePartialJson(buffer));
  }
  return partials;
}
