#!/usr/bin/env node
// Compile the wasm32-unknown-unknown release and copy it beside @adaptate/wasm.
// The package "build" script stays on Vite and tsc, so a Node install does not need Rust.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, '..');
const manifestArgument = '../../crates/adaptate-accel/Cargo.toml';
const manifestPath = resolve(packageDirectory, manifestArgument);
const wasmTarget = 'wasm32-unknown-unknown';

const scriptArguments = process.argv.slice(2).filter((argument) => argument !== '--');
if (scriptArguments.length > 0) {
  fail(`Unknown argument: ${scriptArguments.join(' ')}. build:wasm does not take flags.`);
}

assertCargoAvailable('build:wasm');
assertWasmTargetInstalled();
assertManifestExists();

const cargoArguments = [
  'build',
  '--manifest-path',
  manifestArgument,
  '--target',
  wasmTarget,
  '--release',
];
runCargo(cargoArguments, 'build:wasm');

const artifactPath = join(targetRoot(), wasmTarget, 'release', 'adaptate_accel.wasm');
const destinationPath = join(packageDirectory, 'adaptate_accel.wasm');
copyReleaseArtifact(artifactPath, destinationPath, 'build:wasm');

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

function assertWasmTargetInstalled() {
  const listed = spawnSync('rustup', ['target', 'list', '--installed'], {
    encoding: 'utf8',
  });
  if (!listed.error && listed.status === 0) {
    const installedTargets = listed.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!installedTargets.includes(wasmTarget)) {
      fail(
        `The Rust target ${wasmTarget} is not installed.\nInstall it with: rustup target add ${wasmTarget}`,
      );
    }
    return;
  }

  const sysrootProbe = spawnSync('rustc', ['--print', 'sysroot'], {
    encoding: 'utf8',
  });
  if (!sysrootProbe.error && sysrootProbe.status === 0) {
    const sysroot = sysrootProbe.stdout.trim();
    const targetLibrary = join(sysroot, 'lib', 'rustlib', wasmTarget);
    if (sysroot.length > 0 && existsSync(targetLibrary)) {
      return;
    }
  }

  fail(
    `The Rust target ${wasmTarget} is not installed.\nInstall it with: rustup target add ${wasmTarget}`,
  );
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
