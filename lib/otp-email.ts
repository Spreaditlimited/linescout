export function buildOtpEmail(params: { otp: string }) {
  const subject = "Your LineScout OTP Code";

  const text = [
    "LineScout (Sure Importers Limited)",
    "",
    `Your OTP is: ${params.otp}`,
    "",
    "This code expires in 10 minutes.",
    "If you did not request this, you can ignore this email.",
    "",
    "Help: hello@sureimports.com",
  ].join("\n");

  const html = `
  <div style="margin:0;padding:0;background:#f6f7fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:18px 22px;background:#0b0f17;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:13px;letter-spacing:0.4px;opacity:0.85;">LineScout (Sure Importers Limited)</div>
                <div style="font-size:18px;font-weight:700;margin-top:6px;line-height:1.35;">Your OTP Code</div>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 22px;color:#0b0f17;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#111827;">
                  Use the code below to sign in. This code expires in <b>10 minutes</b>.
                </p>

                <div style="border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#fafafa;text-align:center;margin:14px 0 18px 0;">
                  <div style="font-size:28px;font-weight:800;letter-spacing:6px;color:#0b0f17;">${params.otp}</div>
                </div>

                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                  If you did not request this, you can ignore this email.
                </p>

                <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
                  <div style="font-weight:700;color:#111827;">Need help?</div>
                  <div>Email: <a href="mailto:hello@sureimports.com" style="color:#0b0f17;text-decoration:underline;">hello@sureimports.com</a></div>
                </div>
              </td>
            </tr>
          </table>

          <div style="width:600px;max-width:600px;margin-top:10px;color:#9ca3af;font-size:11px;line-height:1.5;text-align:left;padding:0 4px;">
            This email was sent because an OTP was requested for your LineScout account.
          </div>
        </td>
      </tr>
    </table>
  </div>
  `;

  return { subject, text, html };
}

export function buildNoticeEmail(params: {
  subject: string;
  title: string;
  lines: string[];
  footerNote?: string;
  footerLines?: string[];
}) {
  const subject = params.subject;
  const text = [
    "LineScout (Sure Importers Limited)",
    "",
    params.title,
    "",
    ...params.lines,
    "",
    "Help: hello@sureimports.com",
  ].join("\n");

  const bodyHtml = params.lines
    .map((line) => `<p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#111827;">${line}</p>`)
    .join("");

  const footerNote =
    params.footerNote ||
    "This email was sent because a payout event occurred on your LineScout account.";
  const footerLines = Array.isArray(params.footerLines) && params.footerLines.length
    ? params.footerLines
    : [
        "LineScout is a registered trademark of Sure Importers Limited in Nigeria.",
        "Address: 5 Olutosin Ajayi Street, Ajao Estate, Lagos, Nigeria.",
        "Email: hello@sureimports.com",
      ];
  const footerHtml = footerLines.length
    ? footerLines
        .map(
          (line) =>
            `<div style="margin-top:2px;font-size:11px;line-height:1.5;color:#9ca3af;">${line}</div>`
        )
        .join("")
    : "";

  const html = `
  <div style="margin:0;padding:0;background:#f6f7fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:18px 22px;background:#0b0f17;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:13px;letter-spacing:0.4px;opacity:0.85;">LineScout (Sure Importers Limited)</div>
                <div style="font-size:18px;font-weight:700;margin-top:6px;line-height:1.35;">${params.title}</div>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 22px;color:#0b0f17;font-family:Arial,Helvetica,sans-serif;">
                ${bodyHtml}

                <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
                  <div style="font-weight:700;color:#111827;">Need help?</div>
                  <div>Email: <a href="mailto:hello@sureimports.com" style="color:#0b0f17;text-decoration:underline;">hello@sureimports.com</a></div>
                </div>
              </td>
            </tr>
          </table>

          <div style="width:600px;max-width:600px;margin-top:10px;color:#9ca3af;font-size:11px;line-height:1.5;text-align:left;padding:0 4px;">
            ${footerNote}
            ${footerHtml}
          </div>
        </td>
      </tr>
    </table>
  </div>
  `;

  return { subject, text, html };
}
