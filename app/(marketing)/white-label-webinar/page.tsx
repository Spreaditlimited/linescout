import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import WebinarViewingPage from "@/components/marketing/WebinarViewingPage";

export const metadata: Metadata = {
  title: "White Label Webinar | LineScout",
  description:
    "Watch the free white-label webinar and learn how to start your own brand with products from China.",
  robots: { index: false, follow: false, noarchive: true },
};

const VIDEO_EMBED_URL = "https://www.youtube.com/embed/ms-yhEExIRg";

export default function WhiteLabelWebinarPage() {
  return (
    <WebinarViewingPage
      eyebrow="Private white-label seminar"
      title="Build a product decision you can defend—not one based on excitement."
      introduction="Watch Tochukwu Nkwocha explain how to evaluate demand, calculate the real cost of importing, and move from a product idea to a safer sourcing brief."
      duration="Approximately 35 minutes"
      videoTitle="White-label sourcing seminar"
      videoUrl={VIDEO_EMBED_URL}
      viewingHeading="Leave the seminar with three decisions written down"
      viewingCopy="Keep a notebook nearby. The value of this session is not simply watching it; it is applying the framework to the product you intend to sell."
      viewingPoints={[
        {
          title: "The customer and problem",
          description: "Define who should buy the product, the problem it solves, and why they would choose your version.",
        },
        {
          title: "The numbers that must work",
          description: "Record your target quantity, estimated landed cost, selling price, and the margin needed to operate sustainably.",
        },
        {
          title: "The sourcing brief",
          description: "List the specifications, branding requirements, packaging, quality checks, and questions a supplier must answer.",
        },
      ]}
      nextStepEyebrow="When you finish watching"
      nextStepHeading="Turn the lesson into a real product project."
      nextStepCopy="Review the curated white-label catalogue, choose a viable direction, and let LineScout carry the product details into a structured sourcing project."
      primaryAction={{
        label: "Explore product ideas",
        href: "/white-label",
        icon: PackageSearch,
      }}
      secondaryAction={{ label: "Start a sourcing project", href: "/projects/new" }}
    />
  );
}
