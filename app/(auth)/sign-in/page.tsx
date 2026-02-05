import Link from "next/link";
import EmailOtpForm from "@/components/auth/EmailOtpForm";

export default function SignInPage() {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Link
        href="/"
        className="btn btn-ghost text-xs"
      >
        ← Back to home
      </Link>
      <EmailOtpForm />
    </div>
  );
}
