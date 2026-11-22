import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["examples/react-view/recipe-card.check.jsx"],
  },
});
