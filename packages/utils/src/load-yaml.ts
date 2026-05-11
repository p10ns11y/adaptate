import yaml from 'js-yaml';

/**
 * Loads a YAML file and returns its content.
 * Note: js-yaml's load() returns 'any' because YAML can represent any JS value.
 */
export async function getYamlContent(fileURL: string, relativePath: string): Promise<any> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const fileURLPath = fileURLToPath(fileURL);
  const callerDirectoryName = path.dirname(fileURLPath);
  const yamlFilePath = path.resolve(callerDirectoryName, relativePath);

  const fileContent = await fs.readFile(yamlFilePath, 'utf8');
  return yaml.load(fileContent);
}