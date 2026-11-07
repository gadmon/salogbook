// Supabase Edge Function: send-currency-alerts
//
// Runs once a day (see the schedule at the bottom of push_alerts.sql). For every pilot who turned on push
// alerts it finds requirements lapsing within 14 days and sends ONE notification listing them. Each warning
// band (14, 7, 1 and 0 days) is sent once per requirement and lapse date.
//
// Setup (one time):
//   1. Run push_alerts.sql in the SQL editor.
//   2. Set the secrets (dashboard: Edge Functions -> Secrets, or the CLI):
//        supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<any long random text> --project-ref vxjkegfpwpuiolgzchkm
//      VAPID_PUBLIC_KEY must be the same value as PUSH_VAPID_PUBLIC in index.html.
//   3. Deploy WITHOUT JWT verification (the cron call authenticates with CRON_SECRET instead):
//        supabase functions deploy send-currency-alerts --no-verify-jwt --project-ref vxjkegfpwpuiolgzchkm
//      In the dashboard: create the function, paste this file and switch "Verify JWT" off.
//   4. Run the schedule block at the bottom of push_alerts.sql (with your CRON_SECRET in it).
//   Test it by hand:  curl -X POST https://vxjkegfpwpuiolgzchkm.supabase.co/functions/v1/send-currency-alerts -H "x-cron-secret: <CRON_SECRET>"

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const BANDS = [14, 7, 1, 0];          // days before the lapse date
const TZ = "Africa/Johannesburg";

const ymdInTz = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayNum = (ymd: string) => Math.round(Date.parse(ymd + "T00:00:00Z") / 86400000);

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("Forbidden", { status: 403 });

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return new Response("VAPID keys are not set", { status: 500 });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const today = dayNum(ymdInTz(new Date()));
  const horizon = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  const { data: lapses, error } = await db.from("currency_lapses").select("user_id, rule_id, label, lapse_date").lte("lapse_date", horizon);
  if (error) return new Response(error.message, { status: 500 });

  // What is due, per pilot: the smallest band that covers the days left, if not yet sent.
  const due = new Map<string, { rule_id: string; label: string; lapse_date: string; band: number; left: number }[]>();
  const { data: sent } = await db.from("push_sent").select("user_id, rule_id, lapse_date, band");
  const done = new Set((sent || []).map((s) => `${s.user_id}|${s.rule_id}|${s.lapse_date}|${s.band}`));
  for (const l of lapses || []) {
    const left = dayNum(l.lapse_date) - today;
    if (left < 0 || left > 14) continue;
    const band = BANDS.slice().reverse().find((b) => left <= b)!;      // smallest band that still covers it
    if (done.has(`${l.user_id}|${l.rule_id}|${l.lapse_date}|${band}`)) continue;
    if (!due.has(l.user_id)) due.set(l.user_id, []);
    due.get(l.user_id)!.push({ rule_id: l.rule_id, label: l.label, lapse_date: l.lapse_date, band, left });
  }

  let pilots = 0, pushes = 0, removed = 0;
  for (const [uid, items] of due) {
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", uid);
    if (!subs || !subs.length) continue;
    items.sort((a, b) => a.left - b.left);
    const text = items.slice(0, 4).map((i) => i.left === 0 ? `${i.label} lapses TODAY` : `${i.label} lapses in ${i.left} day${i.left === 1 ? "" : "s"}`).join("; ")
      + (items.length > 4 ? ` +${items.length - 4} more` : "");
    const payload = JSON.stringify({ title: "SALOGBOOK currency", body: text, tag: "salogbook-currency", url: "/salogbook/" });
    let delivered = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        delivered = true; pushes++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { await db.from("push_subscriptions").delete().eq("id", s.id); removed++; }   // phone unsubscribed
      }
    }
    if (delivered) {
      pilots++;
      await db.from("push_sent").upsert(items.map((i) => ({ user_id: uid, rule_id: i.rule_id, lapse_date: i.lapse_date, band: i.band })));
    }
  }
  // tidy: forget sent-records for lapse dates long gone
  await db.from("push_sent").delete().lt("lapse_date", new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10));
  return new Response(JSON.stringify({ pilots, pushes, removed, due: [...due.values()].reduce((a, b) => a + b.length, 0) }), { headers: { "Content-Type": "application/json" } });
});
