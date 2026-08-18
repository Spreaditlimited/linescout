export default function WorkspaceLoading() {
  return (
    <div className="p-6 sm:p-8">
      <div className="animate-pulse space-y-5" aria-label="Loading workspace">
        <div className="h-7 w-48 rounded-full bg-slate-100" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-32 rounded-3xl bg-slate-100" />
          <div className="h-32 rounded-3xl bg-slate-100" />
          <div className="h-32 rounded-3xl bg-slate-100" />
        </div>
        <div className="h-48 rounded-3xl bg-slate-100" />
      </div>
    </div>
  );
}
