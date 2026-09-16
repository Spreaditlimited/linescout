import { Suspense } from "react";
import InternalSignInClient from "./InternalSignInClient";
export default function InternalSignInPage() { return <Suspense fallback={<div className="min-h-screen grid place-items-center" style={{background:"var(--ls-theme-canvas)",color:"var(--ls-theme-muted)"}} role="status">Loading sign in…</div>}><InternalSignInClient /></Suspense>; }
