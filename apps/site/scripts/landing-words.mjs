import { landingWords } from "../src/site/landing-copy.ts";

let words = landingWords();
console.log(`Landing copy (hero, cards, proof, agents): ${words.length} words.`);
if (words.length < 120 || words.length > 200) {
  console.error("Landing copy must stay between 120 and 200 words.");
  process.exit(1);
}
