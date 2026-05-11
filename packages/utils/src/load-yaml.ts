import yaml from 'js-yaml';

export async function getYamlContent(fileURL: string, relativePath: string): Promise<unknown> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const fileURLPath = fileURLToPath(fileURL);
  const callerDirectoryName = path.dirname(fileURLPath);
  const yamlFilePath = path.resolve(callerDirectoryName, relativePath);

  const fileContent = await fs.readFile(yamlFilePath, 'utf8');
  const loaded = yaml.load(fileContent);

  return loaded as unknown;
}