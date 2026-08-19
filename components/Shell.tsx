"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import FloatingWhatsAppButton from "@/components/FloatingWhatsAppButton";
import MarketingTopNav from "@/components/home/NavBar";
import Footer from "@/components/Footer";
import CookieNotice from "@/components/CookieNotice";

const LeadCapturePopup = dynamic(
  () => import("@/components/marketing/LeadCapturePopup"),
  { ssr: false },
);

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInternal = pathname.startsWith("/internal");
  const isAgents = pathname.startsWith("/agents");
  const isWhiteLabelLeads = pathname === "/white-label-leads";
  const isWhiteLabelWebinar = pathname.startsWith("/white-label-webinar");
  const isMachineSourcingLeads = pathname === "/machine-sourcing-webinar";
  const isMachineSourcingWebinar = pathname.startsWith("/machine-sourcing-webinar-video");
  const isWebinarViewer = isWhiteLabelWebinar || isMachineSourcingWebinar;
  const isImportFromChina = pathname.startsWith("/import-from-china");
  const isWhiteLabelMarketing = pathname === "/white-label" || isWhiteLabelLeads || isWhiteLabelWebinar;
  const isMachineWebinarMarketing = isMachineSourcingLeads || isMachineSourcingWebinar;
  const isAffiliate = pathname.startsWith("/affiliates");
  const isMarketing =
    isImportFromChina ||
    pathname.startsWith("/white-label") ||
    pathname.startsWith("/machines") ||
    pathname.startsWith("/machine-sourcing-webinar") ||
    pathname.startsWith("/machine-sourcing-webinar-video") ||
    pathname.startsWith("/track");
  const isLanding =
    pathname === "/" ||
    isImportFromChina ||
    pathname.startsWith("/account-deletion") ||
    isAgents ||
    pathname.startsWith("/track");
  const isPublicQuote = pathname.startsWith("/quote/") || pathname.startsWith("/shipping-quote/");
  const isAgentApp = pathname.startsWith("/agent-app");
  const isAuth = pathname.startsWith("/sign-in") || pathname.startsWith("/onboarding");
  const isAccountDeletion = pathname.startsWith("/account-deletion");
  const isTracking = pathname.startsWith("/track");
  const isApp =
    pathname.startsWith("/dashboard") ||
    (pathname.startsWith("/machine") && !isMachineWebinarMarketing) ||
    pathname.startsWith("/conversations") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/quotes") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/wallet") ||
    pathname.startsWith("/shipments") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/paystack") ||
    (pathname.startsWith("/white-label") && !isWhiteLabelMarketing) ||
    pathname.startsWith("/sourcing-project");
  const isNoStretch =
    isWhiteLabelLeads ||
    isWhiteLabelWebinar ||
    isMachineSourcingLeads ||
    isMachineSourcingWebinar;

  const privateWhiteLabelSections = [
    "/white-label/ideas",
    "/white-label/insights",
    "/white-label/start",
    "/white-label/step-",
    "/white-label/subscribe",
    "/white-label/wizard",
  ];
  const isPublicWhiteLabel =
    pathname === "/white-label" ||
    (pathname.startsWith("/white-label/") &&
      !privateWhiteLabelSections.some((route) => pathname.startsWith(route)));
  const isPublicSite =
    pathname === "/" ||
    pathname === "/account-deletion" ||
    pathname === "/agents" ||
    pathname === "/affiliates" ||
    pathname === "/business-plan" ||
    pathname === "/agent-app" ||
    isImportFromChina ||
    isPublicWhiteLabel ||
    pathname.startsWith("/machines") ||
    pathname.startsWith("/machine-sourcing-webinar") ||
    pathname.startsWith("/white-label-leads") ||
    pathname.startsWith("/white-label-webinar") ||
    pathname.startsWith("/track");
  const hasDarkPublicHero =
    pathname === "/" ||
    pathname === "/affiliates" ||
    pathname === "/agent-app" ||
    pathname === "/business-plan" ||
    pathname === "/import-from-china" ||
    pathname === "/machines" ||
    pathname === "/white-label" ||
    pathname.startsWith("/machine-sourcing-webinar") ||
    pathname.startsWith("/white-label-leads") ||
    pathname.startsWith("/white-label-webinar");

  const shellClass = "flex min-h-screen flex-col";

  return (
    <div className={`${shellClass}${isPublicSite ? " public-site" : ""}`}>
      {isPublicSite ? (
        <MarketingTopNav forceLightNavbar={isTracking || isWhiteLabelLeads || isMachineSourcingLeads} />
      ) : !isInternal &&
      !isLanding &&
      !isAgents &&
      !isAgentApp &&
      !isAuth &&
      !isApp &&
      !isAccountDeletion &&
      !isPublicQuote &&
      !isMarketing &&
      !isAffiliate ? (
        <Navbar />
      ) : null}
      {isPublicSite && !hasDarkPublicHero && !isTracking ? (
        <div
          className="h-[86px] shrink-0 bg-[linear-gradient(110deg,#11153A_0%,#050817_56%,#2A1115_100%)]"
          aria-hidden="true"
        />
      ) : null}
      {isPublicSite || isLanding ? children : (
        <main className={isNoStretch ? "min-h-0" : "flex-1 min-h-0"}>{children}</main>
      )}
      {isPublicSite ? <Footer /> : null}
      {isPublicSite && !isWebinarViewer ? <LeadCapturePopup /> : null}
      <CookieNotice />
      <FloatingWhatsAppButton />
    </div>
  );
}
