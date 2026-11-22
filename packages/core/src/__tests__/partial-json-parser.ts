import { createPartialJsonFeed } from "../stream-incremental";

export function createPartialJsonParser() {
  const pushChunk = createPartialJsonFeed();
  let visits = 0;
  return {
    get visits() {
      return visits;
    },
    push(chunk: string) {
      visits += chunk.length;
      return pushChunk(chunk);
    },
  };
}
