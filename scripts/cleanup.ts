/**
 * Scheduled housekeeping. Run from cron, e.g. hourly:
 *   0 * * * * cd /srv/vantage && npm run cleanup
 */
import { cleanupOrphanedWorkDirs } from "../src/server/video/cleanup";

cleanupOrphanedWorkDirs()
  .then((count) => {
    console.log(`Cleanup complete. ${count} directories removed.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  });
