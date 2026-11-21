#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');

let packageDirectory = process.argv[2];
if (packageDirectory === undefined) {
  console.error('Usage: node scripts/verify-published-types.mjs <package-directory>');
  process.exit(1);
}

if (!packageDirectory.startsWith('/')) {
  packageDirectory = join(repositoryRoot, packageDirectory);
}
packageDirectory = resolve(packageDirectory);

const packageJsonPath = join(packageDirectory, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const typesField = packageJson.types ?? packageJson.typings;

if (typeof typesField !== 'string' || typesField.length === 0) {
  console.error(`${packageJson.name}: package.json has no "types" field`);
  process.exit(1);
}

const typesRelativePath = typesField.replace(/^\.\//, '');
const typesAbsolutePath = join(packageDirectory, typesRelativePath);

if (!existsSync(typesAbsolutePath)) {
  console.error(
    `${packageJson.name}: types file missing on disk: ${typesField}`,
  );
  process.exit(1);
}

let packResults;
try {
  packResults = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: packageDirectory,
      encoding: 'utf8',
    }),
  );
} catch {
  console.error(`${packageJson.name}: npm pack --dry-run failed`);
  process.exit(1);
}

const packedFilePaths = new Set(
  packResults[0].files.map((packedFile) => packedFile.path),
);

if (!packedFilePaths.has(typesRelativePath)) {
  console.error(
    `${packageJson.name}: ${typesField} is not in the publish tarball (npm pack --dry-run)`,
  );
  process.exit(1);
}

console.log(`${packageJson.name}: publish tarball includes ${typesField}`);