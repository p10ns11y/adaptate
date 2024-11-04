import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';

export async function loadAndResolveYAML(
  fileURL: string,
  relativePath: string
) {
  try {
    let fileURLPath = fileURLToPath(fileURL);
    let callerDirectoryName = dirname(fileURLPath);
    let yamlFilePath = path.resolve(
      callerDirectoryName,
      relativePath
      // `fixtures/${relativePath}`
    );
    const openapiDocument = yaml.load(
      fs.readFileSync(yamlFilePath, 'utf8')
    ) as string;

    const dereferenced = await SwaggerParser.dereference(openapiDocument);

    // console.log(JSON.stringify(dereferenced, null, 2));

    return dereferenced;
  } catch (error) {
    console.error('Error:', error);
  }
}
