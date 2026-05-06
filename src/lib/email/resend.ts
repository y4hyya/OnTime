import { Resend } from "resend";
import {
  CANCELLED_TIER_INDEX,
  TIER_MULTIPLIERS,
  tierLabel,
} from "@/lib/ai/tiers";

let client: Resend | null = null;

function getResend(): Resend {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  client = new Resend(apiKey);
  return client;
}

const FROM = "OnTime <onboarding@resend.dev>";

export type PolicyCreatedEmailInput = {
  to: string;
  iata: string;
  origin: string;
  destination: string;
  scheduledDepAt: Date;
  premiumCents: number;
  policyUrl: string;
};

export async function sendPolicyCreatedEmail(
  input: PolicyCreatedEmailInput,
): Promise<void> {
  const html = renderPolicyCreatedEmail(input);
  const result = await getResend().emails.send({
    from: FROM,
    to: input.to,
    subject: `Your OnTime policy for ${input.iata} is active`,
    html,
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
}

function renderPolicyCreatedEmail(i: PolicyCreatedEmailInput): string {
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  const dep = i.scheduledDepAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
    timeZoneName: "short",
  });

  const tierRows = TIER_MULTIPLIERS.map((tier) => {
    const label = escape(tierLabel(tier));
    const payout = escape(dollars(i.premiumCents * tier.multiplier));
    return `<tr><td style="padding:8px 0;color:#737373;border-bottom:1px solid #f0f0f0;">${label}</td><td style="padding:8px 0;text-align:right;font-weight:500;border-bottom:1px solid #f0f0f0;">$${payout}</td></tr>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Your OnTime policy is active</title>
</head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e5e5e5;border-radius:8px;">
<tr><td style="padding:32px;">
<div style="font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#737373;margin-bottom:8px;">OnTime</div>
<h1 style="margin:0 0 24px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Policy active</h1>

<div style="font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Flight</div>
<div style="font-size:15px;font-weight:500;">${escape(i.iata)} &middot; ${escape(i.origin)} &rarr; ${escape(i.destination)}</div>
<div style="font-size:13px;color:#737373;margin-top:2px;">${escape(dep)}</div>

<div style="font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 4px;">Premium paid</div>
<div style="font-size:24px;font-weight:600;letter-spacing:-0.01em;">$${escape(dollars(i.premiumCents))}</div>

<div style="font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 8px;">Payouts if delayed</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;border-top:1px solid #f0f0f0;">
${tierRows}
</table>

<p style="margin:24px 0 0;font-size:13px;color:#737373;line-height:1.5;">We&rsquo;ll watch the flight from departure. Payouts trigger automatically the moment a tier crosses.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
<tr><td style="border-radius:6px;background:#0a0a0a;">
<a href="${escape(i.policyUrl)}" style="display:inline-block;padding:10px 16px;color:#fff;text-decoration:none;font-size:14px;font-weight:500;">View policy</a>
</td></tr>
</table>
</td></tr>
</table>
<div style="font-size:11px;color:#a3a3a3;margin-top:16px;max-width:480px;">OnTime &middot; simulated MVP, not yet a licensed insurance product &middot; T-2h purchase cutoff applies</div>
</td></tr>
</table>
</body>
</html>`;
}

export type PolicyClaimableEmailInput = {
  to: string;
  iata: string;
  origin: string;
  destination: string;
  scheduledDepAt: Date;
  tierIndex: number;
  delayMinutes: number | null;
  payoutCents: number;
  policyUrl: string;
};

export async function sendPolicyClaimableEmail(
  input: PolicyClaimableEmailInput,
): Promise<void> {
  const cancelled = input.tierIndex === CANCELLED_TIER_INDEX;
  const subject = cancelled
    ? `${input.iata} cancelled — full payout ready`
    : `${input.iata} is delayed — your payout is ready`;
  const html = renderPolicyClaimableEmail(input);
  const result = await getResend().emails.send({
    from: FROM,
    to: input.to,
    subject,
    html,
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
}

function renderPolicyClaimableEmail(i: PolicyClaimableEmailInput): string {
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  const dep = i.scheduledDepAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
    timeZoneName: "short",
  });

  const cancelled = i.tierIndex === CANCELLED_TIER_INDEX;
  const tier = TIER_MULTIPLIERS[i.tierIndex];
  const headline = cancelled ? "Flight cancelled" : "Flight delayed";
  const statusLine = cancelled
    ? "Cancelled"
    : i.delayMinutes !== null
      ? `Delayed ${i.delayMinutes} min`
      : "Delayed";
  const tierLine = tier
    ? `${escape(tierLabel(tier))} tier · ${tier.multiplier}× payout`
    : "Tier triggered";

  const followUp = cancelled
    ? "Tap below to view your policy and claim the payout."
    : "We&rsquo;ll keep watching — if the delay extends to a higher tier, your payout grows automatically.";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escape(headline)}</title>
</head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e5e5e5;border-radius:8px;">
<tr><td style="padding:32px;">
<div style="font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#737373;margin-bottom:8px;">OnTime</div>
<h1 style="margin:0 0 24px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">${escape(headline)}</h1>

<div style="font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Flight</div>
<div style="font-size:15px;font-weight:500;">${escape(i.iata)} &middot; ${escape(i.origin)} &rarr; ${escape(i.destination)}</div>
<div style="font-size:13px;color:#737373;margin-top:2px;">${escape(dep)}</div>

<div style="font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 4px;">Status</div>
<div style="font-size:15px;font-weight:500;">${escape(statusLine)}</div>
<div style="font-size:13px;color:#737373;margin-top:2px;">${tierLine}</div>

<div style="font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 4px;">Payout ready</div>
<div style="font-size:32px;font-weight:600;letter-spacing:-0.01em;">$${escape(dollars(i.payoutCents))}</div>

<p style="margin:24px 0 0;font-size:13px;color:#737373;line-height:1.5;">${followUp}</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
<tr><td style="border-radius:6px;background:#0a0a0a;">
<a href="${escape(i.policyUrl)}" style="display:inline-block;padding:10px 16px;color:#fff;text-decoration:none;font-size:14px;font-weight:500;">View policy</a>
</td></tr>
</table>
</td></tr>
</table>
<div style="font-size:11px;color:#a3a3a3;margin-top:16px;max-width:480px;">OnTime &middot; simulated MVP, not yet a licensed insurance product</div>
</td></tr>
</table>
</body>
</html>`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
