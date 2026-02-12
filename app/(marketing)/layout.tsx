
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        :root {
          --background: #f7f6f2;
          --foreground: #0b0b0e;
        }
        html,
        body {
          background: #f7f6f2;
          color: #0b0b0e;
        }
      `}</style>
      {children}
    </>
  );
}
