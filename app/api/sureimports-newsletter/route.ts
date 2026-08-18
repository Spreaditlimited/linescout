import { NextResponse } from 'next/server';

const SURE_IMPORTS_SUBSCRIPTIONS_URL = 'https://www.sureimports.com/api/subscribe';
const LEAD_SEGMENT_ID = '67699403ee348d7f8cb68f3a';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
  }

  const requestedSource = String(body?.source || 'linescout_footer_newsletter');
  const source = requestedSource === 'linescout_lead_capture_popup'
    ? requestedSource
    : 'linescout_footer_newsletter';
  const firstName = String(body?.first_name || '').trim();
  if (source === 'linescout_lead_capture_popup' && !firstName) {
    return NextResponse.json(
      { success: false, error: 'First name is required.' },
      { status: 400 },
    );
  }

  const payload = {
    email,
    first_name: firstName || undefined,
    segment_ids: [LEAD_SEGMENT_ID],
    source,
    message_variant: String(body?.message_variant || 'site'),
    page_type: String(body?.page_type || 'site'),
    page_url: typeof body?.page_url === 'string' ? body.page_url : null,
    pathname: typeof body?.pathname === 'string' ? body.pathname : null,
    referrer: typeof body?.referrer === 'string' ? body.referrer : null,
    utm_source: typeof body?.utm_source === 'string' ? body.utm_source : null,
    utm_medium: typeof body?.utm_medium === 'string' ? body.utm_medium : null,
    utm_campaign: typeof body?.utm_campaign === 'string' ? body.utm_campaign : null,
    utm_content: typeof body?.utm_content === 'string' ? body.utm_content : null,
    utm_term: typeof body?.utm_term === 'string' ? body.utm_term : null,
    first_seen_at: typeof body?.first_seen_at === 'string' ? body.first_seen_at : null,
    dismiss_count: Number(body?.dismiss_count || 0),
  };

  try {
    const response = await fetch(SURE_IMPORTS_SUBSCRIPTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({ success: false, error: 'Subscription failed.' }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Subscription is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
