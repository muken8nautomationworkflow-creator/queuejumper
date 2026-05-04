# Queue Jumper

Realtime queue check-in for local shops. Owners manage the line from an Expo app, customers scan a QR link and watch their live rank update from the browser.

## Production Pieces

- Expo owner app configured for Android Play Store builds.
- Railway Node/Express backend with Socket.io.
- Public customer check-in page at `/join/:shop`.
- Privacy policy at `/privacy`.
- Health endpoint at `/health`.
- Database health endpoint at `/health/db`.
- Owner queue actions protected by `QUEUE_JUMPER_OWNER_TOKEN`.
- Public customer pages hide customer names.
- Join endpoint has lightweight rate limiting.
- Postgres persistence through `DATABASE_URL`, with JSON file fallback for local testing.
- Customer phone capture for SMS/WhatsApp return alerts.
- Owner Notify button, analytics screen, printable QR poster, and per-service queue filters.
- VIP booking subscription plans with VIP-first queue priority.
- No-show customers can rejoin directly after the next waiting ticket.
- Duplicate active check-ins are blocked by customer name or phone number.

## Railway Environment

Set these variables in Railway before using the production app:

```env
NODE_ENV=production
QUEUE_JUMPER_OWNER_TOKEN=qj_owner_8f3b2c9e7a6d4f1b90c2_private
DATABASE_URL=postgresql://user:password@host:5432/railway
REQUIRE_DATABASE=true
ALLOWED_ORIGINS=https://queuejumper-production.up.railway.app
JOIN_RATE_WINDOW_MS=60000
JOIN_RATE_LIMIT=8
NOTIFICATION_PROVIDER=mock
```

To add the Railway database:

1. Open the Railway project.
2. Click **New**.
3. Choose **Database** then **PostgreSQL**.
4. Open the Queue Jumper service variables and confirm `DATABASE_URL` is available from the Postgres service.
5. Redeploy the service.

The deployed backend should answer:

```text
https://queuejumper-production.up.railway.app/
https://queuejumper-production.up.railway.app/health
https://queuejumper-production.up.railway.app/health/db
https://queuejumper-production.up.railway.app/privacy
https://queuejumper-production.up.railway.app/join/milos-barbershop
```

`/health/db` should return `storage: "postgres"` and `database: "connected"` after Railway Postgres is connected.

`NOTIFICATION_PROVIDER=mock` logs customer notifications without sending real messages.

To use FCM push notifications, set:

```env
NOTIFICATION_PROVIDER=fcm
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-firebase-project","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"firebase-adminsdk-...@your-project.iam.gserviceaccount.com"}
```

FCM needs a device or browser push token from the customer device. A phone number alone cannot receive FCM; use Twilio or WhatsApp Business for phone-number messages.

## EAS Android Build

Production EAS profile in `eas.json` points to:

```env
EXPO_PUBLIC_SOCKET_URL=https://queuejumper-production.up.railway.app
EXPO_PUBLIC_CUSTOMER_BASE_URL=https://queuejumper-production.up.railway.app
EXPO_PUBLIC_OWNER_TOKEN=qj_owner_8f3b2c9e7a6d4f1b90c2_private
```

Build for Play Store:

```bash
npx eas-cli@latest build -p android --profile production
```

Build installable APK for direct testing:

```bash
npx eas-cli@latest build -p android --profile preview
```

## Google Play Checklist

- Upload the production `.aab`.
- Use privacy policy URL: `https://queuejumper-production.up.railway.app/privacy`.
- Complete Data Safety: app handles owner email/name, shop details, queue tickets, queue status, and optional customer nickname/service.
- Add screenshots from the owner dashboard, QR screen, customer screen, and sign-in screen.
- Add app icon, feature graphic, short description, and full description in Play Console.
- Start with Internal testing before production.

## Remaining True Production Upgrades

The app is suitable for internal testing and controlled pilots. For a public business launch, add:

- Real owner authentication such as Supabase, Firebase, or Auth0.
- Push/SMS notifications through FCM, Twilio, or WhatsApp Business.
- Per-shop ownership and role-based access.
- Audit logs and data deletion/export workflows.
