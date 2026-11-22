export type DocsPage = { path: string; markdown: string };

export function guideNames(indexMarkdown: string): string[];
export function docsPages(repositoryRoot: string): DocsPage[];
export function buildAgentIndexes(repositoryRoot: string): { llms: string; llmsFull: string; pageCount: number };
