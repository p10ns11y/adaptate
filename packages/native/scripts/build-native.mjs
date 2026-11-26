#!/usr/bin/env node
// Compile the native release and copy the host cdylib beside @adaptate/native.
// The package "build" script stays on Vite and tsc, so a Node install does not need Rust.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, '..');
const manifestArgument = '../../crates/adaptate-accel/Cargo.toml';
const manifestPath = resolve(packageDirectory, manifestArgument);

const scriptArguments = process.argv.slice(2).filter((argument) => argument !== '--');
const useGpu = scriptArguments.includes('--gpu');
const unknownArguments = scriptArguments.filter((argument) => argument !== '--gpu');
if (unknownArguments.length > 0) {
  fail(
    `Unknown argument: ${unknownArguments.join(' ')}. Supported flag: --gpu`,
  );
}

assertCargoAvailable('build:native');
assertManifestExists();

const featureList = useGpu ? 'native,gpu' : 'native';
const cargoArguments = [
  'build',
  '--manifest-path',
  manifestArgument,
  '--release',
  '--features',
  featureList,
];
runCargo(cargoArguments, 'build:native');

const libraryName = nativeLibraryName(platform());
const artifactPath = join(targetRoot(), 'release', libraryName);
const destinationPath = join(packageDirectory, 'adaptate-accel.node');
copyReleaseArtifact(artifactPath, destinationPath, 'build:native');

function nativeLibraryName(hostPlatform) {
  switch (hostPlatform) {
    case 'darwin':
      return 'libadaptate_accel.dylib';
    case 'linux':
      return 'libadaptate_accel.so';
    case 'win32':
      return 'adaptate_accel.dll';
    case 'aix':
    case 'android':
    case 'freebsd':
    case 'haiku':
    case 'openbsd':
    case 'sunos':
    case 'cygwin':
    case 'netbsd':
      fail(`No native addon filename is defined for platform "${hostPlatform}".`);
      break;
    default: {
      const unexpectedPlatform = hostPlatform;
      fail(`No native addon filename is defined for platform "${String(unexpectedPlatform)}".`);
    }
  }
}

function assertCargoAvailable(scriptName) {
  const probe = spawnSync('cargo', ['--version'], { encoding: 'utf8' });
  if (probe.error && probe.error.code === 'ENOENT') {
    fail(
      `cargo was not found on PATH.\nInstall Rust (https://rustup.rs) so ${scriptName} can compile adaptate-accel.`,
    );
  }
  if (probe.error) {
    fail(`cargo --version could not start: ${probe.error.message}`);
  }
  if (probe.status !== 0) {
    const detail = `${probe.stderr ?? ''}${probe.stdout ?? ''}`.trim();
    fail(
      detail.length > 0
        ? `cargo --version failed: ${detail}`
        : 'cargo --version failed. Install Rust (https://rustup.rs) and retry.',
    );
  }
}

function assertManifestExists() {
  if (!existsSync(manifestPath)) {
    fail(`Cargo manifest not found: ${manifestPath}`);
  }
}

function targetRoot() {
  const configuredTargetDirectory = process.env.CARGO_TARGET_DIR;
  if (configuredTargetDirectory && configuredTargetDirectory.length > 0) {
    return resolve(packageDirectory, configuredTargetDirectory);
  }
  return join(dirname(manifestPath), 'target');
}

function runCargo(cargoArguments, scriptName) {
  const build = spawnSync('cargo', cargoArguments, {
    cwd: packageDirectory,
    stdio: 'inherit',
  });
  if (build.error && build.error.code === 'ENOENT') {
    fail(
      `cargo was not found on PATH.\nInstall Rust (https://rustup.rs) so ${scriptName} can compile adaptate-accel.`,
    );
  }
  if (build.error) {
    fail(`cargo build could not start: ${build.error.message}`);
  }
  if (build.status !== 0) {
    process.exit(build.status === null ? 1 : build.status);
  }
}

function copyReleaseArtifact(artifactPath, destinationPath, scriptName) {
  if (!existsSync(artifactPath)) {
    fail(
      `${scriptName}: cargo finished, but the release artifact is missing.\nExpected ${artifactPath}`,
    );
  }
  copyFileSync(artifactPath, destinationPath);
  const copied = statSync(destinationPath);
  if (!copied.isFile() || copied.size === 0) {
    fail(`${scriptName}: copied artifact is empty: ${destinationPath}`);
  }
  console.log(`${scriptName} wrote ${destinationPath} (${copied.size} bytes)`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
