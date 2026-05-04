import express from "express";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import admin from "firebase-admin";
import pg from "pg";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const { Pool } = pg;
const ownerToken = process.env.QUEUE_JUMPER_OWNER_TOKEN || "queue-jumper-demo-owner-token";
const dataFile = process.env.QUEUE_JUMPER_DATA_FILE || join(process.cwd(), "data", "queue-state.json");
const databaseUrl = process.env.DATABASE_URL;
const requireDatabase = process.env.REQUIRE_DATABASE === "true";
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean) : [];
const joinRateWindowMs = Number(process.env.JOIN_RATE_WINDOW_MS || 60_000);
const joinRateLimit = Number(process.env.JOIN_RATE_LIMIT || 8);
const notificationProvider = process.env.NOTIFICATION_PROVIDER || "mock";
const fcmServiceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
const joinAttempts = new Map();
const dbPool = databaseUrl ? new Pool({
  connectionString: databaseUrl,
  ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false },
}) : null;

if (isProduction && ownerToken === "queue-jumper-demo-owner-token") {
  throw new Error("QUEUE_JUMPER_OWNER_TOKEN must be set to a private value in production.");
}

if (isProduction && requireDatabase && !databaseUrl) {
  throw new Error("DATABASE_URL must be set when REQUIRE_DATABASE=true.");
}

if (isProduction && notificationProvider === "fcm" && !fcmServiceAccountJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("FCM_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS must be set when NOTIFICATION_PROVIDER=fcm.");
}

function getFirebaseApp() {
  if (admin.apps.length > 0) return admin.app();

  if (fcmServiceAccountJson) {
    const serviceAccount = JSON.parse(fcmServiceAccountJson);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : isProduction ? false : "*",
  },
});

const dashboards = [
  {
    id: "milos",
    slug: "milos-barbershop",
    name: "Milo's Barbershop",
    location: "18 Market Lane",
    serviceLabel: "Haircut",
    serviceOptions: ["Haircut", "Beard trim", "Color", "Kids cut"],
    accent: "#22b157",
    serving: { ticket: "A15", name: "Alex Thompson", service: "Haircut" },
    queue: [
      { id: 16, ticket: "A16", name: "Taylor Nguyen", phone: "+15550100016", service: "Beard trim", joinedAt: "9:20 AM" },
      { id: 17, ticket: "A17", name: "Jordan Lee", phone: "+15550100017", service: "Haircut", joinedAt: "9:24 AM" },
      { id: 18, ticket: "A18", name: "Casey Brown", phone: "+15550100018", service: "Haircut", joinedAt: "9:28 AM" },
      { id: 19, ticket: "A19", name: "Chris Patel", phone: "+15550100019", service: "Beard trim", joinedAt: "9:31 AM" },
      { id: 20, ticket: "A20", name: "Morgan Davis", phone: "+15550100020", service: "Haircut", joinedAt: "9:35 AM" },
      { id: 21, ticket: "A21", name: "Riley Smith", phone: "+15550100021", service: "Haircut", joinedAt: "9:38 AM" },
      { id: 22, ticket: "A22", name: "Jamie Wilson", phone: "+15550100022", service: "Beard trim", joinedAt: "9:42 AM" },
      { id: 23, ticket: "A23", name: "Drew Martin", phone: "+15550100023", service: "Haircut", joinedAt: "9:45 AM" },
    ],
  },
  {
    id: "red-door",
    slug: "red-door-coffee",
    name: "Red Door Coffee",
    location: "22 Market Lane",
    serviceLabel: "Pickup",
    serviceOptions: ["Pickup", "Latte order", "Cold brew", "Pastry box"],
    accent: "#b26a3c",
    serving: { ticket: "C08", name: "Priya Shah", service: "Latte order" },
    queue: [
      { id: 9, ticket: "C09", name: "Noah Kim", service: "Two cappuccinos", joinedAt: "9:33 AM" },
      { id: 10, ticket: "C10", name: "Sam Rivera", service: "Cold brew", joinedAt: "9:35 AM" },
      { id: 11, ticket: "C11", name: "Avery Johnson", service: "Pastry box", joinedAt: "9:37 AM" },
      { id: 12, ticket: "C12", name: "Mina Park", service: "Americano", joinedAt: "9:39 AM" },
    ],
  },
  {
    id: "bloom",
    slug: "bloom-nails",
    name: "Bloom Nails",
    location: "7 Grove Street",
    serviceLabel: "Manicure",
    serviceOptions: ["Manicure", "Gel manicure", "Polish change", "Nail art", "Pedicure"],
    accent: "#ff5848",
    serving: { ticket: "N21", name: "Harper Ellis", service: "Gel manicure" },
    queue: [
      { id: 22, ticket: "N22", name: "Sofia Chen", service: "Polish change", joinedAt: "10:02 AM" },
      { id: 23, ticket: "N23", name: "Elena Brooks", service: "Gel manicure", joinedAt: "10:06 AM" },
      { id: 24, ticket: "N24", name: "Maya Singh", service: "Nail art", joinedAt: "10:10 AM" },
      { id: 25, ticket: "N25", name: "Grace Miller", service: "Manicure", joinedAt: "10:14 AM" },
      { id: 26, ticket: "N26", name: "Leah Carter", service: "Pedicure", joinedAt: "10:18 AM" },
    ],
  },
];

const seedState = new Map(dashboards.map((dashboard) => [dashboard.id, dashboard]));
const states = new Map();

function createState(dashboard) {
  return {
    serving: { ...dashboard.serving },
    queue: dashboard.queue.map((customer, index) => ({
      ...customer,
      status: index === 0 ? "next" : "waiting",
    })),
    completed: [],
    notifications: [],
    paused: false,
  };
}

for (const dashboard of dashboards) {
  states.set(dashboard.id, createState(dashboard));
}

async function ensureDatabase() {
  if (!dbPool) return;

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS queue_states (
      shop_id text PRIMARY KEY,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadPersistedState() {
  if (dbPool) {
    try {
      await ensureDatabase();
      const result = await dbPool.query("SELECT shop_id, state FROM queue_states");
      for (const row of result.rows) {
        const dashboard = getDashboard(row.shop_id);
        states.set(dashboard.id, {
          ...createState(dashboard),
          ...row.state,
        });
      }

      if (result.rowCount === 0) {
        await savePersistedState();
      }
    } catch (error) {
      console.error("Could not load persisted queue state from Postgres:", error.message);
      throw error;
    }
    return;
  }

  if (!existsSync(dataFile)) return;

  try {
    const saved = JSON.parse(readFileSync(dataFile, "utf8"));
    for (const [shopId, state] of Object.entries(saved.states || {})) {
      const dashboard = getDashboard(shopId);
      states.set(dashboard.id, {
        ...createState(dashboard),
        ...state,
      });
    }
  } catch (error) {
    console.warn("Could not load persisted queue state:", error.message);
  }
}

async function savePersistedState() {
  if (dbPool) {
    try {
      await ensureDatabase();
      await Promise.all([...states.entries()].map(([shopId, state]) => dbPool.query(
        `INSERT INTO queue_states (shop_id, state, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (shop_id)
         DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
        [shopId, JSON.stringify(state)],
      )));
    } catch (error) {
      console.warn("Could not save queue state to Postgres:", error.message);
    }
    return;
  }

  try {
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile, JSON.stringify({ states: Object.fromEntries(states) }, null, 2));
  } catch (error) {
    console.warn("Could not save queue state:", error.message);
  }
}

const waitForIndex = (index) => (index + 1) * 5 + 3;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function customerInitials(name = "Guest") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "G";
}

function nowLabel() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function makeNotification(state, message) {
  state.notifications = [
    { id: Date.now(), message, createdAt: new Date().toISOString() },
    ...(state.notifications || []),
  ].slice(0, 8);
}

function makeAnalytics(dashboard, state) {
  const serviceNames = [...new Set([
    dashboard.serviceLabel,
    ...(dashboard.serviceOptions || []),
    state.serving?.service,
    ...state.queue.map((customer) => customer.service),
    ...state.completed.map((customer) => customer.service),
  ].filter(Boolean))];

  const serviceQueues = serviceNames.map((service) => {
    const waiting = state.queue.filter((customer) => customer.service === service);
    const completed = state.completed.filter((customer) => customer.service === service);
    return {
      service,
      waiting: waiting.length,
      completed: completed.length,
      estimatedWait: waiting.reduce((total, _customer, index) => total + waitForIndex(index), 0),
    };
  });

  return {
    waiting: state.queue.length,
    servedToday: state.completed.length,
    noShows: state.completed.filter((customer) => customer.reason === "no-show").length,
    notified: state.completed.filter((customer) => customer.notifiedAt).length + state.queue.filter((customer) => customer.notifiedAt).length,
    averageWait: state.queue.length ? Math.round(state.queue.reduce((total, _customer, index) => total + waitForIndex(index), 0) / state.queue.length) : 0,
    serviceQueues,
  };
}

function normalizePhone(value = "") {
  return String(value).trim().replace(/[^\d+]/g, "").slice(0, 24);
}

async function sendCustomerMessage({ dashboard, customer, message, channel = "sms" }) {
  if (notificationProvider === "fcm") {
    const pushToken = customer?.pushToken || customer?.fcmToken;
    if (!pushToken) {
      return {
        ok: false,
        provider: "fcm",
        error: "Customer FCM token is missing. FCM needs an app/browser push token, not only a phone number.",
      };
    }

    const app = getFirebaseApp();
    const response = await admin.messaging(app).send({
      token: pushToken,
      notification: {
        title: `${dashboard.name}: ${customer.ticket} is coming up`,
        body: message,
      },
      data: {
        shopId: dashboard.id,
        ticket: customer.ticket,
        service: customer.service || "",
        channel,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "queue-alerts",
        },
      },
    });

    return { ok: true, provider: "fcm", channel, id: response };
  }

  if (!customer?.phone) {
    return { ok: false, provider: notificationProvider, error: "Customer phone number is missing." };
  }

  if (notificationProvider === "mock") {
    console.log(`[mock:${channel}] ${customer.phone}: ${message}`);
    return { ok: true, provider: "mock", channel };
  }

  return {
    ok: false,
    provider: notificationProvider,
    error: `Notification provider ${notificationProvider} is not connected yet for ${dashboard.name}.`,
  };
}

function nextTicketFor(dashboard, state) {
  const prefix = dashboard.serving.ticket.match(/^[A-Z]+/)?.[0] || "Q";
  const numbers = [state.serving, ...state.queue, ...state.completed]
    .map((item) => Number(String(item.ticket).replace(/\D/g, "")))
    .filter(Number.isFinite);
  const nextNumber = Math.max(0, ...numbers) + 1;
  return `${prefix}${String(nextNumber).padStart(2, "0")}`;
}

function normalizeCustomerInput(body = {}) {
  const name = String(body.name || "").trim().slice(0, 80) || "Guest Customer";
  const service = String(body.service || "").trim().slice(0, 80) || "Walk-in";
  const phone = normalizePhone(body.phone);
  const pushToken = String(body.pushToken || body.fcmToken || "").trim().slice(0, 512);
  return { name, service, phone, pushToken };
}

function isRateLimited(req) {
  const key = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempts = (joinAttempts.get(key) || []).filter((timestamp) => now - timestamp < joinRateWindowMs);
  attempts.push(now);
  joinAttempts.set(key, attempts);
  return attempts.length > joinRateLimit;
}

function isOwnerAuthorized(socket, payload) {
  return socket.data.isOwner || payload?.token === ownerToken;
}

function payloadShopId(payload, fallbackShopId) {
  return typeof payload === "string" ? payload : payload?.shopId ?? fallbackShopId;
}

function getDashboard(shopId = "milos") {
  return seedState.get(shopId) ?? seedState.get("milos");
}

function getDashboardBySlug(slug = "milos-barbershop") {
  return dashboards.find((dashboard) => dashboard.slug === slug) ?? dashboards[0];
}

function getState(shopId = "milos") {
  const dashboard = getDashboard(shopId);
  if (!states.has(dashboard.id)) {
    states.set(dashboard.id, createState(dashboard));
  }
  return states.get(dashboard.id);
}

function publicDashboards() {
  return dashboards.map(({ id, slug, name, location, serviceLabel, serviceOptions, accent }) => ({
    id,
    slug,
    name,
    location,
    serviceLabel,
    serviceOptions,
    accent,
  }));
}

function snapshot(shopId = "milos") {
  const dashboard = getDashboard(shopId);
  const state = getState(dashboard.id);
  return {
    dashboards: publicDashboards(),
    activeDashboard: {
      ...publicDashboards().find((item) => item.id === dashboard.id),
      paused: Boolean(state.paused),
      notifications: state.notifications || [],
    },
    serving: state.serving,
    queue: state.queue.map((customer, index) => ({
      ...customer,
      rank: index + 1,
      estimatedWait: waitForIndex(index),
      status: index === 0 ? "next" : "waiting",
    })),
    completed: state.completed,
    notifications: state.notifications || [],
    analytics: makeAnalytics(dashboard, state),
    paused: Boolean(state.paused),
    updatedAt: new Date().toISOString(),
  };
}

function publicSnapshot(shopId = "milos") {
  const dashboard = getDashboard(shopId);
  const state = getState(dashboard.id);
  return {
    activeDashboard: {
      ...publicDashboards().find((item) => item.id === dashboard.id),
      paused: Boolean(state.paused),
    },
    serving: {
      ticket: state.serving.ticket,
    },
    queue: state.queue.map((customer, index) => ({
      ticket: customer.ticket,
      initials: customerInitials(customer.name),
      rank: index + 1,
      estimatedWait: waitForIndex(index),
      status: index === 0 ? "next" : "waiting",
    })),
    paused: Boolean(state.paused),
    updatedAt: new Date().toISOString(),
  };
}

function emitDashboardUpdate(shopId) {
  void savePersistedState();
  io.to(`${shopId}:owners`).emit("queue:update", snapshot(shopId));
  io.to(`${shopId}:public`).emit("queue:public", publicSnapshot(shopId));
}

function privacyPolicyHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Queue Jumper Privacy Policy</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8f4; color: #151922; }
    main { width: min(100%, 760px); margin: 0 auto; padding: 28px 18px; display: grid; gap: 16px; }
    section { border: 1px solid #e0e7ef; border-radius: 8px; background: #fff; padding: 18px; }
    h1 { margin: 0; font-size: 34px; }
    h2 { margin: 0 0 8px; }
    p, li { line-height: 1.55; color: #4b5563; }
    a { color: #149542; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <h1>Privacy Policy</h1>
    <section>
      <h2>What Queue Jumper Collects</h2>
      <p>Queue Jumper uses shop profile details, owner sign-in details, queue tickets, estimated wait times, and realtime queue status to operate the live waiting list experience.</p>
    </section>
    <section>
      <h2>Customer Queue Privacy</h2>
      <p>Public customer pages show ticket numbers, rank, and estimated wait. Customer names are not shown on public queue pages.</p>
    </section>
    <section>
      <h2>How Data Is Used</h2>
      <p>Data is used only to manage queues, show live rank updates, and let owners operate their shop dashboard. This prototype does not sell personal data.</p>
    </section>
    <section>
      <h2>Contact</h2>
      <p>For production, replace this with your support email before submitting to Google Play.</p>
    </section>
    <a href="/join/milos-barbershop">Back to customer queue</a>
  </main>
</body>
</html>`;
}

function customerPageHtml(dashboard) {
  const safeName = escapeHtml(dashboard.name);
  const safeAccent = escapeHtml(dashboard.accent);
  const serviceOptions = [...new Set([dashboard.serviceLabel, ...(dashboard.serviceOptions || []), "Walk-in", "Pickup", "Consultation"])]
    .map((service) => `<option>${escapeHtml(service)}</option>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeName} Queue</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8f4; color: #151922; }
    main { width: min(100%, 520px); margin: 0 auto; padding: 18px; display: grid; gap: 14px; }
    .hero { border-radius: 8px; background: ${safeAccent}; color: #fff; padding: 22px 18px; display: grid; gap: 18px; }
    .top { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
    .brand { font-weight: 900; font-size: 18px; }
    .shop { opacity: .86; font-weight: 700; margin-top: 4px; }
    .live { border-radius: 999px; background: rgba(255,255,255,.18); padding: 7px 12px; font-weight: 900; }
    h1 { margin: 0; font-size: 36px; line-height: 1.05; letter-spacing: 0; }
    p { margin: 0; line-height: 1.45; }
    .card { border: 1px solid #e0e7ef; border-radius: 8px; background: #fff; padding: 16px; box-shadow: 0 10px 24px rgba(21,25,34,.06); }
    .rank { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .metric { border-radius: 8px; background: #f8fafb; padding: 14px; }
    .metric.wide { grid-column: 1 / -1; background: #fff5f3; }
    .label { color: #697386; font-size: 13px; font-weight: 800; }
    .value { display: block; margin-top: 4px; color: #ff5848; font-size: 42px; line-height: 1; font-weight: 900; }
    .wait { color: #151922; font-size: 28px; }
    .status { display: grid; gap: 13px; }
    .row { display: flex; gap: 12px; align-items: start; }
    .mark { width: 18px; height: 18px; border-radius: 50%; margin-top: 2px; background: #dce4ec; flex: 0 0 auto; }
    .row strong { display: block; }
    .row span { display: block; color: #697386; font-size: 14px; margin-top: 3px; }
    .suggestion { background: #101820; color: #fff; }
    .suggestion p { color: rgba(255,255,255,.72); margin-top: 6px; }
    .mini { display: flex; justify-content: space-between; border-top: 1px solid #edf1f5; padding: 10px 0; }
    .mini:first-child { border-top: 0; }
    .ticket { font-weight: 900; }
    .empty { color: #697386; }
    form { display: grid; gap: 10px; }
    label { display: grid; gap: 6px; color: #4b5563; font-size: 13px; font-weight: 800; }
    input, select { width: 100%; min-height: 46px; border: 1px solid #dce4ec; border-radius: 8px; padding: 0 12px; font: inherit; background: #fbfdff; color: #151922; }
    button { min-height: 50px; border: 0; border-radius: 8px; background: ${safeAccent}; color: #fff; font: inherit; font-weight: 900; }
    button:disabled { opacity: .55; }
    .message { color: #149542; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="top">
        <div>
          <div class="brand">Queue Jumper</div>
          <div class="shop">${safeName}</div>
        </div>
        <div class="live" id="live">Connecting</div>
      </div>
      <h1>You're checked in</h1>
      <p>Keep this page open. Your rank updates automatically when the shop advances the line.</p>
    </section>
    <section class="card" id="joinCard">
      <h2>Join this queue</h2>
      <form id="joinForm">
        <label>Nickname
          <input name="name" maxlength="80" placeholder="e.g. Sam" autocomplete="name" />
        </label>
        <label>Phone for SMS or WhatsApp
          <input name="phone" maxlength="24" placeholder="+1 555 010 1234" autocomplete="tel" inputmode="tel" />
        </label>
        <label>Service
          <select name="service">
            ${serviceOptions}
          </select>
        </label>
        <button id="joinButton" type="submit">Join queue</button>
        <p class="message" id="joinMessage"></p>
      </form>
    </section>
    <section class="card rank">
      <div class="metric"><div class="label">Ticket</div><span class="value" id="ticket">...</span></div>
      <div class="metric"><div class="label">Your rank</div><span class="value" id="rank">...</span></div>
      <div class="metric wide"><div class="label">Estimated wait</div><span class="value wait" id="wait">...</span></div>
    </section>
    <section class="card status">
      <h2>Status</h2>
      <div class="row"><span class="mark" style="background:${safeAccent}"></span><div><strong>Joined the queue</strong><span>Checked in from the door QR</span></div></div>
      <div class="row"><span class="mark" id="nextMark"></span><div><strong id="ahead">Waiting</strong><span>We'll call your ticket when it is time.</span></div></div>
      <div class="row"><span class="mark"></span><div><strong>Service starts</strong><span>Show this ticket if the shop asks.</span></div></div>
    </section>
    <section class="card suggestion">
      <strong>While you wait</strong>
      <p id="suggestion">Grab coffee nearby - 2 min walk</p>
    </section>
    <section class="card">
      <h2>Queue ahead</h2>
      <div id="queueAhead" class="empty">Waiting for live queue...</div>
    </section>
  </main>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const shopId = ${JSON.stringify(dashboard.id)};
    const socket = io();
    const ticket = document.getElementById("ticket");
    const rank = document.getElementById("rank");
    const wait = document.getElementById("wait");
    const live = document.getElementById("live");
    const ahead = document.getElementById("ahead");
    const nextMark = document.getElementById("nextMark");
    const queueAhead = document.getElementById("queueAhead");
    const suggestion = document.getElementById("suggestion");
    const joinForm = document.getElementById("joinForm");
    const joinButton = document.getElementById("joinButton");
    const joinMessage = document.getElementById("joinMessage");
    let myTicket = null;

    socket.on("connect", () => {
      live.textContent = "Live";
      socket.emit("public:select", shopId);
    });

    socket.on("disconnect", () => {
      live.textContent = "Offline";
    });

    socket.on("queue:public", (state) => {
      joinButton.disabled = Boolean(state.paused);
      if (state.paused && !joinMessage.textContent) joinMessage.textContent = "This shop has paused new check-ins.";
      const customer = state.queue.find((item) => item.ticket === myTicket) || state.queue[2] || state.queue[0];
      const currentRank = customer?.rank || 0;
      ticket.textContent = customer?.ticket || "Done";
      rank.textContent = currentRank || "-";
      wait.textContent = customer?.estimatedWait ? customer.estimatedWait + " min" : "0 min";
      ahead.textContent = currentRank <= 1 ? "You're up next" : (currentRank - 1) + " people ahead";
      nextMark.style.background = currentRank <= 1 ? "#ff5848" : "#dce4ec";
      suggestion.textContent = state.activeDashboard.id === "red-door" ? "Browse the market stalls - 2 min walk" : "Grab coffee next door - 2 min walk";
      const visible = state.queue.slice(0, Math.max(currentRank, 1));
      queueAhead.className = "";
      queueAhead.innerHTML = visible.length
        ? visible.map((item, index) => '<div class="mini"><span class="ticket">' + item.ticket + '</span><span>' + (index + 1 === currentRank ? 'You' : index === 0 ? 'Next' : 'Waiting') + '</span></div>').join("")
        : '<span class="empty">The queue is clear.</span>';
    });

    joinForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      joinButton.disabled = true;
      joinMessage.textContent = "Joining...";
      const form = new FormData(joinForm);
      const response = await fetch("/api/join/${dashboard.slug}", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          phone: form.get("phone"),
          service: form.get("service"),
        }),
      });
      const result = await response.json();
      if (result.ok) myTicket = result.customer.ticket;
      joinMessage.textContent = result.ok ? "You're in. Your ticket is " + result.customer.ticket + "." : result.error;
      joinButton.disabled = false;
    });
  </script>
</body>
</html>`;
}

app.get("/privacy", (req, res) => {
  res.type("html").send(privacyPolicyHtml());
});

app.get("/", (req, res) => {
  const primaryDashboard = dashboards[0];
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Queue Jumper</title>
  <style>
    body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8f4; color: #151922; display: grid; place-items: center; padding: 24px; }
    main { width: min(100%, 560px); border: 1px solid #e0e7ef; border-radius: 8px; background: #fff; padding: 24px; box-shadow: 0 18px 50px rgba(21,25,34,.08); display: grid; gap: 16px; }
    h1 { margin: 0; color: #149542; font-size: 36px; line-height: 1; }
    p { margin: 0; color: #4b5563; line-height: 1.55; }
    a { min-height: 48px; border-radius: 8px; background: #22b157; color: #fff; text-decoration: none; font-weight: 900; display: grid; place-items: center; padding: 0 16px; }
    code { background: #eef3f1; border-radius: 6px; padding: 2px 6px; color: #151922; }
  </style>
</head>
<body>
  <main>
    <h1>Queue Jumper</h1>
    <p>Realtime queue service is running. Customers can join a shop queue from a public QR link and watch their rank update live.</p>
    <p>Status: <code>ok</code></p>
    <a href="/join/${primaryDashboard.slug}">Open demo customer queue</a>
    <a href="/privacy">Privacy policy</a>
  </main>
</body>
</html>`);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "queue-jumper",
    storage: dbPool ? "postgres" : "json",
    dashboards: dashboards.length,
    updatedAt: new Date().toISOString(),
  });
});

app.get("/health/db", async (req, res) => {
  if (!dbPool) {
    res.json({
      ok: true,
      storage: "json",
      database: "not_configured",
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    await dbPool.query("SELECT 1");
    res.json({
      ok: true,
      storage: "postgres",
      database: "connected",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      storage: "postgres",
      database: "unavailable",
      error: error.message,
      updatedAt: new Date().toISOString(),
    });
  }
});

app.post("/api/join/:slug", (req, res) => {
  if (isRateLimited(req)) {
    res.status(429).json({ ok: false, error: "Too many check-in attempts. Please wait a minute and try again." });
    return;
  }

  const dashboard = getDashboardBySlug(req.params.slug);
  const state = getState(dashboard.id);

  if (state.paused) {
    res.status(409).json({ ok: false, error: "This shop has paused new check-ins." });
    return;
  }

  const { name, service, phone, pushToken } = normalizeCustomerInput(req.body);
  const customer = {
    id: Date.now(),
    ticket: nextTicketFor(dashboard, state),
    name,
    phone,
    pushToken,
    service,
    joinedAt: nowLabel(),
    status: state.queue.length === 0 ? "next" : "waiting",
  };

  state.queue.push(customer);
  makeNotification(state, `${customer.ticket} joined for ${service}${phone ? " with phone on file" : ""}.`);
  emitDashboardUpdate(dashboard.id);
  res.status(201).json({
    ok: true,
    customer: {
      ticket: customer.ticket,
      rank: state.queue.length,
      estimatedWait: waitForIndex(state.queue.length - 1),
    },
  });
});

app.get("/join/:slug", (req, res) => {
  const dashboard = getDashboardBySlug(req.params.slug);
  res.type("html").send(customerPageHtml(dashboard));
});

io.on("connection", (socket) => {
  let activeShopId = "milos";
  socket.data.isOwner = false;

  socket.on("owner:auth", (token) => {
    if (token !== ownerToken) {
      socket.emit("owner:error", "Owner authentication failed.");
      return;
    }

    socket.data.isOwner = true;
    socket.join(`${activeShopId}:owners`);
    socket.emit("owner:auth:ok");
    socket.emit("queue:update", snapshot(activeShopId));
  });

  socket.on("dashboard:select", (shopId) => {
    if (!socket.data.isOwner) {
      socket.emit("owner:error", "Owner authentication is required.");
      return;
    }

    const dashboard = getDashboard(shopId);
    socket.leave(`${activeShopId}:owners`);
    activeShopId = dashboard.id;
    socket.join(`${activeShopId}:owners`);
    socket.emit("queue:update", snapshot(activeShopId));
  });

  socket.on("public:select", (shopId) => {
    const dashboard = getDashboard(shopId);
    socket.leave(`${activeShopId}:public`);
    activeShopId = dashboard.id;
    socket.join(`${activeShopId}:public`);
    socket.emit("queue:public", publicSnapshot(activeShopId));
  });

  socket.on("owner:next", (payload) => {
    if (!isOwnerAuthorized(socket, payload)) {
      socket.emit("owner:error", "Owner authentication is required.");
      return;
    }

    const shopId = payloadShopId(payload, activeShopId);
    const dashboard = getDashboard(shopId ?? activeShopId);
    const state = getState(dashboard.id);
    if (state.queue.length === 0) return;
    state.completed = [{ ...state.serving, completedAt: new Date().toISOString() }, ...state.completed].slice(0, 6);
    const [nextCustomer, ...rest] = state.queue;
    state.serving = {
      ticket: nextCustomer.ticket,
      name: nextCustomer.name,
      service: nextCustomer.service,
    };
    makeNotification(state, `${nextCustomer.ticket} is now being served.`);
    state.queue = rest.map((customer, index) => ({
      ...customer,
      status: index === 0 ? "next" : "waiting",
    }));
    emitDashboardUpdate(dashboard.id);
  });

  socket.on("owner:reset", (payload) => {
    if (!isOwnerAuthorized(socket, payload)) {
      socket.emit("owner:error", "Owner authentication is required.");
      return;
    }

    const shopId = payloadShopId(payload, activeShopId);
    const dashboard = getDashboard(shopId ?? activeShopId);
    states.set(dashboard.id, createState(dashboard));
    emitDashboardUpdate(dashboard.id);
  });

  socket.on("owner:pause", (payload = {}) => {
    if (!isOwnerAuthorized(socket, payload)) {
      socket.emit("owner:error", "Owner authentication is required.");
      return;
    }

    const { paused } = payload;
    const shopId = payloadShopId(payload, activeShopId);
    const dashboard = getDashboard(shopId ?? activeShopId);
    const state = getState(dashboard.id);
    state.paused = Boolean(paused);
    makeNotification(state, state.paused ? "New customer check-ins are paused." : "New customer check-ins are open.");
    emitDashboardUpdate(dashboard.id);
  });

  socket.on("owner:add", (payload = {}) => {
    if (!isOwnerAuthorized(socket, payload)) {
      socket.emit("owner:error", "Owner authentication is required.");
      return;
    }

    const { name, service, phone, pushToken } = payload;
    const shopId = payloadShopId(payload, activeShopId);
    const dashboard = getDashboard(shopId ?? activeShopId);
    const state = getState(dashboard.id);
    const input = normalizeCustomerInput({ name, phone, pushToken, service: service || dashboard.serviceLabel });
    const customer = {
      id: Date.now(),
      ticket: nextTicketFor(dashboard, state),
      name: input.name,
      phone: input.phone,
      pushToken: input.pushToken,
      service: input.service,
      joinedAt: nowLabel(),
      status: state.queue.length === 0 ? "next" : "waiting",
    };

    state.queue.push(customer);
    makeNotification(state, `${customer.ticket} was added by owner.`);
    emitDashboardUpdate(dashboard.id);
  });

  socket.on("owner:notify", async (payload = {}) => {
    if (!isOwnerAuthorized(socket, payload)) {
      socket.emit("owner:error", "Owner authentication is required.");
      return;
    }

    const { ticket, channel = "sms" } = payload;
    const shopId = payloadShopId(payload, activeShopId);
    const dashboard = getDashboard(shopId ?? activeShopId);
    const state = getState(dashboard.id);
    const customer = state.queue.find((item) => item.ticket === ticket) || (state.serving.ticket === ticket ? state.serving : null);
    if (!customer) return;

    const message = `${dashboard.name}: ${customer.ticket} is coming up. Please return for ${customer.service}.`;
    const result = await sendCustomerMessage({ dashboard, customer, message, channel });
    if (!result.ok) {
      socket.emit("owner:error", result.error);
      return;
    }

    const notifiedAt = new Date().toISOString();
    state.queue = state.queue.map((item) => item.ticket === ticket ? { ...item, notifiedAt, notificationChannel: channel } : item);
    if (state.serving.ticket === ticket) {
      state.serving = { ...state.serving, notifiedAt, notificationChannel: channel };
    }
    makeNotification(state, `${ticket} notified by ${channel.toUpperCase()}.`);
    emitDashboardUpdate(dashboard.id);
  });

  socket.on("owner:remove", (payload = {}) => {
    if (!isOwnerAuthorized(socket, payload)) {
      socket.emit("owner:error", "Owner authentication is required.");
      return;
    }

    const { ticket, reason = "removed" } = payload;
    const shopId = payloadShopId(payload, activeShopId);
    const dashboard = getDashboard(shopId ?? activeShopId);
    const state = getState(dashboard.id);
    const index = state.queue.findIndex((customer) => customer.ticket === ticket);
    if (index === -1) return;
    const [removed] = state.queue.splice(index, 1);
    state.completed = [{ ...removed, completedAt: new Date().toISOString(), reason }, ...state.completed].slice(0, 8);
    makeNotification(state, `${removed.ticket} marked ${reason}.`);
    emitDashboardUpdate(dashboard.id);
  });
});

const port = process.env.PORT || 3030;

await loadPersistedState();

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Queue Jumper server running at http://0.0.0.0:${port} with ${dbPool ? "Postgres" : "JSON file"} storage`);
});
