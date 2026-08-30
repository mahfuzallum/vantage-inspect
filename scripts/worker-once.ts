import { runOneJob } from "@/server/video/worker-runner";

async function main(): Promise<void> {
  console.log("");
  console.log("=================================");
  console.log(" Video Worker - Single Job");
  console.log("=================================");
  console.log("");

  try {
    const result = await runOneJob(`worker-once-${process.pid}`);

    if (result) {
      console.log("");
      console.log("Job processed successfully.");
      console.log(`Job ID: ${result}`);
      console.log("");
    } else {
      console.log("");
      console.log("No queued job was available.");
      console.log("");
    }
  } catch (error) {
    console.error("");
    console.error("[worker-once] FAILED");

    if (error instanceof Error) {
      console.error(error.message);

      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  }
}

void main();