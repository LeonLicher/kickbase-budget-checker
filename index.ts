// Entry point for the Render cron job. Locally `npm start` loads .env first;
// on Render the environment comes from the service's env vars.
import { runCheck } from "./src/kickbase.mts";

await runCheck();
