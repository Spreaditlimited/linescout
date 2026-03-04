import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AffiliateReferralCapturePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const referral = String(code || "").trim().toUpperCase();

  if (referral) {
    const cookieStore = await cookies();
    cookieStore.set({
      name: "linescout_affiliate_ref",
      value: referral,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }

  redirect("/sign-in");
}

