## Installation

To install the library, use npm or yarn:

```sh
npm install @adaptate/core
# or
yarn add @adaptate/core
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
import { transformSchema } from '@adaptate/core';

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
