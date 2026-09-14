/** Local addresses only; a production build must never trust a Host-based bypass. */
export function shouldBypassLocalCaptcha(hostname: string): boolean {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL === '1')
    return false;
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  // Next's local request URL can use the bind address instead of the browser's
  // localhost/LAN hostname. Neither address is trusted in production.
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0'
  )
    return true;
  const parts = host.split('.');
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  )
    return false;
  const [first, second] = parts.map(Number);
  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}
