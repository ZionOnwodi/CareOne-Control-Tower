# Sending the Daily Situation Report

`run-daily-dsr.mjs` builds the report. `send-email.mjs` emails it with the CareOne logo and icons
**embedded in the message**, so they show in Gmail, Outlook and company mail without "load images".

## Whose password?
Only the **sending** account's. The person receiving the report (e.g. the CEO) is just an address in
`MAIL_TO` — nobody needs their password. Use your own account as the sender.

## Option 1 — send from your own Gmail (simplest)
1. Google Account -> Security -> turn on **2-Step Verification**.
2. Google Account -> Security -> **App passwords** -> create one named "CareOne DSR". Copy the 16 characters.
3. In GitHub: repo -> Settings -> Secrets and variables -> Actions -> **New repository secret**. Add:

| Secret | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | the 16-character app password |
| `MAIL_FROM` | `CareOne Control Tower <your Gmail address>` |
| `MAIL_TO` | the recipient(s), comma-separated (start with just yourself) |

## Option 2 — send from a careoneng.com mailbox you own
Same six secrets, using the mail server from your web host's email settings for `SMTP_HOST` / `SMTP_PORT`
and that mailbox's address and password for `SMTP_USER` / `SMTP_PASS`.

## Run it
GitHub -> Actions -> **Daily Situation Report** -> Run workflow (subject is marked TEST). Check how it looks,
then switch `MAIL_TO` to the CEO and uncomment the `schedule:` lines in `.github/workflows/daily-dsr.yml`
(05:00 UTC = 06:00 Lagos).

## Try it locally without sending anything
    cd dsr-pipeline && npm install && node run-daily-dsr.mjs && node send-email.mjs --eml out.eml
Double-click `out.eml` to open the finished email in Outlook / Apple Mail / Thunderbird.
