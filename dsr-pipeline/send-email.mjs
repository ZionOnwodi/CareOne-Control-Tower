// Sends the DSR / WSR built by run-daily-dsr.mjs / run-weekly-wsr.mjs over SMTP. The logo and icons are
// NOT attached: the HTML loads them by public URL from GitHub Pages (see render-email.mjs), so the
// message has no attachments.
//
//   node send-email.mjs                  send using the SMTP_* environment variables
//   node send-email.mjs --eml out.eml    write the finished raw email to a file instead of sending
//                                        (double-click the .eml to open it in Outlook / Apple Mail / Thunderbird)
//
// Environment variables (store these as GitHub repository secrets — never commit them):
//   SMTP_HOST   e.g. mail.careoneng.com            (from your web host's email settings)
//   SMTP_PORT   587 (STARTTLS)  or  465 (SSL)       default 587
//   SMTP_USER   full mailbox address, e.g. zion.onwodi@careoneng.com
//   SMTP_PASS   that mailbox's password or app password
//   MAIL_FROM   default: SMTP_USER   (display name allowed:  "CareOne Control Tower <zion.onwodi@careoneng.com>")
//   MAIL_TO     comma-separated recipients (required unless TEST_MODE=1)
//   MAIL_TO_TEST comma-separated test recipients. With TEST_MODE=1 the email goes ONLY here; MAIL_TO is
//               ignored entirely, and a missing MAIL_TO_TEST stops the send rather than use the real list.
//   MAIL_SUBJECT optional override; default comes from dsr-meta.json (+ " — TEST" if TEST_MODE=1)
//   TEST_MODE   "1" appends " — TEST" to the subject and sends only to MAIL_TO_TEST

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const html = fs.readFileSync("./dsr-email-output.html", "utf8");
const meta = JSON.parse(fs.readFileSync("./dsr-meta.json", "utf8"));

// Images are hosted, never attached. Refuse to send HTML that still expects cid: or data: images.
if (/src="(cid|data):/i.test(html)) throw new Error("dsr-email-output.html still has cid:/data: images; they must be hosted URLs.");

const testMode = process.env.TEST_MODE === "1";
let subject = process.env.MAIL_SUBJECT || meta.subject;
if (testMode && !process.env.MAIL_SUBJECT) subject += " — TEST";

// Test runs go only to MAIL_TO_TEST. MAIL_TO is never read in test mode, so a test can't reach the real list.
const recipientVar = testMode ? "MAIL_TO_TEST" : "MAIL_TO";
const recipients = process.env[recipientVar] || "";

const text = `CareOne Enterprise Control Tower — ${meta.reportName || "Daily Situation Report"} (${meta.dataThrough}).\nThis report is best viewed in an HTML-capable email client.`;

const emlIdx = process.argv.indexOf("--eml");
if (emlIdx !== -1) {
  const out = process.argv[emlIdx + 1] || "dsr-email.eml";
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const info = await t.sendMail({
    from: process.env.MAIL_FROM || "CareOne Control Tower <control-tower@careoneng.com>",
    to: recipients || "recipient@example.com", subject, text, html,
  });
  fs.writeFileSync(out, info.message);
  console.log(`Wrote ${out} (no attachments, ${(info.message.length / 1024).toFixed(0)} KB).`);
  process.exit(0);
}

if (testMode && !recipients.trim()) {
  console.error("TEST_MODE=1 but MAIL_TO_TEST is not set. Refusing to send: test emails never fall back to MAIL_TO.");
  process.exit(2);
}
const need = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", recipientVar].filter(k => !process.env[k]);
if (need.length) { console.error("Missing environment variables: " + need.join(", ")); process.exit(2); }

const port = Number(process.env.SMTP_PORT || 587);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
const info = await transporter.sendMail({
  from: process.env.MAIL_FROM || process.env.SMTP_USER,
  to: recipients.split(",").map(s => s.trim()).filter(Boolean),
  subject, text, html,
});
console.log(`Sent "${subject}" to ${recipients}${testMode ? " (TEST: MAIL_TO_TEST only)" : ""} (no attachments). Message id: ${info.messageId}`);
