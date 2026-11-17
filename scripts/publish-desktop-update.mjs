'use strict';
// Publishes a desktop release as a GitHub Release that doubles as the
// auto-update feed (latest.yml + NSIS installer). Notes come from CHANGELOG.md.
// Usage: node scripts/publish-desktop-update.mjs [--skip-build] [--prerelease] [--version x.y.z]
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'JesstLe/deepseek-harness-local';

export function extractReleaseNotes(changelog, version) {
  if (typeof changelog !== 'string' || !/^\d+\.\d+\.\d+$/.test(String(version))) return '';
  const lines = changelog.split('\n');
  const collected = [];
  let active = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (active) break;
      const heading = line.replace(/^##\s+/, '').trim();
      const headingVersion = heading.replace(/^\[|\]$/g, '').split(/[\s(]/)[0].replace(/^\[|\]$/g, '');
      if (headingVersion === version) active = true;
      continue;
    }
    if (active) collected.push(line);
  }
  return collected.join('\n').trim();
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, {cwd = root, env} = {}) {
  const result = spawnSync(command, args, {cwd, env, stdio: 'inherit', shell: process.platform === 'win32'});
  if (result.status !== 0) throw Error('RELEASE_COMMAND_FAILED ' + command + ' ' + args.join(' '));
}

function capture(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8', shell: process.platform === 'win32'});
  return {ok: result.status === 0, output: (result.stdout ?? '') + (result.stderr ?? '')};
}

function main() {
  const args = process.argv.slice(2);
  const desktop = path.join(root, 'desktop');
  const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  const version = argValue('--version') ?? pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('RELEASE_VERSION_INVALID ' + version);
  if (!args.includes('--skip-build')) run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {cwd: desktop});

  const output = path.join(root, 'runtime', 'naumi-desktop-release');
  const manifest = path.join(output, 'latest.yml');
  const installer = path.join(output, `Naumi-Setup-${version}-x64.exe`);
  for (const file of [manifest, installer]) if (!fs.existsSync(file)) throw Error('RELEASE_ARTIFACT_MISSING ' + file);

  const notes = extractReleaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  if (!notes) throw Error('RELEASE_NOTES_MISSING add a ## ' + version + ' section to CHANGELOG.md');
  const notesFile = path.join(os.tmpdir(), `naumi-release-notes-${version}.md`);
  fs.writeFileSync(notesFile, notes + '\n', 'utf8');

  const tag = 'v' + version;
  const ghArgs = ['--repo', REPO];
  const existing = capture('gh', ['release', 'view', tag, ...ghArgs]);
  const common = existing.ok
    ? ['release', 'edit', tag, ...ghArgs, '--notes-file', notesFile, String(installer), String(manifest), '--clobber']
    : ['release', 'create', tag, ...ghArgs, '--title', 'Naumi Desktop ' + tag, '--notes-file', notesFile, ...(args.includes('--prerelease') ? ['--prerelease'] : []), String(installer), String(manifest)];
  run('gh', common);
  const size = (fs.statSync(installer).size / 1024 / 1024).toFixed(1);
  console.log(`RELEASE ${tag} artifacts=Naumi-Setup-${version}-x64.exe(${size}MB)+latest.yml feed=github:${REPO}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
