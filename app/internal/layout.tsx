// app/internal/layout.tsx
import InternalTopBar from "./_components/InternalTopBar";

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <InternalTopBar />

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 shadow-xl">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}