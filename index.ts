// One-shot CLI run, useful for testing: `npm run check`.
// The deployed service uses server.mts instead.
import { runCheck } from "./src/kickbase.mts";

const result = await runCheck();
if (result.error) {
  process.exitCode = 1;
}
