/** Video processing worker. */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const controller = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.info(`\n[worker] ${signal} received; stopping.`);
    controller.abort();
  });
}

async function main() {
  const { assertToolchain } = await import("../src/server/video/ffmpeg");
  const { runWorker } = await import("../src/server/video/worker-runner");

  try {
    const tools = await assertToolchain();

    console.info(`[worker] ${tools.ffmpeg}`);
    console.info(`[worker] ${tools.ffprobe}`);
  } catch (error) {
    console.error("[worker] FFmpeg and ffprobe could not be started.");

    if (error instanceof Error) {
      console.error(`         ${error.message}`);
    }

    console.error(
      "         Put ffmpeg.exe and ffprobe.exe in ./tools, or set FFMPEG_PATH / FFPROBE_PATH."
    );

    process.exit(1);
  }

  await runWorker(controller.signal);
}

void main().catch((error) => {
  console.error("[worker] Fatal error:", error);
  process.exit(1);
});