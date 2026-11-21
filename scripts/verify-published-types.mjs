#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([variableName]) => !variableName.toLowerCase().startsWith('npm_'),
  ),
);
const packDirectory = mkdtempSync(join(tmpdir(), 'verify-types-'));
let packedFilePaths;
try {
  execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--silent', '--pack-destination', packDirectory],
    { cwd: packageDirectory, env: cleanEnvironment, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const tarballs = readdirSync(packDirectory).filter((fileName) => fileName.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`expected one tarball, found ${tarballs.length}`);
  }
  const listing = execFileSync('tar', ['-tzf', join(packDirectory, tarballs[0])], {
    encoding: 'utf8',
  });
  packedFilePaths = new Set(
    listing
      .split('\n')
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.replace(/^package\//, '')),
  );
} catch (error) {
  console.error(`${packageJson.name}: npm pack failed: ${error.message}`);
  process.exit(1);
} finally {
  rmSync(packDirectory, { recursive: true, force: true });
}

if (!packedFilePaths.has(typesRelativePath)) {
  console.error(
    `${packageJson.name}: ${typesField} is not in the publish tarball`,
  );
  process.exit(1);
}

const exportTypePaths = Object.values(packageJson.exports ?? {})
  .map((exportEntry) => (typeof exportEntry === 'object' && exportEntry !== null ? exportEntry.types : undefined))
  .filter((exportTypes) => typeof exportTypes === 'string' && !exportTypes.includes('*'))
  .map((exportTypes) => exportTypes.replace(/^\.\//, ''));
for (const exportTypesPath of exportTypePaths) {
  if (!packedFilePaths.has(exportTypesPath)) {
    console.error(`${packageJson.name}: exports types ${exportTypesPath} is not in the publish tarball`);
    process.exit(1);
  }
}

console.log(`${packageJson.name}: publish tarball includes ${typesField} and all exports types`);