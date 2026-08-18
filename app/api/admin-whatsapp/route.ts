import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CONTACTS_URL = "https://www.sureimports.com/api/admin-whatsapp";

const fallbackContacts = [
  {
    id: "general",
    label: "General Enquiries",
    description: "Sales, sourcing, shipping, and account support",
    messageId: "CUR7YKW3K3RBA1",
  },
];

type SourceContact = {
  id?: unknown;
  label?: unknown;
  description?: unknown;
  phone?: unknown;
  messageId?: unknown;
  defaultMessage?: unknown;
};

export async function GET() {
  try {
    const response = await fetch(CONTACTS_URL, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) throw new Error(`Sure Imports returned ${response.status}`);

    const payload = (await response.json()) as { data?: SourceContact[] };
    const contacts = Array.isArray(payload.data)
      ? payload.data
          .map((contact) => ({
            id: String(contact.id || "").trim(),
            label: String(contact.label || "").trim(),
            description: contact.description ? String(contact.description).trim() : undefined,
            phone: contact.phone ? String(contact.phone).trim() : undefined,
            messageId: contact.messageId ? String(contact.messageId).trim() : undefined,
            defaultMessage: contact.defaultMessage ? String(contact.defaultMessage).trim() : undefined,
          }))
          .filter((contact) => contact.id && contact.label && (contact.phone || contact.messageId))
      : [];

    return NextResponse.json(
      { statusx: "SUCCESS", data: contacts.length ? contacts : fallbackContacts },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  } catch {
    return NextResponse.json(
      { statusx: "SUCCESS", data: fallbackContacts, fallback: true },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  }
}
