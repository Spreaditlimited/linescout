import { buildNoticeEmail } from "@/lib/otp-email";
import type { Transporter } from "nodemailer";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

type NoticeEmailParams = {
  to: string;
  subject: string;
  title: string;
  lines: string[];
  footerNote?: string;
  replyTo?: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

  if (!host || !port || !user || !pass) {
    return { ok: false as const, error: "Missing SMTP env vars (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)." };
  }

  return { ok: true as const, host, port, user, pass, from };
}

export async function sendNoticeEmail(params: NoticeEmailParams) {
  const smtp = getSmtpConfig();
  if (!smtp.ok) {
    return { ok: false as const, error: smtp.error };
  }

  const mail = buildNoticeEmail({
    subject: params.subject,
    title: params.title,
    lines: params.lines,
    footerNote: params.footerNote,
  });

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: smtp.from,
    to: params.to,
    replyTo: params.replyTo || "hello@sureimports.com",
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  return { ok: true as const };
}
