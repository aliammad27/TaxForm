/**
 * Email notifications (Phase 8): filing-deadline and hearing reminders plus
 * assessment-change alerts, sent through Resend and deduped via the
 * notifications table. Jobs are invoked by the /api/jobs/* cron routes.
 */
import { getPool } from "./db";

const RESEND_URL = "https://api.resend.com/emails";
const FROM = process.env.EMAIL_FROM ?? "TaxForm <notifications@taxform.app>";

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isResendConfigured()) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [params.to], subject: params.subject, text: params.text }),
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
  return { ok: true };
}

/**
 * Inserts the notification if its dedupe key is new, then sends it. Returns
 * true when an email was actually sent.
 */
async function notifyOnce(n: {
  clientId: string;
  appealId?: string | null;
  parid?: string | null;
  kind: "deadline_reminder" | "hearing_reminder" | "assessment_change";
  dedupeKey: string;
  email: string;
  subject: string;
  body: string;
}): Promise<boolean> {
  const pool = getPool();
  // Upserting on the dedupe key keeps one row per occasion while letting
  // failed sends (e.g. Resend not yet configured) retry on the next run.
  const { rows } = await pool.query<{ id: string; sent_at: string | null }>(
    `insert into notifications (client_id, appeal_id, parid, kind, dedupe_key, subject, body)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (dedupe_key) do update set dedupe_key = excluded.dedupe_key
     returning id, sent_at`,
    [n.clientId, n.appealId ?? null, n.parid ?? null, n.kind, n.dedupeKey, n.subject, n.body]
  );
  if (rows[0].sent_at) return false; // already sent for this occasion

  const result = await sendEmail({ to: n.email, subject: n.subject, text: n.body });
  await pool.query(
    `update notifications set sent_at = case when $2 then now() end, send_error = $3
     where id = $1`,
    [rows[0].id, result.ok, result.error ?? null]
  );
  return result.ok;
}

const SIGNOFF =
  "\n\n— TaxForm\nManage your appeals: " +
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") +
  "/dashboard/appeals";

/**
 * Deadline reminders at 14 and 3 days out for unfiled appeals, hearing
 * reminders 7 days out. Returns counts for the cron response.
 */
export async function runReminderJob(): Promise<{ deadline: number; hearing: number }> {
  const pool = getPool();
  let deadline = 0;
  let hearing = 0;

  const { rows: unfiled } = await pool.query<{
    id: string;
    client_id: string;
    parid: string;
    tax_year: number;
    filing_deadline: string;
    days_left: number;
    email: string;
    address: string | null;
    county: string;
  }>(
    `select a.id, a.client_id, a.parid, a.tax_year,
            a.filing_deadline::text as filing_deadline,
            (a.filing_deadline - current_date)::int as days_left,
            c.email, p.full_address as address, p.county
     from appeals a
     join clients c on c.id = a.client_id
     join parcels p on p.parid = a.parid
     where a.status in ('draft', 'ready_to_file')
       and a.filing_deadline between current_date and current_date + 14`
  );
  for (const a of unfiled) {
    const bucket = a.days_left <= 3 ? "3d" : "14d";
    const sent = await notifyOnce({
      clientId: a.client_id,
      appealId: a.id,
      parid: a.parid,
      kind: "deadline_reminder",
      dedupeKey: `deadline_reminder:${a.id}:${a.filing_deadline}:${bucket}`,
      email: a.email,
      subject: `${a.days_left} day${a.days_left === 1 ? "" : "s"} left to file your ${a.county} County appeal`,
      body:
        `Your tax year ${a.tax_year} assessment appeal for ${a.address ?? a.parid} ` +
        `hasn't been filed yet. ${a.county} County's filing deadline is ${a.filing_deadline} — ` +
        `${a.days_left} day${a.days_left === 1 ? "" : "s"} away.\n\n` +
        `Generate your evidence package and file before the deadline; late appeals wait a full year.` +
        SIGNOFF,
    });
    if (sent) deadline++;
  }

  const { rows: hearings } = await pool.query<{
    id: string;
    client_id: string;
    parid: string;
    hearing_date: string;
    email: string;
    address: string | null;
    county: string;
  }>(
    `select a.id, a.client_id, a.parid, a.hearing_date::text as hearing_date,
            c.email, p.full_address as address, p.county
     from appeals a
     join clients c on c.id = a.client_id
     join parcels p on p.parid = a.parid
     where a.hearing_date between current_date and current_date + 7
       and a.status not in ('decided', 'withdrawn')`
  );
  for (const a of hearings) {
    const sent = await notifyOnce({
      clientId: a.client_id,
      appealId: a.id,
      parid: a.parid,
      kind: "hearing_reminder",
      dedupeKey: `hearing_reminder:${a.id}:${a.hearing_date}`,
      email: a.email,
      subject: `Hearing ${a.hearing_date}: ${a.address ?? a.parid}`,
      body:
        `Your assessment appeal hearing for ${a.address ?? a.parid} (${a.county} County) ` +
        `is scheduled for ${a.hearing_date}.\n\n` +
        `Bring your evidence package — the comparable sales and Common Level Ratio math ` +
        `are the core of your case.` +
        SIGNOFF,
    });
    if (sent) hearing++;
  }

  return { deadline, hearing };
}

/**
 * Assessment-change watcher on tracked parcels: the first run snapshots a
 * baseline silently; later runs alert the owner when the county's assessed
 * total moves (reassessment, appeal decision, interim revision).
 */
export async function runAssessmentWatch(): Promise<{ baselined: number; changed: number }> {
  const pool = getPool();

  const { rowCount: baselined } = await pool.query(
    `update client_properties cp
     set last_known_assessed = p.county_total
     from parcels p
     where p.parid = cp.parid and cp.last_known_assessed is null
       and p.county_total is not null`
  );

  const { rows: changes } = await pool.query<{
    id: string;
    client_id: string;
    parid: string;
    email: string;
    address: string | null;
    county: string;
    old_total: number;
    new_total: number;
  }>(
    `select cp.id, cp.client_id, cp.parid, c.email,
            p.full_address as address, p.county,
            cp.last_known_assessed::float8 as old_total,
            p.county_total::float8 as new_total
     from client_properties cp
     join parcels p on p.parid = cp.parid
     join clients c on c.id = cp.client_id
     where cp.last_known_assessed is not null
       and p.county_total is not null
       and p.county_total <> cp.last_known_assessed`
  );

  let changed = 0;
  for (const ch of changes) {
    const direction = ch.new_total > ch.old_total ? "increased" : "decreased";
    await notifyOnce({
      clientId: ch.client_id,
      parid: ch.parid,
      kind: "assessment_change",
      dedupeKey: `assessment_change:${ch.id}:${ch.new_total}`,
      email: ch.email,
      subject: `Assessment ${direction}: ${ch.address ?? ch.parid}`,
      body:
        `The assessed value of ${ch.address ?? ch.parid} (${ch.county} County) changed from ` +
        `$${Math.round(ch.old_total).toLocaleString()} to $${Math.round(ch.new_total).toLocaleString()}.\n\n` +
        (ch.new_total > ch.old_total
          ? `An increase can be worth appealing — check your updated savings score.`
          : `If this reflects your appeal decision, congratulations. Verify it matches the board's order.`) +
        SIGNOFF,
    });
    await pool.query(
      `update client_properties
       set last_known_assessed = $2, assessed_changed_at = now()
       where id = $1`,
      [ch.id, ch.new_total]
    );
    changed++;
  }

  return { baselined: baselined ?? 0, changed };
}
