import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeCard, RecipeKitchen } from "./recipe-card.jsx";

describe("recipe views", () => {
  it("shows the dish name when only the title has arrived", () => {
    let recipe = { title: "Pasta" };
    let card = renderToStaticMarkup(createElement(RecipeCard, { recipe }));
    let kitchen = renderToStaticMarkup(createElement(RecipeKitchen, { recipe }));
    expect(card).toBe("<p>Pasta</p>");
    expect(kitchen).toBe("<p>The kitchen is not ready.</p>");
  });

  it("keeps the card waiting when the title is missing", () => {
    let card = renderToStaticMarkup(createElement(RecipeCard, { recipe: {} }));
    expect(card).toBe("<p>The card is not ready.</p>");
  });

  it("shows the kitchen when the title and the number of servings are both present", () => {
    let recipe = { title: "Pasta", servings: 2 };
    let kitchen = renderToStaticMarkup(createElement(RecipeKitchen, { recipe }));
    expect(kitchen).toBe("<p>2</p>");
  });
});
