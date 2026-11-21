import { parseSpecDocumentText } from './parse-spec-document.js';

export async function getYamlContent(fileURL: string, relativePath: string): Promise<any> {
  let fs = await import('node:fs/promises');
  let path = await import('node:path');
  let { fileURLToPath } = await import('node:url');

  let fileURLPath = fileURLToPath(fileURL);
  let callerDirectoryName = path.dirname(fileURLPath);
  let specFilePath = path.resolve(callerDirectoryName, relativePath);

  let fileContent = await fs.readFile(specFilePath, 'utf8');
  return parseSpecDocumentText(fileContent);
}
