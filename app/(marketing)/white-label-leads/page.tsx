import type { Metadata } from "next";
import { Calculator, PackageCheck, SearchCheck, ShieldCheck } from "lucide-react";
import WebinarLeadLanding from "@/components/marketing/WebinarLeadLanding";
import WhiteLabelLeadForm from "@/components/marketing/WhiteLabelLeadForm";

export const metadata: Metadata = {
  title: "Free White-Label Sourcing Seminar | LineScout by Sure Imports",
  description:
    "Learn how to choose, validate, cost and safely source white-label products from China in this practical free seminar from Sure Imports.",
};

const lessons = [
  {
    title: "Choose a product worth branding",
    description: "Screen ideas for demand, repeat-purchase potential, differentiation and realistic room for margin.",
    icon: SearchCheck,
  },
  {
    title: "Validate demand before inventory",
    description: "Use evidence from your target customer and market instead of relying on enthusiasm or supplier claims.",
    icon: PackageCheck,
  },
  {
    title: "Calculate the real landed cost",
    description: "Account for the product, branding, packaging, shipping and other costs before setting your selling price.",
    icon: Calculator,
  },
  {
    title: "Source with stronger controls",
    description: "Clarify specifications, compare suppliers and reduce avoidable quality surprises before production.",
    icon: ShieldCheck,
  },
];

export default function WhiteLabelLeadsPage() {
  return (
    <WebinarLeadLanding
      eyebrow="Free on-demand white-label seminar"
      headline="Build a White-Label Brand Without Guessing Your Way Through China Sourcing"
      introduction="A practical 35-minute seminar on choosing the right product, validating demand, calculating the real cost and sourcing safely for your market."
      durationLabel="35-minute training"
      form={<WhiteLabelLeadForm />}
      lessons={lessons}
      lessonsCopy="Move from an interesting idea to a product decision supported by demand, cost and sourcing evidence."
      decisionHeading="Most white-label mistakes happen before production begins."
      decisionCopy="The goal is not simply to put a logo on a product. It is to build an offer your market wants at a cost and quality level the business can sustain."
    />
  );
}
