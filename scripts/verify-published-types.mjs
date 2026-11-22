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

const effectSourcePath = join(packageDirectory, 'src', 'effect.ts');
if (existsSync(effectSourcePath)) {
  const effectTypesRelativePath = 'build/effect.d.ts';
  const effectBundleRelativePath = 'build/effect.es.js';
  for (const relativePath of [effectTypesRelativePath, effectBundleRelativePath]) {
    if (!existsSync(join(packageDirectory, relativePath))) {
      console.error(`${packageJson.name}: ${relativePath} is missing on disk`);
      process.exit(1);
    }
    if (!packedFilePaths.has(relativePath)) {
      console.error(`${packageJson.name}: ${relativePath} is not in the publish tarball`);
      process.exit(1);
    }
  }
  const effectBundle = readFileSync(join(packageDirectory, effectBundleRelativePath), 'utf8');
  if (!/from ["']effect["']/.test(effectBundle)) {
    console.error(`${packageJson.name}: ${effectBundleRelativePath} does not externalize effect`);
    process.exit(1);
  }
  const effectTypes = readFileSync(join(packageDirectory, effectTypesRelativePath), 'utf8');
  const requiredSignatureFragments = [
    'export type ConfigReport',
    'export type FinalReport',
    '(text: string): Effect.Effect<FinalReport<',
    '(text: string, configName: keyof TConfigs):',
  ];
  for (const signatureFragment of requiredSignatureFragments) {
    if (!effectTypes.includes(signatureFragment)) {
      console.error(
        `${packageJson.name}: ${effectTypesRelativePath} is missing \`${signatureFragment}\``,
      );
      process.exit(1);
    }
  }
  const buildDirectory = join(packageDirectory, 'build');
  for (const fileName of readdirSync(buildDirectory)) {
    if (!fileName.endsWith('.js') || fileName === 'effect.es.js') continue;
    const bundleSource = readFileSync(join(buildDirectory, fileName), 'utf8');
    if (/from ["']effect["']/.test(bundleSource) || /require\(["']effect["']\)/.test(bundleSource)) {
      console.error(`${packageJson.name}: build/${fileName} imports effect`);
      process.exit(1);
    }
  }
  function importsTokenizer(entryName, seen = new Set()) {
    if (seen.has(entryName)) return false;
    seen.add(entryName);
    if (entryName === 'stream-incremental.es.js') return true;
    const source = readFileSync(join(buildDirectory, entryName), 'utf8');
    if (source.includes('stream-incremental')) return true;
    for (const match of source.matchAll(/from\s*["']\.\/([^"']+)["']/g)) {
      if (importsTokenizer(match[1], seen)) return true;
    }
    return false;
  }
  for (const entryName of ['stream.es.js', 'effect.es.js']) {
    if (importsTokenizer(entryName)) {
      console.error(`${packageJson.name}: build/${entryName} imports the incremental tokenizer`);
      process.exit(1);
    }
  }
  console.log(`${packageJson.name}: stream and effect bundles do not import the tokenizer`);
  console.log(`${packageJson.name}: publish tarball includes ${effectTypesRelativePath}`);
}

console.log(`${packageJson.name}: publish tarball includes ${typesField} and all exports types`);