/** Starts Next.js and the video worker together for local development. */
import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import path from "node:path";

loadEnvConfig(process.cwd());

// On Windows, spawning npm.cmd directly can fail with ENOENT because .cmd
// files are shell commands. Start the local Node CLIs directly instead.
const node = process.execPath;
const tsxCli = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const nextCli = path.resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const children = [
  spawn(node, [nextCli, "dev"], { stdio: "inherit", env: process.env }),
  spawn(node, [tsxCli, "--conditions=react-server", "scripts/worker.ts"], { stdio: "inherit", env: process.env }),
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 250);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(0));
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(`[dev] failed to start child process: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code ?? 1);
  });
}
