import nodemailer, { type Transporter } from "nodemailer";
import type { WebinarKind } from "@/lib/webinar-access";

type WebinarEmailParams = {
  kind: WebinarKind;
  to: string;
  name: string;
  accessUrl: string;
  origin: string;
};

let webinarTransporter: Transporter | null = null;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || user || "").trim();
  if (!host || !port || !user || !pass || !from) {
    throw new Error("Hostinger SMTP is not configured for webinar access email.");
  }
  return { host, port, user, pass, from };
}

function getTransporter() {
  if (webinarTransporter) return webinarTransporter;
  const smtp = smtpConfig();
  webinarTransporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2" },
  });
  return webinarTransporter;
}

function emailContent(params: WebinarEmailParams) {
  const firstName = params.name.trim().split(/\s+/)[0] || "There";
  const isWhiteLabel = params.kind === "white-label";
  const title = isWhiteLabel ? "White Label Seminar" : "Machine Sourcing Seminar";
  const subject = isWhiteLabel
    ? "Your White Label Seminar access"
    : "Your Machine Sourcing Seminar access";
  const buttonLabel = isWhiteLabel ? "Watch the White Label Seminar" : "Watch the Machine Sourcing Seminar";
  const whiteLabelUrl = `${params.origin}/white-label`;
  const sourcingUrl = `${params.origin}/sourcing-project?route_type=white_label`;

  const introParagraph = isWhiteLabel
    ? "Thanks for registering. To gain immediate access to the webinar, click the button below."
    : "Thank you for registering. You can watch the full webinar using the button below.";
  const afterAccessParagraphs = isWhiteLabel
    ? [
        "In the training I cover how to choose the right product, validate demand, calculate real costs, and source safely from China.",
        `When you’re done watching, the fastest next step is to explore product ideas and start a project:<br><br>White-label ideas: <a href="${escapeHtml(whiteLabelUrl)}">${escapeHtml(whiteLabelUrl)}</a><br>Start a sourcing project: <a href="${escapeHtml(sourcingUrl)}">${escapeHtml(sourcingUrl)}</a>`,
        "If you have questions after the video, just reply to this email.",
      ]
    : [
        "Take your time with it. Do not multitask. This session was designed to help you rethink how machine sourcing should be approached, especially under Nigerian conditions.",
        "Pay close attention to:<br><br>• Why capacity claims mislead people<br>• Why installation failures destroy good machines<br>• Why most losses happen before the machine even leaves China",
        "When you finish watching, reply to this email and tell me the biggest insight you gained.",
        "Talk soon,<br>Tochukwu Nkwocha",
      ];

  const text = isWhiteLabel
    ? [
        title,
        "",
        `Hello ${firstName},`,
        "",
        "Thanks for registering. To gain immediate access to the webinar, open this secure link:",
        params.accessUrl,
        "",
        "In the training I cover how to choose the right product, validate demand, calculate real costs, and source safely from China.",
        "",
        "When you’re done watching, the fastest next step is to explore product ideas and start a project:",
        `White-label ideas: ${whiteLabelUrl}`,
        `Start a sourcing project: ${sourcingUrl}`,
        "",
        "If you have questions after the video, just reply to this email.",
      ].join("\n")
    : [
        title,
        "",
        `Hello ${firstName},`,
        "",
        "Thank you for registering.",
        "",
        "You can watch the full webinar here:",
        params.accessUrl,
        "",
        "Take your time with it. Do not multitask. This session was designed to help you rethink how machine sourcing should be approached, especially under Nigerian conditions.",
        "",
        "Pay close attention to:",
        "• Why capacity claims mislead people",
        "• Why installation failures destroy good machines",
        "• Why most losses happen before the machine even leaves China",
        "",
        "When you finish watching, reply to this email and tell me the biggest insight you gained.",
        "",
        "Talk soon,",
        "Tochukwu Nkwocha",
      ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 14px;background:#f4f6fb">
        <tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(15,23,42,.08)">
            <tr><td style="padding:22px 26px;background:#101c3d;color:#ffffff">
              <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f59e0b;font-weight:700">Sure Imports</div>
              <div style="font-size:22px;line-height:1.3;font-weight:700;margin-top:5px">${title}</div>
              <div style="font-size:12px;line-height:1.4;color:#cbd5e1;margin-top:4px">Delivered through LineScout</div>
            </td></tr>
            <tr><td style="padding:26px">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.65">Hello ${escapeHtml(firstName)},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.65">${introParagraph}</p>
              <div style="margin:22px 0">
                <a href="${escapeHtml(params.accessUrl)}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:#f59e0b;color:#111827;text-decoration:none;font-size:14px;font-weight:700">${buttonLabel}</a>
              </div>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#475569">If the button is unresponsive, copy this secure link into your browser:</p>
              <p style="margin:0 0 20px;font-size:12px;line-height:1.6;word-break:break-all"><a href="${escapeHtml(params.accessUrl)}" style="color:#20459b">${escapeHtml(params.accessUrl)}</a></p>
              ${afterAccessParagraphs.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65">${paragraph}</p>`).join("")}
            </td></tr>
          </table>
          <p style="max-width:600px;margin:12px auto 0;text-align:left;font-size:11px;line-height:1.5;color:#94a3b8">Sure Importers Limited · 5 Olutosin Ajayi Street, Ajao Estate, Lagos · hello@sureimports.com</p>
        </td></tr>
      </table>
    </div>`;

  return { subject, text, html };
}

export async function sendWebinarAccessEmail(params: WebinarEmailParams) {
  const smtp = smtpConfig();
  const content = emailContent(params);
  await getTransporter().sendMail({
    from: `"Sure Imports" <${smtp.from}>`,
    to: params.to,
    replyTo: "hello@sureimports.com",
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
