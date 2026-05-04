import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { io } from "socket.io-client";
import QRCode from "qrcode-terminal/vendor/QRCode";
import QRErrorCorrectLevel from "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel";

function getSocketUrl() {
  if (process.env.EXPO_PUBLIC_SOCKET_URL) {
    return process.env.EXPO_PUBLIC_SOCKET_URL;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.hostUri;
  const lanHost = hostUri?.split(":")[0];

  return lanHost ? `http://${lanHost}:3030` : "http://127.0.0.1:3030";
}

const socketUrl = getSocketUrl();
const ownerToken = process.env.EXPO_PUBLIC_OWNER_TOKEN || "queue-jumper-demo-owner-token";

function getCustomerBaseUrl() {
  if (process.env.EXPO_PUBLIC_CUSTOMER_BASE_URL) {
    return process.env.EXPO_PUBLIC_CUSTOMER_BASE_URL.replace(/\/$/, "");
  }

  return socketUrl.replace(/\/$/, "");
}

const customerBaseUrl = getCustomerBaseUrl();

const fallbackDashboards = [
  {
    id: "milos",
    slug: "milos-barbershop",
    name: "Milo's Barbershop",
    location: "18 Market Lane",
    serviceLabel: "Haircut",
    accent: "#22b157",
  },
];

const fallbackState = {
  dashboards: fallbackDashboards,
  activeDashboard: fallbackDashboards[0],
  serving: { ticket: "A15", name: "Alex Thompson", service: "Haircut" },
  queue: [],
  completed: [],
  updatedAt: new Date().toISOString(),
};

function useQueueSocket() {
  const [socketRef] = useState(() =>
    io(socketUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    }),
  );
  const [state, setState] = useState(fallbackState);
  const [connected, setConnected] = useState(socketRef.connected);

  useEffect(() => {
    const handleUpdate = (payload) => setState(payload);
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socketRef.on("queue:update", handleUpdate);
    socketRef.on("connect", handleConnect);
    socketRef.on("disconnect", handleDisconnect);
    return () => {
      socketRef.off("queue:update", handleUpdate);
      socketRef.off("connect", handleConnect);
      socketRef.off("disconnect", handleDisconnect);
      socketRef.disconnect();
    };
  }, [socketRef]);

  return { ...state, connected, socket: socketRef };
}

function QrGrid({ content, ticket }) {
  const qr = useMemo(() => {
    const code = new QRCode(-1, QRErrorCorrectLevel.M);
    code.addData(content);
    code.make();
    const size = code.getModuleCount();
    const quietZone = 4;
    const rows = [];

    for (let row = -quietZone; row < size + quietZone; row += 1) {
      const cells = [];
      for (let col = -quietZone; col < size + quietZone; col += 1) {
        const isQuietZone = row < 0 || col < 0 || row >= size || col >= size;
        cells.push(!isQuietZone && code.isDark(row, col));
      }
      rows.push(cells);
    }

    return rows;
  }, [content]);

  return (
    <View style={styles.qrBox}>
      <View>
        {qr.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.qrRow}>
            {row.map((active, cellIndex) => (
              <View key={cellIndex} style={[styles.qrCell, active && styles.qrCellActive]} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.qrTicketBadge}>
        <Text selectable style={styles.qrTicketText}>
          {ticket}
        </Text>
      </View>
    </View>
  );
}

function DashboardPicker({ dashboards, activeDashboard, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dashboardChips}>
      {dashboards.map((dashboard) => (
        <Pressable
          key={dashboard.id}
          onPress={() => onSelect(dashboard.id)}
          style={[
            styles.dashboardChip,
            dashboard.id === activeDashboard.id && { borderColor: dashboard.accent, backgroundColor: "#ffffff" },
          ]}
        >
          <View style={[styles.dashboardDot, { backgroundColor: dashboard.accent }]} />
          <View>
            <Text selectable style={styles.dashboardName}>
              {dashboard.name}
            </Text>
            <Text selectable style={styles.dashboardLocation}>
              {dashboard.location}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function SummaryCard({ label, ticket, name, service, accent }) {
  return (
    <View style={styles.summaryCard}>
      <Text selectable style={styles.cardLabel}>
        {label}
      </Text>
      <Text selectable style={[styles.bigTicket, { color: accent }]}>
        {ticket}
      </Text>
      <Text selectable style={styles.customerName}>
        {name}
      </Text>
      <Text selectable style={styles.serviceText}>
        {service}
      </Text>
    </View>
  );
}

function QueueRow({ item, index, accent }) {
  const initials = item.name
    .split(" ")
    .map((part) => part[0])
    .join("");

  return (
    <View style={styles.queueRow}>
      <View style={[styles.avatar, { backgroundColor: index === 0 ? accent : "#dcefed" }]}>
        <Text selectable style={styles.avatarText}>
          {initials}
        </Text>
      </View>
      <View style={styles.queueDetails}>
        <Text selectable style={styles.customerName}>
          {item.name}
        </Text>
        <Text selectable style={styles.serviceText}>
          {item.service}
        </Text>
      </View>
      <View style={styles.queueMeta}>
        <Text selectable style={styles.ticketText}>
          {item.ticket}
        </Text>
        <Text selectable style={styles.waitText}>
          {item.estimatedWait} min
        </Text>
      </View>
    </View>
  );
}

function CustomerPreview({ activeDashboard, queue, connected }) {
  const customer = queue[2] ?? queue[0];
  const rank = customer?.rank ?? 0;

  return (
    <View style={styles.phoneCard}>
      <View style={styles.phoneHeader}>
        <Text selectable style={styles.phoneTitle}>
          Your live rank
        </Text>
        <Text selectable style={[styles.liveText, { color: connected ? "#149542" : "#ff5848" }]}>
          {connected ? "Live" : "Offline"}
        </Text>
      </View>
      <View style={styles.rankGrid}>
        <View>
          <Text selectable style={styles.cardLabel}>
            Ticket
          </Text>
          <Text selectable style={styles.rankValue}>
            {customer?.ticket ?? "Done"}
          </Text>
        </View>
        <View>
          <Text selectable style={styles.cardLabel}>
            Rank
          </Text>
          <Text selectable style={styles.rankValue}>
            {rank || "-"}
          </Text>
        </View>
      </View>
      <Text selectable style={styles.previewCopy}>
        {rank <= 1 ? "You're up next. Stay nearby." : `${rank} people are ahead at ${activeDashboard.name}.`}
      </Text>
    </View>
  );
}

function CustomerAppView({ activeDashboard, queue, connected }) {
  const customer = queue[2] ?? queue[0];
  const rank = customer?.rank ?? 0;
  const estimatedWait = customer?.estimatedWait ?? 0;
  const ahead = Math.max(rank - 1, 0);
  const suggestion =
    activeDashboard.id === "red-door"
      ? { title: "Browse the market stalls", place: "Market Lane", time: "2 min walk" }
      : { title: "Grab coffee next door", place: "Red Door Coffee", time: "2 min walk" };

  return (
    <View style={styles.customerAppShell}>
      <View style={[styles.customerHero, { backgroundColor: activeDashboard.accent }]}>
        <View style={styles.customerHeroTop}>
          <View>
            <Text selectable style={styles.customerBrand}>
              Queue Jumper
            </Text>
            <Text selectable style={styles.customerShop}>
              {activeDashboard.name}
            </Text>
          </View>
          <Text selectable style={styles.customerLive}>
            {connected ? "Live" : "Offline"}
          </Text>
        </View>
        <Text selectable style={styles.customerHeroTitle}>
          You're checked in
        </Text>
        <Text selectable style={styles.customerHeroCopy}>
          Keep this open and your rank updates the moment the shop advances the line.
        </Text>
      </View>

      <View style={styles.customerRankCard}>
        <View style={styles.customerRankItem}>
          <Text selectable style={styles.cardLabel}>
            Ticket
          </Text>
          <Text selectable style={styles.customerRankValue}>
            {customer?.ticket ?? "Done"}
          </Text>
        </View>
        <View style={styles.customerRankItem}>
          <Text selectable style={styles.cardLabel}>
            Your rank
          </Text>
          <Text selectable style={styles.customerRankValue}>
            {rank || "-"}
          </Text>
        </View>
        <View style={styles.customerRankWide}>
          <Text selectable style={styles.cardLabel}>
            Estimated wait
          </Text>
          <Text selectable style={styles.customerWaitValue}>
            {estimatedWait ? `${estimatedWait} min` : "0 min"}
          </Text>
        </View>
      </View>

      <View style={styles.customerStatusCard}>
        <Text selectable style={styles.sectionTitle}>
          Status
        </Text>
        <View style={styles.customerStep}>
          <View style={[styles.customerStepMark, { backgroundColor: activeDashboard.accent }]} />
          <View style={styles.queueDetails}>
            <Text selectable style={styles.customerName}>
              Joined the queue
            </Text>
            <Text selectable style={styles.serviceText}>
              Checked in from the door QR
            </Text>
          </View>
        </View>
        <View style={styles.customerStep}>
          <View style={[styles.customerStepMark, { backgroundColor: rank <= 1 ? "#ff5848" : "#dce4ec" }]} />
          <View style={styles.queueDetails}>
            <Text selectable style={styles.customerName}>
              {rank <= 1 ? "You're up next" : `${ahead} ${ahead === 1 ? "person" : "people"} ahead`}
            </Text>
            <Text selectable style={styles.serviceText}>
              We'll call your ticket when it is time.
            </Text>
          </View>
        </View>
        <View style={styles.customerStep}>
          <View style={styles.customerStepMark} />
          <View style={styles.queueDetails}>
            <Text selectable style={styles.customerName}>
              Service starts
            </Text>
            <Text selectable style={styles.serviceText}>
              Show this ticket if the shop asks.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.customerSuggestion}>
        <Text selectable style={styles.sectionTitle}>
          While you wait
        </Text>
        <Text selectable style={styles.suggestionTitle}>
          {suggestion.title}
        </Text>
        <Text selectable style={styles.previewCopy}>
          {suggestion.place} - {suggestion.time}
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text selectable style={styles.sectionTitle}>
            Queue ahead
          </Text>
          <Text selectable style={styles.countText}>
            {ahead}
          </Text>
        </View>
        {queue.slice(0, Math.max(rank, 1)).map((item, index) => (
          <View key={item.ticket} style={styles.customerQueueMini}>
            <Text selectable style={styles.ticketText}>
              {item.ticket}
            </Text>
            <Text selectable style={styles.serviceText}>
              {index + 1 === rank ? "You" : index === 0 ? "Next" : "Waiting"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AuthScreen({ onAuthenticate }) {
  const [mode, setMode] = useState("signin");
  const [ownerName, setOwnerName] = useState("Milo");
  const [shopName, setShopName] = useState("Milo's Barbershop");
  const [email, setEmail] = useState("owner@queuejumper.test");
  const [password, setPassword] = useState("demo1234");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const isSignUp = mode === "signup";

  function submitAuth() {
    if (!email.trim() || !password.trim() || (isSignUp && (!ownerName.trim() || !shopName.trim()))) {
      Alert.alert("Missing details", "Please fill in the required fields to continue.");
      return;
    }

    onAuthenticate({
      ownerName: ownerName.trim() || "Owner",
      shopName: shopName.trim() || "Queue Jumper shop",
      email: email.trim(),
      ownerToken,
    });
  }

  if (showPrivacy) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.authScreen} contentContainerStyle={styles.authContent}>
        <View style={styles.authHero}>
          <Text selectable style={styles.brand}>
            Queue Jumper
          </Text>
          <Text selectable style={styles.authTitle}>
            Privacy Policy
          </Text>
          <Text selectable style={styles.authCopy}>
            Queue Jumper uses owner account details, shop details, ticket numbers, queue rank, estimated wait times, and realtime queue status to run the waiting list.
          </Text>
        </View>
        <View style={styles.authCard}>
          <Text selectable style={styles.sectionTitle}>
            Customer privacy
          </Text>
          <Text selectable style={styles.previewCopy}>
            Public customer pages show ticket numbers, live rank, and estimated wait. Customer names are kept inside the owner dashboard and are not shown publicly.
          </Text>
          <Text selectable style={styles.sectionTitle}>
            Data use
          </Text>
          <Text selectable style={styles.previewCopy}>
            Data is used for queue management and live notifications only. This prototype does not sell personal data.
          </Text>
          <Pressable onPress={() => setShowPrivacy(false)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.authScreen}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={styles.authScreen}
        contentContainerStyle={styles.authContent}
      >
        <View style={styles.authHero}>
          <Text selectable style={styles.brand}>
            Queue Jumper
          </Text>
          <Text selectable style={styles.authTitle}>
            {isSignUp ? "Create your shop dashboard" : "Welcome back"}
          </Text>
          <Text selectable style={styles.authCopy}>
            {isSignUp
              ? "Set up a live queue dashboard customers can follow from their phone."
              : "Sign in to manage live ranks, QR links, and the next customer."}
          </Text>
        </View>

        <View style={styles.authCard}>
          <View style={styles.authTabs}>
            <Pressable onPress={() => setMode("signin")} style={[styles.authTab, !isSignUp && styles.authTabActive]}>
              <Text style={[styles.authTabText, !isSignUp && styles.authTabTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable onPress={() => setMode("signup")} style={[styles.authTab, isSignUp && styles.authTabActive]}>
              <Text style={[styles.authTabText, isSignUp && styles.authTabTextActive]}>Sign up</Text>
            </Pressable>
          </View>

          {isSignUp && (
            <>
              <Text selectable style={styles.inputLabel}>
                Owner name
              </Text>
              <TextInput value={ownerName} onChangeText={setOwnerName} autoCapitalize="words" returnKeyType="next" style={styles.input} />
              <Text selectable style={styles.inputLabel}>
                Shop name
              </Text>
              <TextInput value={shopName} onChangeText={setShopName} autoCapitalize="words" returnKeyType="next" style={styles.input} />
            </>
          )}

          <Text selectable style={styles.inputLabel}>
            Email
          </Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" returnKeyType="next" style={styles.input} />
          <Text selectable style={styles.inputLabel}>
            Password
          </Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry returnKeyType="done" onSubmitEditing={submitAuth} style={styles.input} />

          <Pressable onPress={submitAuth} style={styles.authButton}>
            <Text style={styles.primaryButtonText}>{isSignUp ? "Create account" : "Sign in"}</Text>
          </Pressable>
        <Text selectable style={styles.authNote}>
          Demo auth uses an owner token. Use a private token in production and connect real accounts before release.
        </Text>
        <Pressable onPress={() => setShowPrivacy(true)} style={styles.textButton}>
          <Text style={styles.textButtonText}>Privacy Policy</Text>
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function QueueJumperApp() {
  const { dashboards, activeDashboard, serving, queue, connected, socket } = useQueueSocket();
  const [section, setSection] = useState("queue");
  const [session, setSession] = useState(null);
  const nextCustomer = queue[0];
  const previewCustomer = queue[2] ?? queue[0];
  const joinUrl = `${customerBaseUrl}/join/${activeDashboard.slug}`;

  function selectDashboard(dashboardId) {
    socket.emit("dashboard:select", dashboardId);
  }

  useEffect(() => {
    if (!session) return;

    const handleOwnerError = (message) => Alert.alert("Owner access", message);
    socket.on("owner:error", handleOwnerError);
    socket.emit("owner:auth", session.ownerToken);

    return () => {
      socket.off("owner:error", handleOwnerError);
    };
  }, [session, socket]);

  function shareQrLink() {
    Share.share({
      title: `${activeDashboard.name} queue link`,
      message: `${activeDashboard.name} live queue: ${joinUrl}`,
    });
  }

  function signOut() {
    setSession(null);
    setSection("queue");
  }

  if (!session) {
    return <AuthScreen onAuthenticate={setSession} />;
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text selectable style={styles.brand}>
            Queue Jumper
          </Text>
          <Text selectable style={styles.socketHint}>
            {session.ownerName} · Socket: {socketUrl.replace("http://", "")}
          </Text>
        </View>
        <Pressable onPress={signOut} style={styles.iconButton}>
          <Text style={styles.iconText}>Exit</Text>
        </Pressable>
      </View>

      <DashboardPicker dashboards={dashboards} activeDashboard={activeDashboard} onSelect={selectDashboard} />

      <View style={styles.navTabs}>
        {["queue", "qr", "customer", "settings"].map((item) => (
          <Pressable key={item} onPress={() => setSection(item)} style={[styles.navTab, section === item && styles.navTabActive]}>
            <Text style={[styles.navTabText, section === item && { color: activeDashboard.accent }]}>{item.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      {section === "customer" ? (
        <CustomerAppView activeDashboard={activeDashboard} queue={queue} connected={connected} />
      ) : section === "settings" ? (
        <View style={styles.panel}>
          <Text selectable style={styles.sectionTitle}>
            Settings
          </Text>
          <TextInput editable={false} value={activeDashboard.name} style={styles.input} />
          <TextInput editable={false} value={activeDashboard.location} style={styles.input} />
          <TextInput editable={false} value={joinUrl} style={styles.input} />
          <Text selectable style={styles.previewCopy}>
            Customers see realtime rank changes as soon as the owner taps Next customer.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard label="Currently serving" ticket={serving.ticket} name={serving.name} service={serving.service} accent={activeDashboard.accent} />
            <SummaryCard
              label="Next customer"
              ticket={nextCustomer?.ticket ?? "Done"}
              name={nextCustomer?.name ?? "Queue clear"}
              service={nextCustomer?.service ?? "No one is waiting"}
              accent="#ff5848"
            />
          </View>

          {section === "qr" && (
            <View style={styles.panel}>
              <Text selectable style={styles.sectionTitle}>
                Door QR code
              </Text>
              <Text selectable style={styles.previewCopy}>
                Customers scan to join {activeDashboard.name}.
              </Text>
              <QrGrid content={joinUrl} ticket={previewCustomer?.ticket ?? "Done"} />
              <Text selectable style={styles.qrLink}>
                {joinUrl}
              </Text>
              <Pressable onPress={shareQrLink} style={[styles.primaryButton, { backgroundColor: activeDashboard.accent }]}>
                <Text style={styles.primaryButtonText}>Share QR link</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              disabled={!nextCustomer}
              onPress={() => socket.emit("owner:next", activeDashboard.id)}
              style={[styles.primaryButton, !nextCustomer && styles.disabledButton]}
            >
              <Text style={styles.primaryButtonText}>Next customer</Text>
            </Pressable>
            <Pressable onPress={() => socket.emit("owner:reset", activeDashboard.id)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Reset queue</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text selectable style={styles.sectionTitle}>
                Waiting list
              </Text>
              <Text selectable style={styles.countText}>
                {queue.length}
              </Text>
            </View>
            <FlatList
              scrollEnabled={false}
              data={queue}
              keyExtractor={(item) => item.ticket}
              renderItem={({ item, index }) => <QueueRow item={item} index={index} accent={activeDashboard.accent} />}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>

          <CustomerPreview activeDashboard={activeDashboard} queue={queue} connected={connected} />
        </>
      )}

      {!connected && (
        <Text selectable style={styles.offlineNotice}>
          Expo Go is not connected yet. For a physical phone, set EXPO_PUBLIC_SOCKET_URL to your computer LAN address, for example http://192.168.1.25:3030.
        </Text>
      )}
      <Text selectable style={styles.runtimeText}>
        Running in Expo {Constants.expoConfig?.version ?? "dev"}
      </Text>
    </ScrollView>
  );
}

const styles = {
  authScreen: {
    flex: 1,
    backgroundColor: "#f6f8f4",
  },
  authContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    padding: 20,
    paddingTop: 54,
    paddingBottom: 140,
    gap: 22,
  },
  authHero: {
    gap: 10,
  },
  authTitle: {
    color: "#151922",
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
  },
  authCopy: {
    color: "#657187",
    fontSize: 16,
    lineHeight: 23,
  },
  authCard: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e7ef",
    padding: 16,
    gap: 10,
  },
  authTabs: {
    flexDirection: "row",
    backgroundColor: "#edf2f0",
    borderRadius: 8,
    padding: 4,
    marginBottom: 6,
  },
  authTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  authTabActive: {
    backgroundColor: "#ffffff",
  },
  authTabText: {
    color: "#697386",
    fontWeight: "900",
  },
  authTabTextActive: {
    color: "#149542",
  },
  inputLabel: {
    color: "#4f5d73",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  authButton: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: "#ff5848",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  authNote: {
    color: "#7a8596",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  textButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonText: {
    color: "#149542",
    fontWeight: "900",
  },
  customerAppShell: {
    gap: 14,
  },
  customerHero: {
    borderRadius: 8,
    padding: 18,
    gap: 18,
  },
  customerHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  customerBrand: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 16,
  },
  customerShop: {
    color: "rgba(255,255,255,0.82)",
    marginTop: 3,
    fontWeight: "700",
  },
  customerLive: {
    color: "#ffffff",
    fontWeight: "900",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  customerHeroTitle: {
    color: "#ffffff",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
  },
  customerHeroCopy: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 15,
    lineHeight: 22,
  },
  customerRankCard: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e7ef",
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  customerRankItem: {
    flex: 1,
    minWidth: 120,
    borderRadius: 8,
    backgroundColor: "#f8fafb",
    padding: 14,
  },
  customerRankWide: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#fff5f3",
    padding: 14,
  },
  customerRankValue: {
    color: "#ff5848",
    fontSize: 42,
    fontWeight: "900",
    marginTop: 4,
  },
  customerWaitValue: {
    color: "#151922",
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
  },
  customerStatusCard: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e7ef",
    padding: 16,
    gap: 14,
  },
  customerStep: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  customerStepMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dce4ec",
    marginTop: 2,
  },
  customerSuggestion: {
    borderRadius: 8,
    backgroundColor: "#101820",
    padding: 16,
    gap: 8,
  },
  suggestionTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  customerQueueMini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    paddingVertical: 10,
  },
  screen: {
    flex: 1,
    backgroundColor: "#f6f8f4",
  },
  content: {
    padding: 18,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: {
    color: "#149542",
    fontSize: 30,
    fontWeight: "900",
  },
  socketHint: {
    color: "#697386",
    marginTop: 4,
    fontSize: 12,
  },
  iconButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#101820",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  dashboardChips: {
    gap: 10,
    paddingRight: 18,
  },
  dashboardChip: {
    minWidth: 210,
    borderWidth: 1,
    borderColor: "#e0e7ef",
    backgroundColor: "#eef3f1",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dashboardDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dashboardName: {
    fontWeight: "800",
    color: "#151922",
  },
  dashboardLocation: {
    color: "#697386",
    fontSize: 12,
    marginTop: 3,
  },
  navTabs: {
    flexDirection: "row",
    backgroundColor: "#e9eef1",
    borderRadius: 8,
    padding: 4,
  },
  navTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  navTabActive: {
    backgroundColor: "#ffffff",
  },
  navTabText: {
    color: "#5d687a",
    fontWeight: "900",
    fontSize: 12,
  },
  summaryGrid: {
    gap: 12,
  },
  summaryCard: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e7ef",
    padding: 18,
    gap: 5,
  },
  cardLabel: {
    color: "#697386",
    fontSize: 13,
    fontWeight: "700",
  },
  bigTicket: {
    fontSize: 54,
    fontWeight: "900",
  },
  customerName: {
    color: "#151922",
    fontSize: 16,
    fontWeight: "800",
  },
  serviceText: {
    color: "#697386",
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: "#ff5848",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  disabledButton: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce4ec",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#151922",
    fontWeight: "800",
  },
  panel: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e7ef",
    padding: 16,
    gap: 14,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#151922",
    fontSize: 20,
    fontWeight: "900",
  },
  countText: {
    color: "#697386",
    fontWeight: "800",
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#101820",
    fontWeight: "900",
  },
  queueDetails: {
    flex: 1,
  },
  queueMeta: {
    alignItems: "flex-end",
  },
  ticketText: {
    color: "#151922",
    fontWeight: "900",
  },
  waitText: {
    color: "#149542",
    fontWeight: "800",
    marginTop: 3,
  },
  separator: {
    height: 1,
    backgroundColor: "#edf1f5",
  },
  qrBox: {
    alignSelf: "center",
    minWidth: 232,
    minHeight: 232,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#7bd89b",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  qrRow: {
    flexDirection: "row",
  },
  qrCell: {
    width: 5,
    height: 5,
    backgroundColor: "#ffffff",
  },
  qrCellActive: {
    backgroundColor: "#101820",
  },
  qrTicketBadge: {
    marginTop: 10,
    minWidth: 62,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#7bd89b",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  qrTicketText: {
    color: "#149542",
    fontSize: 17,
    fontWeight: "900",
  },
  qrLink: {
    color: "#151922",
    textAlign: "center",
    fontWeight: "800",
  },
  phoneCard: {
    borderRadius: 8,
    backgroundColor: "#101820",
    padding: 18,
    gap: 14,
  },
  phoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  phoneTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
  },
  liveText: {
    fontWeight: "900",
  },
  rankGrid: {
    flexDirection: "row",
    gap: 12,
  },
  rankValue: {
    color: "#ff5848",
    fontSize: 42,
    fontWeight: "900",
  },
  previewCopy: {
    color: "#697386",
    lineHeight: 21,
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce4ec",
    color: "#151922",
    paddingHorizontal: 12,
    backgroundColor: "#fbfdff",
  },
  offlineNotice: {
    color: "#a34739",
    backgroundColor: "#fff0ed",
    borderRadius: 8,
    padding: 12,
    lineHeight: 20,
  },
  runtimeText: {
    color: "#8a95a6",
    textAlign: "center",
    fontSize: 12,
  },
};
