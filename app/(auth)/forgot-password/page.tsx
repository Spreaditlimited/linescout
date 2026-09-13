import { Suspense } from "react";
import PasswordAuthForm from "@/components/auth/PasswordAuthForm";
export default function Page() { return <Suspense fallback={<p>Loading account form…</p>}><PasswordAuthForm mode="reset" /></Suspense>; }
