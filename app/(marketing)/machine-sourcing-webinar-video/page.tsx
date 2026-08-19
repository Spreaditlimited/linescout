import type { Metadata } from "next";
import { Factory } from "lucide-react";
import WebinarViewingPage from "@/components/marketing/WebinarViewingPage";

export const metadata: Metadata = {
  title: "Machine Sourcing Webinar | LineScout",
  description:
    "Watch the free machine sourcing webinar and learn how to source profitable machines from China.",
  robots: { index: false, follow: false, noarchive: true },
};

const VIDEO_EMBED_URL = process.env.NEXT_PUBLIC_MACHINE_WEBINAR_VIDEO_URL || "";

export default function MachineSourcingWebinarVideoPage() {
  return (
    <WebinarViewingPage
      eyebrow="Private machine sourcing seminar"
      title="Source the machine your operation needs—not the capacity claim in a brochure."
      introduction="Watch Tochukwu Nkwocha break down the decisions that determine whether a machine performs reliably after it reaches Nigeria."
      duration="Complete training session"
      videoTitle="Machine sourcing seminar"
      videoUrl={VIDEO_EMBED_URL}
      viewingHeading="Evaluate the whole operating system around the machine"
      viewingCopy="Do not watch this as a catalogue presentation. Use the session to interrogate the machine, its supplier, and the conditions required for successful installation and operation."
      viewingPoints={[
        {
          title: "Required output—not advertised capacity",
          description: "Write down the real production target, product specification, working hours, and acceptable waste rate for your operation.",
        },
        {
          title: "Installation and local conditions",
          description: "Identify your power, space, ventilation, water, operator skill, spare-parts, and commissioning requirements before ordering.",
        },
        {
          title: "Evidence the supplier must provide",
          description: "Define the tests, documentation, factory checks, packaging, warranty, training, and after-sales support you need to verify.",
        },
      ]}
      nextStepEyebrow="When you finish watching"
      nextStepHeading="Build the machine brief before contacting suppliers."
      nextStepCopy="Start a LineScout project and structure the capacity, installation, verification, shipping, and support requirements around your actual business conditions."
      primaryAction={{
        label: "Start machine sourcing",
        href: "/projects/new",
        icon: Factory,
      }}
    />
  );
}
