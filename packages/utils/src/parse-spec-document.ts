let missingYamlPackageMessage =
  'Optional peer dependency "js-yaml" is required to parse YAML. Install it with `pnpm add js-yaml`.';

type YamlLoad = (documentText: string) => unknown;

async function importYamlLoad(): Promise<YamlLoad> {
  let yamlModule: typeof import('js-yaml');
  try {
    yamlModule = await import('js-yaml');
  } catch {
    throw new Error(missingYamlPackageMessage);
  }

  let load = yamlModule.load;
  if (typeof load !== 'function') {
    throw new Error(missingYamlPackageMessage);
  }

  return (documentText: string) => load(documentText);
}

export async function parseSpecDocumentText(documentText: string): Promise<any> {
  let trimmedDocumentText = documentText.trim();
  try {
    return JSON.parse(trimmedDocumentText);
  } catch {
    let load = await importYamlLoad();
    return load(documentText);
  }
}
