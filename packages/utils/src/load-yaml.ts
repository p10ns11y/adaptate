import yaml from 'js-yaml';

export async function getYamlContent(fileURL: string, relativePath: string) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { dirname } = path;
  const fileURLPath = fileURLToPath(fileURL);
  const callerDirectoryName = dirname(fileURLPath);
  const yamlFilePath = path.resolve(callerDirectoryName, relativePath);
  const openapiDocument = yaml.load(
    fs.readFileSync(yamlFilePath, 'utf8')
  ) as any;

  return openapiDocument;
}
