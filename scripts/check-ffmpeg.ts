import { spawn } from "node:child_process";
import path from "node:path";

function runCommand(
  command: string,
  args: string[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const ffmpegPath =
    process.env.FFMPEG_PATH ||
    path.resolve(
      process.cwd(),
      "tools",
      "ffmpeg.exe",
    );

  const ffprobePath =
    process.env.FFPROBE_PATH ||
    path.resolve(
      process.cwd(),
      "tools",
      "ffprobe.exe",
    );

  console.log("");
  console.log("Checking FFmpeg...");
  console.log(`FFMPEG_PATH: ${ffmpegPath}`);
  console.log("");

  const ffmpegCode = await runCommand(
    ffmpegPath,
    ["-version"],
  );

  if (ffmpegCode !== 0) {
    throw new Error(
      `FFmpeg check failed with exit code ${ffmpegCode}`,
    );
  }

  console.log("");
  console.log("Checking FFprobe...");
  console.log(`FFPROBE_PATH: ${ffprobePath}`);
  console.log("");

  const ffprobeCode = await runCommand(
    ffprobePath,
    ["-version"],
  );

  if (ffprobeCode !== 0) {
    throw new Error(
      `FFprobe check failed with exit code ${ffprobeCode}`,
    );
  }

  console.log("");
  console.log("=================================");
  console.log(" FFmpeg       OK");
  console.log(" FFprobe      OK");
  console.log("=================================");
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("[check-ffmpeg] FAILED");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});