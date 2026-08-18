export function getSafeNextPath(value: string | null | undefined) {
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '';
  if (candidate.includes('\\') || /[\r\n]/.test(candidate)) return '';
  return candidate;
}
