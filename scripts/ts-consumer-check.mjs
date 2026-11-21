#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const packageDirectories = ['packages/core', 'packages/utils'];
const typescriptMajorVersions = ['7', '6'];
const moduleModes = [
  { name: 'bundler', module: 'ESNext', moduleResolution: 'bundler' },
  { name: 'node16', module: 'node16', moduleResolution: 'node16' },
  { name: 'nodenext', module: 'nodenext', moduleResolution: 'nodenext' },
];

const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([variableName]) => !variableName.toLowerCase().startsWith('npm_'),
  ),
);

function readPackageJson(packageDirectory) {
  return JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
}

function collectDeclarationFiles(directory) {
  let declarationFiles = [];
  for (const directoryEntry of readdirSync(directory, { withFileTypes: true })) {
    let entryPath = join(directory, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      if (directoryEntry.name === '__tests__' || directoryEntry.name === 'node_modules') {
        continue;
      }
      declarationFiles.push(...collectDeclarationFiles(entryPath));
    } else if (directoryEntry.isFile() && directoryEntry.name.endsWith('.d.ts')) {
      declarationFiles.push(entryPath);
    }
  }
  return declarationFiles;
}

function specifierForDeclaration(packageName, buildDirectory, declarationPath) {
  let relativePath = relative(buildDirectory, declarationPath).replaceAll('\\', '/');
  if (!relativePath.endsWith('.d.ts')) {
    throw new Error(`${declarationPath} is not a declaration file`);
  }
  let modulePath = relativePath.slice(0, -'.d.ts'.length);
  if (modulePath === 'index') {
    return packageName;
  }
  if (modulePath.endsWith('/index')) {
    return `${packageName}/${modulePath.slice(0, -'/index'.length)}`;
  }
  return `${packageName}/${modulePath}`;
}

function packageNameFromSpecifier(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('bun:') ||
    specifier.startsWith('deno:') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('data:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:')
  ) {
    return undefined;
  }
  if (specifier.startsWith('@')) {
    let [scopeName, scopedName] = specifier.split('/');
    if (!scopeName || !scopedName) {
      return undefined;
    }
    return `${scopeName}/${scopedName}`;
  }
  let bareName = specifier.split('/')[0];
  return bareName.length > 0 ? bareName : undefined;
}

function externalPackagesInDeclaration(declarationText) {
  let packageNames = new Set();
  let specifierPattern =
    /(?:import|export)\s*(?:type\s*)?(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let specifierMatch of declarationText.matchAll(specifierPattern)) {
    let specifier = specifierMatch[1] ?? specifierMatch[2];
    let packageName = packageNameFromSpecifier(specifier);
    if (packageName) {
      packageNames.add(packageName);
    }
  }
  return packageNames;
}

function npmInstallRange(range) {
  let alternatives = range.split('||').map((alternative) => alternative.trim()).filter(Boolean);
  let selected = alternatives.length > 0 ? alternatives[alternatives.length - 1] : 'latest';
  if (selected.startsWith('workspace:') || selected === '*' || selected === '') {
    return 'latest';
  }
  return selected;
}

function rangeForPackage(packageName, packageJsons) {
  for (let packageJson of packageJsons) {
    let dependencyRange = packageJson.dependencies?.[packageName];
    if (typeof dependencyRange === 'string') {
      return npmInstallRange(dependencyRange);
    }
  }
  for (let packageJson of packageJsons) {
    let devDependencyRange = packageJson.devDependencies?.[packageName];
    if (typeof devDependencyRange === 'string') {
      return npmInstallRange(devDependencyRange);
    }
  }
  for (let packageJson of packageJsons) {
    let peerRange = packageJson.peerDependencies?.[packageName];
    if (typeof peerRange === 'string') {
      return npmInstallRange(peerRange);
    }
  }
  return 'latest';
}

function isRuntimeDependency(packageName, packageJsons) {
  return packageJsons.some(
    (packageJson) => typeof packageJson.dependencies?.[packageName] === 'string',
  );
}

function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    env: cleanEnvironment,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runOrThrow(command, args, cwd) {
  try {
    return runCommand(command, args, cwd);
  } catch (error) {
    let stdout = error.stdout?.toString?.() ?? '';
    let stderr = error.stderr?.toString?.() ?? '';
    let failure = new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
    failure.stdout = stdout;
    failure.stderr = stderr;
    failure.cause = error;
    throw failure;
  }
}

function discoverPackages() {
  let discovered = [];
  for (let relativeDirectory of packageDirectories) {
    let packageDirectory = join(repositoryRoot, relativeDirectory);
    let packageJson = readPackageJson(packageDirectory);
    let buildDirectory = join(packageDirectory, 'build');
    if (!existsSync(buildDirectory)) {
      throw new Error(
        `${packageJson.name}: missing ${buildDirectory}. Build the package before running this check.`,
      );
    }
    let declarationFiles = collectDeclarationFiles(buildDirectory);
    if (declarationFiles.length === 0) {
      throw new Error(`${packageJson.name}: no .d.ts files under ${buildDirectory}`);
    }
    let specifiers = declarationFiles
      .map((declarationPath) =>
        specifierForDeclaration(packageJson.name, buildDirectory, declarationPath),
      )
      .sort();
    let importedPackages = new Set();
    for (let declarationPath of declarationFiles) {
      let declarationText = readFileSync(declarationPath, 'utf8');
      for (let packageName of externalPackagesInDeclaration(declarationText)) {
        importedPackages.add(packageName);
      }
    }
    discovered.push({
      packageDirectory,
      packageJson,
      specifiers,
      importedPackages,
    });
  }
  return discovered;
}

function packPackages(discovered, packDirectory) {
  let tarballPaths = [];
  for (let packageInfo of discovered) {
    runOrThrow(
      'npm',
      ['pack', '--ignore-scripts', '--silent', '--pack-destination', packDirectory],
      packageInfo.packageDirectory,
    );
  }
  let tarballNames = readdirSync(packDirectory).filter((fileName) => fileName.endsWith('.tgz'));
  if (tarballNames.length !== discovered.length) {
    throw new Error(`expected ${discovered.length} tarballs, found ${tarballNames.length}`);
  }
  for (let tarballName of tarballNames) {
    tarballPaths.push(join(packDirectory, tarballName));
  }
  return tarballPaths;
}

function installSpecs(discovered, rootPackageJson) {
  let packageJsons = discovered.map((packageInfo) => packageInfo.packageJson);
  let specs = new Map();
  function addSpec(packageName, range) {
    if (!specs.has(packageName)) {
      specs.set(packageName, `${packageName}@${range}`);
    }
  }
  for (let packageJson of packageJsons) {
    for (let peerName of Object.keys(packageJson.peerDependencies ?? {})) {
      addSpec(peerName, rangeForPackage(peerName, packageJsons));
    }
  }
  for (let packageInfo of discovered) {
    for (let packageName of packageInfo.importedPackages) {
      if (packageName.startsWith('@adaptate/')) {
        continue;
      }
      if (isRuntimeDependency(packageName, packageJsons)) {
        continue;
      }
      addSpec(packageName, rangeForPackage(packageName, packageJsons));
    }
  }
  let nodeTypesRange = rootPackageJson.devDependencies?.['@types/node'];
  addSpec('@types/node', typeof nodeTypesRange === 'string' ? npmInstallRange(nodeTypesRange) : 'latest');
  return [...specs.values()];
}

function writeConsumer(consumerDirectory, specifiers) {
  let importLines = [];
  let bindingNames = [];
  for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex += 1) {
    let bindingName = `importedModule${specifierIndex}`;
    importLines.push(
      `import * as ${bindingName} from ${JSON.stringify(specifiers[specifierIndex])};`,
    );
    bindingNames.push(bindingName);
  }
  let source = `${importLines.join('\n')}\n\nexport const adaptateConsumerModules = [${bindingNames.join(', ')}];\n`;
  writeFileSync(join(consumerDirectory, 'consumer.ts'), source);
}

function writeTsconfig(consumerDirectory, moduleMode) {
  let compilerOptions = {
    target: 'ES2022',
    module: moduleMode.module,
    moduleResolution: moduleMode.moduleResolution,
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    types: ['node'],
  };
  let tsconfig = {
    compilerOptions,
    files: ['consumer.ts'],
  };
  writeFileSync(join(consumerDirectory, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
}

function installedTypescriptVersion(consumerDirectory) {
  let typescriptPackage = JSON.parse(
    readFileSync(join(consumerDirectory, 'node_modules', 'typescript', 'package.json'), 'utf8'),
  );
  return typescriptPackage.version;
}

let packDirectory;
let consumerDirectory;
try {
  let rootPackageJson = readPackageJson(repositoryRoot);
  let discovered = discoverPackages();
  let specifiers = discovered.flatMap((packageInfo) => packageInfo.specifiers);
  for (let packageInfo of discovered) {
    console.log(`${packageInfo.packageJson.name}: ${packageInfo.specifiers.join(', ')}`);
  }
  packDirectory = mkdtempSync(join(tmpdir(), 'adaptate-pack-'));
  consumerDirectory = mkdtempSync(join(tmpdir(), 'adaptate-ts-consumer-'));
  let tarballPaths = packPackages(discovered, packDirectory);
  let dependencySpecs = installSpecs(discovered, rootPackageJson);
  writeFileSync(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({ name: 'adaptate-ts-consumer', private: true, type: 'module' }, null, 2)}\n`,
  );
  writeConsumer(consumerDirectory, specifiers);
  for (let typescriptMajor of typescriptMajorVersions) {
    let installArgs = [
      'install',
      '--ignore-scripts',
      '--no-fund',
      '--no-audit',
      ...tarballPaths,
      `typescript@${typescriptMajor}`,
      ...dependencySpecs,
    ];
    console.log(`installing typescript@${typescriptMajor} and packed tarballs`);
    runOrThrow('npm', installArgs, consumerDirectory);
    let typescriptVersion = installedTypescriptVersion(consumerDirectory);
    for (let moduleMode of moduleModes) {
      writeTsconfig(consumerDirectory, moduleMode);
      let typescriptBinary = join(consumerDirectory, 'node_modules', 'typescript', 'bin', 'tsc');
      console.log(`tsc ${typescriptVersion} moduleResolution=${moduleMode.name}`);
      runOrThrow(typescriptBinary, ['--noEmit', '-p', 'tsconfig.json'], consumerDirectory);
    }
  }
  console.log('ts-consumer-check: all TypeScript consumer typechecks passed');
} catch (error) {
  console.error(error.message);
  if (error.stdout) {
    console.error(error.stdout);
  }
  if (error.stderr) {
    console.error(error.stderr);
  }
  process.exitCode = 1;
} finally {
  if (packDirectory) {
    rmSync(packDirectory, { recursive: true, force: true });
  }
  if (consumerDirectory) {
    rmSync(consumerDirectory, { recursive: true, force: true });
  }
}
