// Sends the DSR built by run-daily-dsr.mjs over SMTP, with the logo and icons EMBEDDED in the message
// (multipart/related + Content-ID), so they show in Gmail, Outlook and web-hosted company mail.
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
//   MAIL_TO     comma-separated recipients (required)
//   MAIL_SUBJECT optional override; default comes from dsr-meta.json (+ " — TEST" if TEST_MODE=1)
//   TEST_MODE   "1" appends " — TEST" to the subject

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import { EMAIL_ASSETS } from "./render-email.mjs";

process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const html = fs.readFileSync("./dsr-email-output.html", "utf8");
const meta = JSON.parse(fs.readFileSync("./dsr-meta.json", "utf8"));

// Attach exactly the images the HTML references.
const attachments = [];
for (const [cid, file] of Object.entries(EMAIL_ASSETS)) {
  if (!html.includes(`cid:${cid}"`)) continue;
  if (!fs.existsSync(file)) throw new Error(`Missing image for cid:${cid} -> ${file}`);
  attachments.push({ filename: `${cid}.png`, path: file, cid, contentType: "image/png", contentDisposition: "inline" });
}

let subject = process.env.MAIL_SUBJECT || meta.subject;
if (process.env.TEST_MODE === "1" && !process.env.MAIL_SUBJECT) subject += " — TEST";

const text = `CareOne Enterprise Control Tower — Daily Situation Report (${meta.dataThrough}).\nThis report is best viewed in an HTML-capable email client.`;

const emlIdx = process.argv.indexOf("--eml");
if (emlIdx !== -1) {
  const out = process.argv[emlIdx + 1] || "dsr-email.eml";
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const info = await t.sendMail({
    from: process.env.MAIL_FROM || "CareOne Control Tower <control-tower@careoneng.com>",
    to: process.env.MAIL_TO || "recipient@example.com", subject, text, html, attachments,
  });
  fs.writeFileSync(out, info.message);
  console.log(`Wrote ${out} (${attachments.length} embedded images, ${(info.message.length / 1024).toFixed(0)} KB).`);
  process.exit(0);
}

const need = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_TO"].filter(k => !process.env[k]);
if (need.length) { console.error("Missing environment variables: " + need.join(", ")); process.exit(2); }

const port = Number(process.env.SMTP_PORT || 587);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
const info = await transporter.sendMail({
  from: process.env.MAIL_FROM || process.env.SMTP_USER,
  to: process.env.MAIL_TO.split(",").map(s => s.trim()).filter(Boolean),
  subject, text, html, attachments,
});
console.log(`Sent "${subject}" to ${process.env.MAIL_TO} (${attachments.length} embedded images). Message id: ${info.messageId}`);
