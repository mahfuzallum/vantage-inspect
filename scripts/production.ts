powershell -NoProfile -Command "@'
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];

function start(name, args) {
  console.log('[start] Starting ' + name + '...');
  const child = spawn(npm, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  children.push(child);

  child.on('error', (error) => {
    console.error('[' + name + '] error:', error);
  });

  child.on('exit', (code, signal) => {
    console.log(
      '[' + name + '] stopped: code=' +
      (code ?? 'null') +
      ' signal=' +
      (signal ?? 'null')
    );
  });

  return child;
}

let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;

  console.log('[start] Stopping services...');

  for (const child of children) {
    if (!child.killed) child.kill();
  }

  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

start('Next.js', ['run', 'next:start']);
start('FFmpeg worker', ['run', 'worker']);
'@ | Set-Content -Encoding UTF8 'scripts\start-production.ts'"