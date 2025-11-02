import dotenv from "dotenv";
import pkg from "twilio";
const { Twilio } = pkg;

// Load environment variables
dotenv.config();

// --- Configuration ---
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER!;
const YOUR_PHONE_NUMBER = process.env.YOUR_PHONE_NUMBER!;
const CONTENT_SID = process.env.CONTENT_SID!;

// Kickbase Configuration
const KICKBASE_EMAIL = process.env.KICKBASE_EMAIL!;
const KICKBASE_PASSWORD = process.env.KICKBASE_PASSWORD!;
const KICKBASE_API_BASE =
  process.env.KICKBASE_API_BASE || "https://api.kickbase.com";
const KICKBASE_BUDGET_THRESHOLD = 0; // The threshold (zero for 'not in a negative')

// Authentication state
let authToken: string | null = null; // Force fresh login instead of using stored token
let tokenExpiry: Date | null = null;
let cachedLeagues: KickbaseLeague[] = []; // Cache leagues from login response

// Initialize Twilio Client
const client = new Twilio(ACCOUNT_SID, AUTH_TOKEN);

/**
 * Interface for Kickbase login response
 */
interface KickbaseLoginResponse {
  tkn: string;
  tknex: string;
  srvl?: KickbaseLeague[]; // Server list (leagues) returned in login response
  u: {
    id: string;
    name: string;
    teamValue: number;
    budget: number;
    placement: number;
    points: number;
    teamId: string;
    flags: number;
    perms: number;
    cover: string;
    profile: string;
    facebookId?: string;
    googleId?: string;
    proExpiry?: string;
    isExternal: boolean;
    hasNotificationAccess: boolean;
    email: string;
  };
}
/**
 * Interface for league response
 */
interface KickbaseLeague {
  id: string;
  name: string;
  creator: string;
  creatorId: string;
  creation: string;
  maxMembers: number;
  adminCount: number;
  memberCount: number;
  isCommissioner: boolean;
  cpi: string;
}

/**
 * Login to Kickbase API using email and password
 * @returns {Promise<KickbaseLoginResponse>} The login response with tokens
 */
async function loginToKickbase(): Promise<KickbaseLoginResponse> {
  console.log("Logging into Kickbase...");

  try {
    const response = await fetch(`${KICKBASE_API_BASE}/v4/user/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        em: KICKBASE_EMAIL,
        pass: KICKBASE_PASSWORD,
        ext: true,
        loy: false,
        rep: {},
      }),
      credentials: "include",
    });

    console.log(`Login response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Login error response:", errorText);
      throw new Error(
        `Login failed: ${response.status} ${response.statusText}`
      );
    }

    const loginData = (await response.json()) as KickbaseLoginResponse;
    authToken = loginData.tkn;
    tokenExpiry = new Date(loginData.tknex);

    // Cache leagues if provided in login response
    if (loginData.srvl) {
      cachedLeagues = loginData.srvl;
      console.log(`Cached ${cachedLeagues.length} leagues from login response`);
    }

    console.log(
      `Login successful! Token expires: ${tokenExpiry.toISOString()}`
    );
    return loginData;
  } catch (error) {
    console.error("Failed to login to Kickbase:", error);
    throw error;
  }
}

/**
 * Check if current token is valid and not expired
 */
function isTokenValid(): boolean {
  if (!authToken || !tokenExpiry) {
    return false;
  }

  // Check if token expires within the next 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return tokenExpiry > fiveMinutesFromNow;
}

/**
 * Ensure we have a valid authentication token
 */
async function ensureAuthenticated(): Promise<void> {
  if (!isTokenValid()) {
    console.log("Token invalid or expired, logging in...");
    try {
      await loginToKickbase();
    } catch (error) {
      console.error("Authentication failed:", error);
      throw error;
    }
  } else {
    console.log("Using existing valid token");
  }
}
/**
 * Get user's leagues from Kickbase
 */
async function getKickbaseLeagues(): Promise<KickbaseLeague[]> {
  await ensureAuthenticated();

  // First try to use cached leagues from login response
  if (cachedLeagues.length > 0) {
    console.log(`Using ${cachedLeagues.length} cached leagues`);
    return cachedLeagues;
  }

  // Try multiple possible API endpoints
  const possibleEndpoints = ["/v4/leagues"];

  for (const endpoint of possibleEndpoints) {
    console.log(`Trying endpoint: ${KICKBASE_API_BASE}${endpoint}`);

    try {
      const response = await fetch(`${KICKBASE_API_BASE}${endpoint}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authToken}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        credentials: "include",
      });

      console.log(`Response status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = (await response.json()) as { leagues?: KickbaseLeague[] };
        const leagues =
          data.leagues ||
          (Array.isArray(data) ? (data as KickbaseLeague[]) : []);
        console.log(`Found ${leagues.length} leagues from ${endpoint}`);
        if (leagues.length > 0) {
          cachedLeagues = leagues; // Cache for future use
          return leagues;
        }
      } else {
        const errorText = await response.text();
        console.log(
          `Endpoint ${endpoint} failed: ${response.status} - ${errorText}`
        );
      }
    } catch (error) {
      console.log(`Error trying endpoint ${endpoint}:`, error);
    }
  }

  throw new Error("Could not fetch leagues from any known endpoint");
}

/**
 * Fetches the current budget from the Kickbase API.
 * @returns {Promise<number>} The current budget value.
 */
async function getKickbaseBudget(): Promise<number> {
  console.log("Fetching Kickbase budget...");

  try {
    await ensureAuthenticated();

    // Get user's leagues first
    const leagues = await getKickbaseLeagues();

    if (leagues.length === 0) {
      throw new Error("No leagues found for user");
    }

    // Use the first league (you might want to specify which league to monitor)
    const primaryLeague = leagues[0];
    if (!primaryLeague) {
      throw new Error("No primary league found");
    }

    console.log(
      `Using league: ${primaryLeague.name} (ID: ${primaryLeague.id})`
    );

    // Get user's budget for the league using dedicated budget API
    const response = await fetch(
      `${KICKBASE_API_BASE}/v4/leagues/${primaryLeague.id}/me/budget`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authToken}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to get budget data: ${response.status} ${response.statusText}`
      );
    }

    const budgetData = (await response.json()) as {
      pbas?: number; // Previous budget
      b?: number; // Current budget
      bs?: number; // Budget spent
    };
    const budget = budgetData.b || 0;

    console.log(`Current budget: ${(budget / 1_000_000).toFixed(2)}M`);
    return budget;
  } catch (error) {
    console.error("Failed to fetch budget:", error);
    throw error;
  }
}

/**
 * 2. Sends an urgent WhatsApp message via Twilio Content API.
 * @param {number} budget The current negative budget.
 */
async function sendWhatsappAlert(budget: number): Promise<void> {
  console.log(`Budget is negative! Sending alert for: ${budget / 1_000_000}M`);

  try {
    const message = await client.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      contentSid: CONTENT_SID,
      // These variables map to placeholders in your Twilio Content Template (e.g., {{1}} and {{2}})
      contentVariables: JSON.stringify({
        "1": `${(budget / 1_000_000).toFixed(2)}M`, // Formatted budget in Millions
        "2": "20:30", // Deadline time
      }),
      to: YOUR_PHONE_NUMBER,
    });

    console.log(`Message sent successfully. SID: ${message.sid}`);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

/**
 * 3. Main function to run the check.
 */
async function runCheck() {
  // Set timezone to Berlin for logging
  process.env.TZ = "Europe/Berlin";

  const berlinTime = new Date().toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  console.log(
    `Checking Kickbase budget against threshold of ${KICKBASE_BUDGET_THRESHOLD} at ${berlinTime} (Berlin time)`
  );

  try {
    const currentBudget = await getKickbaseBudget();

    if (currentBudget < KICKBASE_BUDGET_THRESHOLD) {
      console.warn(
        `ALERT: Budget is negative (${currentBudget}). Sending notification!`
      );
      await sendWhatsappAlert(currentBudget);
    } else {
      console.log(`Budget is positive (${currentBudget}). No alert necessary.`);
    }
  } catch (error) {
    console.error("Fatal error during budget check:", error);
  }
}

// Execute the main function
runCheck();
