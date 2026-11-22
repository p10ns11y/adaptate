# React view

One recipe schema. The card checks the title. The kitchen also checks how many people.

`useViewSchema` calls `transformSchema` and keeps the view schema for that component. Vue, Svelte, and Solid can call `transformSchema` the same way. This folder is the React example.

Build `@adaptate/core` first, then run the test. It renders the components with `react-dom/server`. No browser.

```sh
pnpm --filter @adaptate/core build
pnpm --filter adaptate-react-view test
```
