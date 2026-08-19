import type { Metadata } from "next";
import { Factory, Gauge, HardHat, ShieldAlert } from "lucide-react";
import WebinarLeadLanding from "@/components/marketing/WebinarLeadLanding";
import MachineWebinarLeadForm from "@/components/marketing/MachineWebinarLeadForm";

export const metadata: Metadata = {
  title: "Free Machine Sourcing Seminar | LineScout by Sure Imports",
  description:
    "Learn how to evaluate capacity, specifications, installation and supplier risk before sourcing processing machines from China.",
};

const lessons = [
  {
    title: "Interrogate capacity claims",
    description: "Understand why advertised output can differ from practical output once materials, labour and operating conditions are considered.",
    icon: Gauge,
  },
  {
    title: "Define the complete machine need",
    description: "Move beyond a machine name to the product, input, output, power, space and process requirements that shape the specification.",
    icon: Factory,
  },
  {
    title: "Plan installation before shipment",
    description: "Consider utilities, technicians, commissioning, spare parts and training before the equipment leaves China.",
    icon: HardHat,
  },
  {
    title: "Control pre-shipment risk",
    description: "Know what should be verified with the supplier while there is still time to correct a costly mismatch.",
    icon: ShieldAlert,
  },
];

export default function MachineSourcingWebinarPage() {
  return (
    <WebinarLeadLanding
      eyebrow="Free on-demand machine sourcing seminar"
      headline="Source Processing Machines From China Without Gambling Your Capital"
      introduction="A practical session on capacity, specifications, supplier checks and installation planning—designed around the realities businesses face under Nigerian operating conditions."
      durationLabel="On-demand training"
      form={<MachineWebinarLeadForm />}
      lessons={lessons}
      lessonsCopy="A machine can be genuine and still be wrong for your operation. Learn what must be resolved before money and timelines are committed."
      decisionHeading="The biggest machine losses often happen before shipment."
      decisionCopy="Capacity, process fit and installation readiness need to be resolved while the machine can still be specified, tested or corrected—not after it reaches Nigeria."
    />
  );
}
