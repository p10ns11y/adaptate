import yaml from 'js-yaml';

export async function getYamlContent(fileURL: string, relativePath: string) {
  let fs = await import('node:fs');
  let path = await import('node:path');
  let { fileURLToPath } = await import('node:url');
  let { dirname } = path;
  let fileURLPath = fileURLToPath(fileURL);
  let callerDirectoryName = dirname(fileURLPath);
  let yamlFilePath = path.resolve(callerDirectoryName, relativePath);
  let openapiDocument = yaml.load(
    fs.readFileSync(yamlFilePath, 'utf8')
  ) as string;

  return openapiDocument;
}
