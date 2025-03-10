# Adaptate

Dynamic and Adaptable Model Validator Using Zod, Interoperable with OpenAPI

![Coverage Badge](/coverage-badge.svg)

## Overview

`adaptate` is a dynamic and adaptable model validator that leverages the power of Zod for schema validation and is interoperable with OpenAPI. This library allows you to define, validate, and transform schemas seamlessly.

## Features

- Make schemas required based on configuration
- Apply conditional requirements to schemas
- Convert JSON Schema to Zod schemas
- Convert Zod schemas to OpenAPI schemas

## Installation

To install the library, use npm or yarn:

```sh
npm install adaptate
# or
yarn add adaptate
```

## Usage

So what this package ~~Sells~~ solves while there are so many packages in the [ecosystem](https://zod.dev/?id=ecosystem) out there.

#### The pitch for a common use case

In real-world web applications (for the sake of brevity assuming component-oriented apps/pages where the view/page is divided into composed components), developers run into an untreated and often unnoticed issue of data (props) flow into components.

Imagine a hypothetical page component

```tsx
{
  /* I will check authentication and authorization to access this page
    And put necessary session information and render the content if it is successful
  */
}
<Page>
  <Sidebar>
    <Navigations />
  </Sidebar>
  {/* I will fetch the business data from an API endpoint, say, `/api/participants` once and
      Pass it down or put it in the global store. This data, either as a whole (not likely)
      Or partially will be used by 1000s of components on this page
      And from the same data model, each component requires different properties
  */}
  <Main>
    <Content>
      <ComponentOne
        data={
          'I need so and so props from the parent to behave and function as expected'
        }
      />
      <ComponentTwo
        data={
          'I need only these props from the parent to behave and function as expected'
        }
      />
      {/* Oops! I am also used on some other page
          Where the same data model has more properties
          And the data comes from another endpoint, say, `/api/participants/participantId`.
          And I am one of the most used components and many developers individually
          Extend the component based on requirements. Yes, communication loop and forgetting
          That it is also used in some other place is a problem when working on the component
          In isolation
        */}
      <ComponentThree
        data={
          'I need all these props from the parent to behave and function as expected'
        }
      />
      <ComponentFour
        data={
          'I need everything from the parent to behave and function as expected'
        }
      />
    </Content>
  </Main>
</Page>;
```

## Make Required Schema Based on Configuration

You can make a Zod schema required based on a configuration (components need) using the transformSchema function.

```ts
import { z } from 'zod';
import { transformSchema } from 'adaptate';

const schema = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
    })
    .optional(),
});

const config = {
  name: true,
  age: true,
  address: {
    city: true,
  },
};

const updatedSchema = transformSchema(schema, config);

updatedSchema.parse({
  name: 'Davin',
  age: 30,
  address: {
    city: 'Pettit',
  },
}); // will pass

updatedSchema.parse({
  name: 'Davin',
  age: 30,
  address: {
    street: 'First Avenue',
  },
}); // will throw as required city property is missing
```

## What more can be cooked?

#### Conditional Schema Transformer

<details>
<summary>Make Conditional Schema Transformer</summary>

You can make conditional schema transfer using data early and later use the transformer taking `schema` and `config` with conditionals (`requiredIf`).

```ts
import { z } from 'zod';
import { makeConditionalSchemaTransformer } from 'adaptate';

const schema = z.object({
  firstName: z.string().optional(),
  secondName: z.string().optional(),
  parentContactNumber: z.number().optional(),
  age: z.number().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
    })
    .optional(),
  title: z.string().optional(),
});

const config = {
  parentContactNumber: {
    requiredIf: (data: any) => data.age < 18,
  },
  age: true,
  secondName: (data: any) => !!data.firstName,
};

let firstNameRequiredData = {
  firstName: 'Mario',
  age: 17,
};

let conditionalTransformer = makeConditionalSchemaTransformer(
  firstNameRequiredData
);

let transformer = conditionalTransformer(schema, config);

let transformedSchema = transformer.schema;

// To parse the data and validate
transformer.run(); // will throw as parentContactNumber is required
// Equivalent to transformer.schema.parse(data); and reduces verbosity

// Removes the conditional requirement if you want to use it with
// Regular transformSchema function
transformer.staticConfig = {
  age: true,
  secondName: (data: any) => !!data.firstName,
};
```

</details>

#### Converting OpenAPI Schema to Zod Schema (most commonly needed)

Refer [@adaptate/utils README](/packages/utils/README.md#converting-openapi-schema-to-zod-schema-most-commonly-needed)

#### Converting Zod Schema to OpenAPI Schema

Refer [@adaptate/utils README](/packages/utils/README.md#converting-zod-schema-to-openapi-schema)

#### Generate zod schemas(modules) from existing OpenAPI yml spec

Refer [@adaptate/utils README](/packages/utils/README.md#generate-zod-schemas-from-existing-openapi-spec)

## Credits

I have attempted to recreate what I have done at work with the help of **ChatGPT Canvas** model, the problem is simple and yet enough to test the muscle of code generators where the solution involved recursion and dealing with deep and nested data structures. It produced bugs and those are hard to figure out even for humans in the recursion context such as using correct APIs of the library (`required` instead of `unwrap`). I have tried to generate a minimal project with basic toolings. It did a decent job.

<details>
<summary> Suggestion vs Final edits</summary>

```diff
 import { z, ZodObject, ZodArray, ZodTypeAny } from 'zod';

-export function transformSchema(schema: ZodTypeAny, config: any, parentData: any = {}) {
-  const schemaWithConditionalRequirements = applyConditionalRequirements(schema, config, parentData);
-
-  if (schemaWithConditionalRequirements instanceof ZodObject && typeof config === 'object' && !Array.isArray(config)) {
-    const shape = schemaWithConditionalRequirements.shape;
-    const newShape = Object.fromEntries(
-      Object.entries(shape).map(([key, value]) => {
-        if (config[key] === true) {
-          return [key, value.required()];
-        } else if (typeof config[key] === 'object') {
-          return [key, transformSchema(value, config[key], parentData)];
-        }
-        return [key, value];
-      })
-    );
-    return z.object(newShape).required();
-  } else if (schemaWithConditionalRequirements instanceof ZodArray && config['*']) {
-    const elementSchema = schemaWithConditionalRequirements.element;
-    return z.array(transformSchema(elementSchema, config['*'], parentData));
-  }
-  return schemaWithConditionalRequirements;
+export function transformSchema(
+  schema: ZodTypeAny,
+  config: Config
+): ZodTypeAny {
+  function extendSchema(
+    partialSchema: ZodObject<any>,
+    partialConfig: Config
+  ): ZodObject<any> {
+    const unwrappedPartialSchema = partialSchema?.isOptional?.()
+      ? // @ts-ignore
+        partialSchema.unwrap()
+      : partialSchema;
+
+    if (
+      unwrappedPartialSchema instanceof ZodObject &&
+      typeof partialConfig === 'object' &&
+      !Array.isArray(partialConfig)
+    ) {
+      const shape = unwrappedPartialSchema.shape;
+      // @ts-ignore
+      const newShape = Object.fromEntries(
+        // @ts-ignore
+        Object.entries(shape).map(([key, value]) => {
+          // @ts-ignore
+          let unwrappedValue = value?.isOptional?.() ? value.unwrap() : value;
+          if (partialConfig[key] === true) {
+            // @ts-ignore
+            return [key, unwrappedValue];
+          } else if (typeof partialConfig[key] === 'object') {
+            // @ts-ignore
+            return [key, extendSchema(value, partialConfig[key])];
+          }
+          return [key, value];
+        })
+      );
+
+      let updatedPartialSchema = z.object(newShape);
+
+      // @ts-ignore
+      return unwrappedPartialSchema.merge(updatedPartialSchema);
+    }
+
+    if (unwrappedPartialSchema instanceof ZodArray && partialConfig['*']) {
+      const elementSchema = unwrappedPartialSchema.element as ZodObject<any>;
+
+      let updatedPartialSchema = z.array(
+        extendSchema(elementSchema, partialConfig['*'])
+      );
+
+      // @ts-ignore
+      return updatedPartialSchema;
+    }
+    return unwrappedPartialSchema;
+  }
+
+  let updatedSchema = schema;
+
+  if (schema instanceof ZodArray && config['*']) {
+    // @ts-ignore
+    updatedSchema = transformSchema(schema.element, config['*']);
+    updatedSchema = z.array(schema.element.merge(updatedSchema));
+  } else if (schema instanceof ZodObject) {
+    // @ts-ignore
+    updatedSchema = extendSchema(schema, config);
+    // @ts-ignore
+    updatedSchema = schema.merge(updatedSchema);
+  } else {
+    throw new Error('The given schema must be a Zod object.');
+  }
+
+  return updatedSchema;
 }
```

### Converting OpenAPI Schema to Zod Schema (most commonly needed)

Refer [@adaptate/utils README](/packages/utils/README.md#converting-openapi-schema-to-zod-schema-most-commonly-needed)

### Converting Zod Schema to OpenAPI Schema

The utility is in the early stage and not one to one. For complete and advanced use cases check [zod-to-json-schema](https://snyk.io/advisor/npm-package/zod-to-json-schema)

Refer [@adaptate/utils README](/packages/utils/README.md#converting-zod-schema-to-openapi-schema)

### Generate zod schemas(modules) from existing OpenAPI yml spec

Refer [@adaptate/utils README](/packages/utils/README.md#generate-zod-schemas-from-existing-openapi-spec)

</details>

[Full conversation with ChatGPT Canvas](https://chatgpt.com/share/6728eb4e-07f8-8005-b586-c4b8ee0e798c)

### So why?

<details>
  <summary>The Background</summary>

At [Oneflow AB](https://oneflow.com), we faced a situation where a component was used on two different pages, each receiving data from different endpoints. This led to discrepancies in the properties of the same model for valid reasons. To avoid breaking the app, I have built a run-time validation library that abstracted business data extensively. Although it wasn't completely this sophisticated, it supported specifying business entities, types such as `collection` or `entity`, and reusable specifications like `relations` to reduce the verbosity in config definitions. It also included React-specific hooks that worked seamlessly with error boundaries. This effort aims to create a more generic solution that can be extended to various use cases.

</details>
