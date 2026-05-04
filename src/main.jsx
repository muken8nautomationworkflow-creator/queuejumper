import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  CircleHelp,
  Coffee,
  Download,
  ExternalLink,
  Filter,
  Home,
  Info,
  LogOut,
  MapPin,
  MoreHorizontal,
  QrCode,
  RotateCcw,
  Scissors,
  Settings,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import "./styles.css";

function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL.replace(/\/$/, "");
  }

  const { protocol, hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://127.0.0.1:3030";
  }

  return origin.replace(/\/$/, "");
}

const socket = io(getSocketUrl(), {
  transports: ["websocket", "polling"],
});
const ownerToken = import.meta.env.VITE_OWNER_TOKEN || "queue-jumper-demo-owner-token";

const avatarColors = ["#f7b267", "#7bdff2", "#b2f7ef", "#f79d84", "#cdb4db", "#90dbf4", "#f1c0e8", "#98f5e1"];

const fallbackDashboards = [
  {
    id: "milos",
    slug: "milos-barbershop",
    name: "Milo's Barbershop",
    location: "18 Market Lane",
    serviceLabel: "Haircut",
    serviceOptions: ["Haircut", "Beard trim", "Color", "Kids cut"],
    vipPlans: [
      { id: "priority", name: "Priority Pass", price: "$9/mo", perk: "VIP queue priority" },
      { id: "unlimited", name: "Unlimited VIP", price: "$29/mo", perk: "Priority plus recurring bookings" },
    ],
    accent: "#22b157",
  },
];

function sanitizeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "queue";
}

function getLocalJoinUrl(activeDashboard) {
  if (import.meta.env.VITE_CUSTOMER_BASE_URL) {
    return `${import.meta.env.VITE_CUSTOMER_BASE_URL.replace(/\/$/, "")}/join/${activeDashboard.slug}`;
  }

  const browserHost = window.location.hostname;
  const shareHost = browserHost === "localhost" || browserHost === "127.0.0.1" ? "192.168.0.109" : browserHost;
  const port = browserHost === "localhost" || browserHost === "127.0.0.1" ? ":3030" : "";
  return `${window.location.protocol}//${shareHost}${port}/join/${activeDashboard.slug}`;
}

function downloadQrCode({ activeDashboard, customerTicket, cells }) {
  const joinUrl = getLocalJoinUrl(activeDashboard);
  const cellSize = 18;
  const gridSize = 11;
  const gridOffset = 54;
  const boxSize = cellSize * gridSize;
  const escape = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));

  const modules = cells
    .map((active, index) => {
      if (!active) return "";
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      return `<rect x="${gridOffset + col * cellSize}" y="${gridOffset + row * cellSize}" width="${cellSize - 2}" height="${cellSize - 2}" rx="3" fill="#101820" />`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="306" height="380" viewBox="0 0 306 380">
  <rect width="306" height="380" rx="24" fill="#f7f7ef" />
  <rect x="30" y="30" width="246" height="246" rx="24" fill="#ffffff" stroke="#101820" stroke-width="6" />
  ${modules}
  <rect x="${gridOffset + 60}" y="${gridOffset + 78}" width="78" height="42" rx="18" fill="${escape(activeDashboard.accent)}" />
  <text x="153" y="${gridOffset + 105}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">${escape(customerTicket)}</text>
  <text x="153" y="318" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#101820">${escape(activeDashboard.name)}</text>
  <text x="153" y="346" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#3d4b52">${escape(joinUrl)}</text>
</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${sanitizeFilename(activeDashboard.name)}-door-qr.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function shopIdFromPath() {
  const slug = window.location.pathname.match(/\/join\/([^/]+)/)?.[1];
  if (slug === "red-door-coffee") return "red-door";
  if (slug === "bloom-nails") return "bloom";
  return "milos";
}

function useQueueSocket(initialDashboardId = "milos") {
  const [state, setState] = useState({
    dashboards: fallbackDashboards,
    activeDashboard: fallbackDashboards[0],
    serving: { ticket: "A15", name: "Alex Thompson", service: "Haircut" },
    queue: [],
    completed: [],
    appointments: [],
    analytics: { waiting: 0, servedToday: 0, noShows: 0, notified: 0, vipWaiting: 0, vipServed: 0, averageWait: 0, serviceQueues: [] },
    updatedAt: new Date().toISOString(),
  });
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const handleUpdate = (payload) => setState(payload);
    const handleConnect = () => {
      setConnected(true);
      socket.emit("owner:auth", ownerToken);
    };
    const handleOwnerAuth = () => socket.emit("dashboard:select", initialDashboardId);
    const handleDisconnect = () => setConnected(false);

    socket.on("queue:update", handleUpdate);
    socket.on("connect", handleConnect);
    socket.on("owner:auth:ok", handleOwnerAuth);
    socket.on("disconnect", handleDisconnect);
    socket.emit("owner:auth", ownerToken);

    return () => {
      socket.off("queue:update", handleUpdate);
      socket.off("connect", handleConnect);
      socket.off("owner:auth:ok", handleOwnerAuth);
      socket.off("disconnect", handleDisconnect);
    };
  }, [initialDashboardId]);

  return { ...state, connected };
}

function useActiveSection() {
  const getHash = () => window.location.hash.replace("#", "") || "queue";
  const [activeSection, setActiveSection] = useState(getHash);

  useEffect(() => {
    const handleHashChange = () => setActiveSection(getHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return activeSection;
}

function Sidebar({ activeSection }) {
  return (
    <aside className="sidebar" aria-label="Owner navigation">
      <div className="brand">Queue<br />Jumper</div>
      <nav className="nav-list">
        <a className={`nav-item ${activeSection === "queue" ? "active" : ""}`} href="#queue">
          <UsersRound size={21} />
          <span>Queue</span>
        </a>
        <a className={`nav-item ${activeSection === "qr" ? "active" : ""}`} href="#qr">
          <QrCode size={20} />
          <span>QR</span>
        </a>
        <a className={`nav-item ${activeSection === "analytics" ? "active" : ""}`} href="#analytics">
          <SlidersHorizontal size={20} />
          <span>Analytics</span>
        </a>
        <a className={`nav-item ${activeSection === "settings" ? "active" : ""}`} href="#settings">
          <Settings size={20} />
          <span>Settings</span>
        </a>
      </nav>
      <div className="sidebar-footer">
        <div className="owner">
          <div className="owner-avatar">M</div>
          <div>
            <strong>Milo</strong>
            <span>Owner</span>
          </div>
          <ChevronDown size={17} />
        </div>
        <div className="help">
          <CircleHelp size={22} />
          <div>
            <strong>Need help?</strong>
            <span>View help center</span>
          </div>
          <ExternalLink size={14} />
        </div>
      </div>
    </aside>
  );
}

function ShopHeader({ activeDashboard, connected, dashboards, onDashboardChange, onSignOut }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="shop-switcher">
        <button className="shop-select" type="button" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}>
          <span className="shop-photo" style={{ background: `linear-gradient(135deg, #253849, ${activeDashboard.accent})` }} aria-hidden="true">
            <Scissors size={24} />
          </span>
          <span>{activeDashboard.name}</span>
          <ChevronDown size={18} />
        </button>
        {isOpen && (
          <div className="shop-menu">
            {dashboards.map((dashboard) => (
              <button
                className={dashboard.id === activeDashboard.id ? "selected" : ""}
                key={dashboard.id}
                type="button"
                onClick={() => {
                  onDashboardChange(dashboard.id);
                  setIsOpen(false);
                }}
              >
                <span className="shop-dot" style={{ background: dashboard.accent }} />
                <span>
                  <strong>{dashboard.name}</strong>
                  <small>{dashboard.location}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="top-actions">
        <div className="connection">
          <span className={connected ? "dot" : "dot offline"} />
          <span>{connected ? "Connected" : "Reconnecting"}</span>
          <small>Socket.io</small>
        </div>
        <button className="icon-button" aria-label="Notifications" type="button">
          <Bell size={21} />
          <span className="count">2</span>
        </button>
        <button className="icon-button" aria-label="Sign out" type="button" onClick={onSignOut}>
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}

function CurrentCard({ serving }) {
  return (
    <section className="summary-card serving-card">
      <div>
        <p>Currently serving</p>
        <h1>{serving.ticket}</h1>
        <strong>{serving.name}</strong>
        <span>{serving.service}</span>
      </div>
      <div className="chair-art" aria-hidden="true">
        <Scissors size={62} />
      </div>
    </section>
  );
}

function NextCard({ activeDashboard, nextCustomer }) {
  return (
    <section className="summary-card next-card">
      <div>
        <p>Next customer</p>
        <h2>{nextCustomer?.ticket ?? "Done"}</h2>
        <strong>{nextCustomer?.name ?? "Queue clear"}</strong>
        <span>{nextCustomer?.service ?? "No one is waiting"}</span>
      </div>
      <button className="primary-button" type="button" onClick={() => socket.emit("owner:next", activeDashboard.id)} disabled={!nextCustomer}>
        Next customer
        <ArrowRight size={21} />
      </button>
    </section>
  );
}

function QueueTable({ queue, activeDashboard }) {
  const [serviceFilter, setServiceFilter] = useState("All");
  const serviceOptions = useMemo(
    () => ["All", ...new Set([activeDashboard.serviceLabel, ...(activeDashboard.serviceOptions || []), ...queue.map((customer) => customer.service)].filter(Boolean))],
    [activeDashboard, queue],
  );
  const visibleQueue = serviceFilter === "All" ? queue : queue.filter((customer) => customer.service === serviceFilter);

  return (
    <section className="queue-panel" id="queue">
      <div className="panel-header">
        <div className="panel-title">
          <UsersRound size={18} />
          <h2>Waiting list</h2>
          <span>{visibleQueue.length}</span>
        </div>
        <div className="panel-actions">
          <button type="button" onClick={() => setServiceFilter("All")}>
            <Filter size={16} />
            All
          </button>
          <button type="button" aria-label="Queue settings">
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </div>
      <div className="service-filter-row">
        {serviceOptions.map((service) => (
          <button className={service === serviceFilter ? "selected" : ""} key={service} type="button" onClick={() => setServiceFilter(service)}>
            {service}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Customer</th>
              <th>Ticket</th>
              <th>Service</th>
              <th>Phone</th>
              <th>Est. wait</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleQueue.map((customer, index) => (
              <tr key={customer.ticket}>
                <td>{index + 1}</td>
                <td>
                  <span className="avatar" style={{ background: avatarColors[index % avatarColors.length] }}>
                    {customer.name.split(" ").map((part) => part[0]).join("")}
                  </span>
                  {customer.name}
                  {customer.isVip && <span className="vip-pill">VIP</span>}
                </td>
                <td className="ticket">{customer.ticket}</td>
                <td>{customer.service}</td>
                <td>{customer.phone || "No phone"}</td>
                <td className="wait">~{customer.estimatedWait} min</td>
                <td>
                  <span className={`status ${index === 0 ? "next" : ""}`}>{index === 0 ? "Next" : "Waiting"}</span>
                </td>
                <td>
                  <button
                    className="row-action"
                    aria-label={`Notify ${customer.name}`}
                    type="button"
                    disabled={!customer.phone}
                    onClick={() => socket.emit("owner:notify", { token: ownerToken, shopId: activeDashboard.id, ticket: customer.ticket, channel: "sms" })}
                  >
                    <Bell size={18} />
                  </button>
                  <button
                    className="row-action"
                    aria-label={`Mark ${customer.name} no-show`}
                    type="button"
                    onClick={() => socket.emit("owner:remove", { token: ownerToken, shopId: activeDashboard.id, ticket: customer.ticket, reason: "no-show" })}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-foot">
        <span className="dot" />
        Auto-updates in real time
      </div>
    </section>
  );
}

function NoShowPanel({ completed, activeDashboard }) {
  const noShows = (completed || []).filter((customer) => customer.reason === "no-show");
  if (noShows.length === 0) return null;

  return (
    <section className="queue-panel no-show-panel">
      <div className="panel-header">
        <div className="panel-title">
          <RotateCcw size={18} />
          <h2>No-show rejoin</h2>
          <span>{noShows.length}</span>
        </div>
      </div>
      {noShows.map((customer) => (
        <div className="service-summary-row" key={customer.ticket}>
          <strong>{customer.name}</strong>
          <span>{customer.ticket}</span>
          <span>{customer.service}</span>
          <button
            className="secondary-button compact"
            type="button"
            onClick={() => socket.emit("owner:rejoin", { token: ownerToken, shopId: activeDashboard.id, ticket: customer.ticket })}
          >
            Rejoin after next
          </button>
        </div>
      ))}
    </section>
  );
}

function AppointmentPanel({ appointments = [] }) {
  return (
    <section className="queue-panel no-show-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Settings size={18} />
          <h2>n8n appointment agent</h2>
          <span>{appointments.length}</span>
        </div>
      </div>
      {appointments.length === 0 ? (
        <div className="panel-foot">Appointment requests from the QR page will appear here.</div>
      ) : (
        appointments.map((appointment) => (
          <div className="service-summary-row" key={appointment.id}>
            <strong>{appointment.name}</strong>
            <span>{appointment.ticket}</span>
            <span>{appointment.service}</span>
            <span>{appointment.preferredAt}</span>
          </div>
        ))
      )}
    </section>
  );
}

function AnalyticsPanel({ analytics }) {
  const cards = [
    ["Waiting", analytics.waiting ?? 0],
    ["Served today", analytics.servedToday ?? 0],
    ["Avg wait", `${analytics.averageWait ?? 0} min`],
    ["No-shows", analytics.noShows ?? 0],
    ["Notified", analytics.notified ?? 0],
    ["VIP waiting", analytics.vipWaiting ?? 0],
    ["VIP served", analytics.vipServed ?? 0],
  ];

  return (
    <section className="settings-page" id="analytics">
      <div className="settings-heading">
        <div>
          <h1>Analytics</h1>
          <p>Track daily volume, notification use, service demand, and wait pressure.</p>
        </div>
      </div>
      <div className="analytics-grid">
        {cards.map(([label, value]) => (
          <section className="settings-panel metric-panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </section>
        ))}
      </div>
      <section className="queue-panel analytics-services">
        <div className="panel-header">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <h2>Per-service queues</h2>
          </div>
        </div>
        {(analytics.serviceQueues || []).map((item) => (
          <div className="service-summary-row" key={item.service}>
            <strong>{item.service}</strong>
            <span>{item.waiting} waiting</span>
            <span>{item.completed} served</span>
            <span>{item.estimatedWait} min total wait</span>
          </div>
        ))}
      </section>
    </section>
  );
}

function QRCard({ activeDashboard, customerTicket }) {
  const joinUrl = getLocalJoinUrl(activeDashboard);
  const cells = useMemo(
    () => Array.from({ length: 121 }, (_, index) => {
      const row = Math.floor(index / 11);
      const col = index % 11;
      const finder = (row < 3 && col < 3) || (row < 3 && col > 7) || (row > 7 && col < 3);
      return finder || ((row * 7 + col * 5 + row * col) % 4 !== 0);
    }),
    [],
  );

  return (
    <section className="qr-card" id="qr">
      <h2>Door QR poster</h2>
      <p>Customers scan, add their phone and service, then leave the lobby until they are notified.</p>
      <div className="qr-box" aria-label="Door QR code preview">
        <div className="qr-grid">
          {cells.map((active, index) => (
            <span className={active ? "active" : ""} key={index} />
          ))}
        </div>
        <div className="qr-ticket">{customerTicket}</div>
      </div>
      <p className="qr-link">{joinUrl}</p>
      <div className="poster-copy">
        <strong>Scan to join</strong>
        <span>Live rank, wait time, and SMS/WhatsApp return alerts.</span>
      </div>
      <button className="secondary-button" type="button" onClick={() => downloadQrCode({ activeDashboard, customerTicket, cells })}>
        <Download size={17} />
        Download QR
      </button>
    </section>
  );
}

function SettingsPanel({ activeDashboard }) {
  const joinUrl = getLocalJoinUrl(activeDashboard);

  return (
    <section className="settings-page" id="settings">
      <div className="settings-heading">
        <div>
          <h1>Settings</h1>
          <p>Manage the queue rules customers see after scanning the door QR.</p>
        </div>
        <button className="primary-button settings-save" type="button">
          Save settings
          <ArrowRight size={19} />
        </button>
      </div>
      <div className="settings-grid">
        <section className="settings-panel">
          <h2>Shop profile</h2>
          <label>
            Shop name
            <input value={activeDashboard.name} readOnly />
          </label>
          <label>
            Location
            <span className="input-with-icon">
              <MapPin size={17} />
              <input value={activeDashboard.location} readOnly />
            </span>
          </label>
          <label>
            Public queue link
            <input value={joinUrl} readOnly />
          </label>
        </section>
        <section className="settings-panel">
          <h2>Queue rules</h2>
          <div className="setting-row">
            <div>
              <strong>Auto-estimate wait time</strong>
              <span>Use 5 minutes per customer plus service buffer.</span>
            </div>
            <button className="toggle on" type="button" aria-label="Auto-estimate wait time enabled" />
          </div>
          <div className="setting-row">
            <div>
              <strong>Notify when next</strong>
              <span>Show a live prompt when the customer reaches rank 1.</span>
            </div>
            <button className="toggle on" type="button" aria-label="Notify when next enabled" />
          </div>
          <div className="setting-row">
            <div>
              <strong>Pause new check-ins</strong>
              <span>Temporarily stop customers from joining the line.</span>
            </div>
            <button className="toggle" type="button" aria-label="Pause new check-ins disabled" />
          </div>
        </section>
        <section className="settings-panel full">
          <h2>VIP booking subscriptions</h2>
          <div className="plan-grid">
            {(activeDashboard.vipPlans || []).map((plan) => (
              <div className="plan-card" key={plan.id}>
                <strong>{plan.name}</strong>
                <span>{plan.perk}</span>
                <b>{plan.price}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="settings-panel full">
          <h2>Customer message</h2>
          <label>
            Waiting suggestion
            <textarea value={`You're checked in at ${activeDashboard.name}. We'll update your rank here in real time.`} readOnly />
          </label>
        </section>
      </div>
    </section>
  );
}

function SignedOutView({ onReturn }) {
  return (
    <main className="signed-out-page">
      <section className="signed-out-card">
        <div className="mini-brand">Queue Jumper</div>
        <h1>Signed out</h1>
        <p>The owner dashboard is closed for this browser session. The customer queue preview can keep updating on scanned phones.</p>
        <button className="primary-button" type="button" onClick={onReturn}>
          Return to dashboard
          <ArrowRight size={20} />
        </button>
      </section>
    </main>
  );
}

function PhonePreview({ activeDashboard, queue, connected }) {
  const customer = queue[2] ?? queue[0];
  const rank = customer?.rank ?? 0;
  const wait = customer?.estimatedWait ?? 0;

  return (
    <aside className="phone-shell" aria-label="Customer live rank preview">
      <div className="phone">
        <div className="phone-status">
          <span>9:41</span>
          <span>5G</span>
        </div>
        <div className="phone-header">
          <h2>Your live rank</h2>
          <div className="live">
            <span className={connected ? "dot" : "dot offline"} />
            Live
          </div>
        </div>
        <section className="rank-card">
          <div>
            <span>Ticket</span>
            <strong>{customer?.ticket ?? "Done"}</strong>
          </div>
          <div>
            <span>Your rank</span>
            <strong>{rank || "-"}</strong>
          </div>
          <div>
            <span>Estimated wait</span>
            <strong>{wait ? `${wait} min` : "0 min"}</strong>
          </div>
        </section>
        <section className="timeline">
          <Step done label="Joined the queue" time="9:20 AM" />
          <Step done label="Checked in" time="9:24 AM" />
          <Step current label={rank <= 1 ? "You're up next" : `${rank} people ahead`} time="Live" note="We'll call your number soon" />
          <Step label="In the chair" />
          <Step label="All done" />
        </section>
        <section className="suggestion">
          <h3>While you wait</h3>
          <div className="coffee-card">
            <div className="coffee-art">
              <Coffee size={42} />
            </div>
            <div>
              <strong>{activeDashboard.id === "red-door" ? "Browse the market stalls" : "Grab coffee next door"}</strong>
              <span>{activeDashboard.id === "red-door" ? "Market Lane" : "Red Door Coffee"}</span>
              <small>2 min walk</small>
            </div>
            <ArrowRight size={19} />
          </div>
        </section>
        <nav className="phone-nav">
          <a className="active" href="#status"><Home size={20} />Status</a>
          <a href="#queue"><UsersRound size={20} />Queue</a>
          <a href="#info"><Info size={20} />Info</a>
        </nav>
      </div>
    </aside>
  );
}

function Step({ done, current, label, time, note }) {
  return (
    <div className={`step ${done ? "done" : ""} ${current ? "current" : ""}`}>
      <span className="step-mark">{done ? "✓" : current ? "3" : ""}</span>
      <div>
        <strong>{label}</strong>
        {note && <small>{note}</small>}
      </div>
      {time && <time>{time}</time>}
    </div>
  );
}

function CustomerJoinView({ activeDashboard, queue, connected }) {
  return (
    <main className="customer-page">
      <div className="join-panel">
        <div className="mini-brand">Queue Jumper</div>
        <h1>{activeDashboard.name}</h1>
        <p>You're checked in. Keep this page open and your rank updates the moment the owner advances the queue.</p>
        <PhonePreview activeDashboard={activeDashboard} queue={queue} connected={connected} />
        <a className="back-link" href="/">Owner dashboard</a>
      </div>
    </main>
  );
}

function App() {
  const isCustomerView = window.location.pathname.startsWith("/join");
  const initialDashboardId = isCustomerView ? shopIdFromPath() : "milos";
  const { dashboards, activeDashboard, serving, queue, completed, appointments, analytics, connected } = useQueueSocket(initialDashboardId);
  const activeSection = useActiveSection();
  const [signedOut, setSignedOut] = useState(false);
  const previewCustomer = queue[2] ?? queue[0];

  function handleDashboardChange(dashboardId) {
    socket.emit("dashboard:select", dashboardId);
  }

  if (isCustomerView) {
    return <CustomerJoinView activeDashboard={activeDashboard} queue={queue} connected={connected} />;
  }

  if (signedOut) {
    return <SignedOutView onReturn={() => setSignedOut(false)} />;
  }

  return (
    <div className="app-shell">
      <Sidebar activeSection={activeSection} />
      <main className="workspace">
        <ShopHeader
          activeDashboard={activeDashboard}
          connected={connected}
          dashboards={dashboards}
          onDashboardChange={handleDashboardChange}
          onSignOut={() => setSignedOut(true)}
        />
        {activeSection === "settings" ? (
          <SettingsPanel activeDashboard={activeDashboard} />
        ) : activeSection === "analytics" ? (
          <AnalyticsPanel analytics={analytics || {}} />
        ) : (
          <>
            <div className="content-grid">
              <section className="owner-work">
                <div className="summary-grid">
                  <CurrentCard serving={serving} />
                  <NextCard activeDashboard={activeDashboard} nextCustomer={queue[0]} />
                </div>
                <QueueTable queue={queue} activeDashboard={activeDashboard} />
                <NoShowPanel completed={completed} activeDashboard={activeDashboard} />
                <AppointmentPanel appointments={appointments} />
              </section>
              <QRCard activeDashboard={activeDashboard} customerTicket={previewCustomer?.ticket ?? "Done"} />
              <PhonePreview activeDashboard={activeDashboard} queue={queue} connected={connected} />
            </div>
            <button className="reset-button" type="button" onClick={() => socket.emit("owner:reset", activeDashboard.id)}>
              <RotateCcw size={16} />
              Reset demo queue
            </button>
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
