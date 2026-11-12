import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./sync-upstream.sh', import.meta.url)).replaceAll('\\', '/');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
test('release sync preserves fork changes, skips merged releases, and stops on conflicts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex2api-sync-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
  function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  const origin = path.join(root, 'origin'), fork = path.join(root, 'fork');
  fs.mkdirSync(origin);
  git(origin, 'init', '-b', 'main');
  fs.writeFileSync(path.join(origin, 'shared'), 'base\n');
  git(origin, 'add', '.'); git(origin, 'commit', '-m', 'base'); git(origin, 'tag', 'v1.0');
  git(root, 'clone', origin, fork);
  fs.writeFileSync(path.join(fork, 'feature'), 'fork feature\n');
  git(fork, 'add', '.'); git(fork, 'commit', '-m', 'fork feature');
  const output = path.join(root, 'outputs');
  function sync(tag) {
    fs.writeFileSync(output, '');
    const result = spawnSync(bash, [script], { cwd: fork, encoding: 'utf8', env: { ...env, UPSTREAM_REMOTE: origin.replaceAll('\\', '/'), UPSTREAM_RELEASE_TAG: tag, GITHUB_OUTPUT: output.replaceAll('\\', '/') } });
    return { ...result, output: fs.readFileSync(output, 'utf8') };
  }
  const noop = sync('v1.0'); assert.equal(noop.status, 0, noop.stderr); assert.match(noop.output, /changed=false/);
  fs.writeFileSync(path.join(origin, 'upstream'), 'upstream update\n');
  git(origin, 'add', '.'); git(origin, 'commit', '-m', 'release'); git(origin, 'tag', 'v1.1');
  const merged = sync('v1.1'); assert.equal(merged.status, 0, merged.stderr); assert.match(merged.output, /changed=true/);
  assert.equal(fs.readFileSync(path.join(fork, 'feature'), 'utf8'), 'fork feature\n');
  assert.equal(fs.readFileSync(path.join(fork, 'upstream'), 'utf8'), 'upstream update\n');
  assert.match(sync('v1.1').output, /changed=false/);
  fs.writeFileSync(path.join(fork, 'shared'), 'fork edit\n'); git(fork, 'add', '.'); git(fork, 'commit', '-m', 'fork edit');
  fs.writeFileSync(path.join(origin, 'shared'), 'upstream edit\n'); git(origin, 'add', '.'); git(origin, 'commit', '-m', 'conflicting release'); git(origin, 'tag', 'v1.2');
  const head = git(fork, 'rev-parse', 'HEAD');
  assert.notEqual(sync('v1.2').status, 0);
  assert.equal(git(fork, 'rev-parse', 'HEAD'), head);
  assert.ok(git(fork, 'diff', '--name-only', '--diff-filter=U').includes('shared'));
});
