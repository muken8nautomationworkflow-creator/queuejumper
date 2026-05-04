import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const dashboards = [
  {
    id: "milos",
    slug: "milos-barbershop",
    name: "Milo's Barbershop",
    location: "18 Market Lane",
    serviceLabel: "Haircut",
    accent: "#22b157",
    serving: { ticket: "A15", name: "Alex Thompson", service: "Haircut" },
    queue: [
      { id: 16, ticket: "A16", name: "Taylor Nguyen", service: "Beard trim", joinedAt: "9:20 AM" },
      { id: 17, ticket: "A17", name: "Jordan Lee", service: "Haircut", joinedAt: "9:24 AM" },
      { id: 18, ticket: "A18", name: "Casey Brown", service: "Haircut", joinedAt: "9:28 AM" },
      { id: 19, ticket: "A19", name: "Chris Patel", service: "Beard trim", joinedAt: "9:31 AM" },
      { id: 20, ticket: "A20", name: "Morgan Davis", service: "Haircut", joinedAt: "9:35 AM" },
      { id: 21, ticket: "A21", name: "Riley Smith", service: "Haircut", joinedAt: "9:38 AM" },
      { id: 22, ticket: "A22", name: "Jamie Wilson", service: "Beard trim", joinedAt: "9:42 AM" },
      { id: 23, ticket: "A23", name: "Drew Martin", service: "Haircut", joinedAt: "9:45 AM" },
    ],
  },
  {
    id: "red-door",
    slug: "red-door-coffee",
    name: "Red Door Coffee",
    location: "22 Market Lane",
    serviceLabel: "Pickup",
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
  };
}

for (const dashboard of dashboards) {
  states.set(dashboard.id, createState(dashboard));
}

const waitForIndex = (index) => (index + 1) * 5 + 3;

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
  return dashboards.map(({ id, slug, name, location, serviceLabel, accent }) => ({
    id,
    slug,
    name,
    location,
    serviceLabel,
    accent,
  }));
}

function snapshot(shopId = "milos") {
  const dashboard = getDashboard(shopId);
  const state = getState(dashboard.id);
  return {
    dashboards: publicDashboards(),
    activeDashboard: publicDashboards().find((item) => item.id === dashboard.id),
    serving: state.serving,
    queue: state.queue.map((customer, index) => ({
      ...customer,
      rank: index + 1,
      estimatedWait: waitForIndex(index),
      status: index === 0 ? "next" : "waiting",
    })),
    completed: state.completed,
    updatedAt: new Date().toISOString(),
  };
}

function customerPageHtml(dashboard) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${dashboard.name} Queue</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8f4; color: #151922; }
    main { width: min(100%, 520px); margin: 0 auto; padding: 18px; display: grid; gap: 14px; }
    .hero { border-radius: 8px; background: ${dashboard.accent}; color: #fff; padding: 22px 18px; display: grid; gap: 18px; }
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
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="top">
        <div>
          <div class="brand">Queue Jumper</div>
          <div class="shop">${dashboard.name}</div>
        </div>
        <div class="live" id="live">Connecting</div>
      </div>
      <h1>You're checked in</h1>
      <p>Keep this page open. Your rank updates automatically when the shop advances the line.</p>
    </section>
    <section class="card rank">
      <div class="metric"><div class="label">Ticket</div><span class="value" id="ticket">...</span></div>
      <div class="metric"><div class="label">Your rank</div><span class="value" id="rank">...</span></div>
      <div class="metric wide"><div class="label">Estimated wait</div><span class="value wait" id="wait">...</span></div>
    </section>
    <section class="card status">
      <h2>Status</h2>
      <div class="row"><span class="mark" style="background:${dashboard.accent}"></span><div><strong>Joined the queue</strong><span>Checked in from the door QR</span></div></div>
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

    socket.on("connect", () => {
      live.textContent = "Live";
      socket.emit("dashboard:select", shopId);
    });

    socket.on("disconnect", () => {
      live.textContent = "Offline";
    });

    socket.on("queue:update", (state) => {
      const customer = state.queue[2] || state.queue[0];
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
  </script>
</body>
</html>`;
}

app.get("/join/:slug", (req, res) => {
  const dashboard = getDashboardBySlug(req.params.slug);
  res.type("html").send(customerPageHtml(dashboard));
});

io.on("connection", (socket) => {
  let activeShopId = "milos";
  socket.join(activeShopId);
  socket.emit("queue:update", snapshot(activeShopId));

  socket.on("dashboard:select", (shopId) => {
    const dashboard = getDashboard(shopId);
    socket.leave(activeShopId);
    activeShopId = dashboard.id;
    socket.join(activeShopId);
    socket.emit("queue:update", snapshot(activeShopId));
  });

  socket.on("owner:next", (shopId) => {
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
    state.queue = rest.map((customer, index) => ({
      ...customer,
      status: index === 0 ? "next" : "waiting",
    }));
    io.to(dashboard.id).emit("queue:update", snapshot(dashboard.id));
  });

  socket.on("owner:reset", (shopId) => {
    const dashboard = getDashboard(shopId ?? activeShopId);
    states.set(dashboard.id, createState(dashboard));
    io.to(dashboard.id).emit("queue:update", snapshot(dashboard.id));
  });
});

const port = process.env.PORT || 3030;

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Queue Jumper server running at http://0.0.0.0:${port}`);
});
