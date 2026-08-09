// HTTP entry point. There is no cron: an external keepalive pings this service
// every few minutes, and each ping asks "is it time yet?". Almost always the
// answer is no and the ping costs nothing, which doubles as the traffic that
// stops a Render free service from spinning down.
//
//   GET /            keepalive, runs the check if the window says so
//   GET /keepalive   same as /
//   GET /healthz     plain 200, never runs anything
//   GET /check       force a check now, requires ?secret= when TRIGGER_SECRET is set
import { createServer } from "node:http";
import { runCheck, type CheckResult } from "./src/kickbase.mts";
import { describeWindow, isInWindow, INTERVAL_MINUTES, localNow } from "./src/window.mts";

const PORT = Number(process.env.PORT || 3000);
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

let running = false;
let lastRunAt: number | null = null;
let lastResult: (CheckResult & { at: string }) | null = null;

type Status = "checked" | "outside-window" | "throttled" | "busy";

/**
 * Run the check if the window allows it. `force` skips the window and the
 * throttle but still refuses to run two checks at once.
 */
async function maybeRun(force: boolean): Promise<Status> {
  if (running) {
    return "busy";
  }
  if (!force) {
    if (!isInWindow()) {
      return "outside-window";
    }
    if (lastRunAt !== null && Date.now() - lastRunAt < INTERVAL_MS) {
      return "throttled";
    }
  }

  running = true;
  try {
    lastRunAt = Date.now();
    const result = await runCheck();
    lastResult = { ...result, at: new Date().toISOString() };
    return "checked";
  } finally {
    running = false;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  const respond = (status: number, body: unknown): void => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(`${JSON.stringify(body, null, 2)}\n`);
  };

  // Pure liveness probe, deliberately does no work.
  if (url.pathname === "/healthz") {
    respond(200, { ok: true });
    return;
  }

  const isKeepalive = url.pathname === "/" || url.pathname === "/keepalive";
  const isForced = url.pathname === "/check";

  if (!isKeepalive && !isForced) {
    respond(404, { error: "not found" });
    return;
  }

  if (isForced) {
    const expected = process.env.TRIGGER_SECRET;
    if (expected && url.searchParams.get("secret") !== expected) {
      // Deliberately explicit rather than a silent 404: this is a private tool,
      // and "wrong password" is far more useful than "no such route".
      respond(403, {
        error: "wrong or missing ?secret=",
        hint: "It must equal TRIGGER_SECRET from the Render dashboard (Environment tab), not a Kickbase token.",
      });
      return;
    }
  }

  void maybeRun(isForced).then(
    (status) => {
      respond(200, {
        status,
        now: localNow().label,
        window: describeWindow(),
        inWindow: isInWindow(),
        // Which topic alerts go to, so a mismatch with the phone is visible.
        ntfyTopic: process.env.NTFY_TOPIC ?? null,
        checkNeedsSecret: Boolean(process.env.TRIGGER_SECRET),
        lastRun: lastResult,
      });
    },
    (error: unknown) => {
      console.error("Unexpected error handling request:", error);
      respond(500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  );
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  console.log(`Check window: ${describeWindow()}`);
  console.log(`Local time now: ${localNow().label}`);
});
