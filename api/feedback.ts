import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { handleOptions, sendError, cors } from './_lib/http.js';

// ============================================================
// Feedback → email. Verifies the sender is a signed-in user
// (Supabase JWT), then delivers the message to the fixed
// destination via Resend's HTTP API. No account scoping —
// feedback is user-scoped, not account-scoped.
// ============================================================

// Resend sandbox mode (before a domain is verified) rejects any recipient
// that isn't the Resend account's signup email. Default to that address so
// feedback delivers out of the box; once trilliantdigital.com is verified
// at resend.com/domains, set FEEDBACK_TO_ADDRESS to the trilliant address.
const DEFAULT_DESTINATION = 'shreekrishnabhasri07@gmail.com';
const MAX_MESSAGE_CHARS = 5000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');
  cors(res);

  // ---- 1. Verify sender via Supabase JWT ---------------------------------
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return sendError(res, 401, 'missing_token', 'You must be signed in to send feedback.');
  }
  const jwt = header.slice(7);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return sendError(res, 500, 'config_error', 'Server auth is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !user) {
    return sendError(res, 401, 'invalid_token', 'Your session has expired. Please sign in again.');
  }

  // ---- 2. Validate the message -------------------------------------------
  const body = (req.body || {}) as { message?: string; account_label?: string; page?: string };
  const message = String(body.message || '').trim();
  if (!message) {
    return sendError(res, 400, 'missing_message', 'Please write a message before sending.');
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return sendError(res, 400, 'message_too_long', `Feedback is capped at ${MAX_MESSAGE_CHARS} characters.`);
  }

  const senderEmail = user.email || 'unknown';
  const senderName = (user.user_metadata?.full_name || user.user_metadata?.name || '').toString();
  const accountLabel = String(body.account_label || '').trim();
  const page = String(body.page || '').trim();
  const timestamp = new Date().toISOString();

  // ---- 3. Send via Resend -------------------------------------------------
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return sendError(
      res,
      500,
      'email_not_configured',
      'Email delivery is not configured yet. Ask the admin to set RESEND_API_KEY.',
    );
  }
  // Resend requires a verified sending domain. Falls back to Resend's
  // shared onboarding sender so feedback works out of the box before a
  // domain is verified.
  const fromAddress = process.env.FEEDBACK_FROM_ADDRESS || 'Content Intelligence <onboarding@resend.dev>';
  const destination = process.env.FEEDBACK_TO_ADDRESS || DEFAULT_DESTINATION;

  const subject = `[Content Intelligence] Feedback from ${senderName || senderEmail}`;
  const meta = [
    `From: ${senderName ? `${senderName} <${senderEmail}>` : senderEmail}`,
    accountLabel ? `Account: ${accountLabel}` : '',
    page ? `Page: ${page}` : '',
    `Sent: ${timestamp}`,
  ].filter(Boolean).join('\n');

  const text = `${meta}\n\n---\n\n${message}`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:16px;color:#111;">
    <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;font-size:13px;color:#374151;margin-bottom:16px;">
      <div><strong>From:</strong> ${escapeHtml(senderName ? `${senderName} <${senderEmail}>` : senderEmail)}</div>
      ${accountLabel ? `<div><strong>Account:</strong> ${escapeHtml(accountLabel)}</div>` : ''}
      ${page ? `<div><strong>Page:</strong> ${escapeHtml(page)}</div>` : ''}
      <div><strong>Sent:</strong> ${escapeHtml(timestamp)}</div>
    </div>
    <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</div>
  </div>`;

  // Send email + persist to feedback table in parallel. The DB row is the
  // durable record — even if email delivery breaks, the admin can still see
  // the submission in Settings. deliver_error captures the mail failure.
  let deliverError: string | null = null;
  let messageId: string | null = null;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [destination],
        reply_to: senderEmail,
        subject,
        text,
        html,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      deliverError = errText.slice(0, 500) || resp.statusText;
    } else {
      const result = await resp.json().catch(() => ({}));
      messageId = (result as any)?.id ?? null;
    }
  } catch (e) {
    deliverError = e instanceof Error ? e.message : 'Unknown error contacting the email provider.';
  }

  await admin.from('feedback').insert({
    sender_user_id: user.id,
    sender_email: senderEmail,
    sender_name: senderName || null,
    account_label: accountLabel || null,
    page: page || null,
    message,
    delivered: !deliverError,
    deliver_error: deliverError,
  });

  if (deliverError) {
    return sendError(res, 502, 'email_send_failed', `Feedback was saved but email delivery failed: ${deliverError}`);
  }

  return res.status(200).json({
    success: true,
    message_id: messageId,
    delivered_to: destination,
  });
}
