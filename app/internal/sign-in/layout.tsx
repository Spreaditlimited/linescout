export default function InternalSignInLayout({ children }: { children: React.ReactNode }) {
  // No internal top bar / nav here. Just render the page.
  return <>{children}</>;
}