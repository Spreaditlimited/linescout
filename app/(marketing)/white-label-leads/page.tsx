import type { Metadata } from "next";
import { Calculator, PackageCheck, SearchCheck, ShieldCheck } from "lucide-react";
import WebinarLeadLanding from "@/components/marketing/WebinarLeadLanding";
import WhiteLabelLeadForm from "@/components/marketing/WhiteLabelLeadForm";
import {
  LINESCOUT_SOCIAL_IMAGE,
  LINESCOUT_SOCIAL_IMAGE_METADATA,
} from "@/lib/linescout-metadata";

const PAGE_URL = "https://linescout.sureimports.com/white-label-leads";

export const metadata: Metadata = {
  title: "White Label Products from China: Free Nigeria Seminar",
  description:
    "Learn how to choose, validate, brand and source white-label products from China for Nigeria in this free practical seminar from Sure Imports.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    siteName: "LineScout by Sure Imports",
    title: "How to Source White Label Products from China",
    description:
      "A free Nigeria-focused seminar on product validation, landed cost, private-label branding, supplier selection and quality control in China.",
    images: [LINESCOUT_SOCIAL_IMAGE_METADATA],
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Source White Label Products from China",
    description:
      "Learn how to validate, cost, brand and source a white-label product for the Nigerian market.",
    images: [LINESCOUT_SOCIAL_IMAGE],
  },
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
      headline="How to Build a White-Label Product Brand and Source from China"
      introduction="A practical Nigeria-focused seminar on selecting a viable product, validating demand, calculating landed cost, planning your branding and sourcing with stronger controls in China."
      durationLabel="35-minute training"
      form={<WhiteLabelLeadForm />}
      lessons={lessons}
      lessonsCopy="Move from an interesting product idea to a sourcing decision supported by customer demand, commercial numbers and a specification suppliers can actually follow."
      contextHeading="White labelling is a business decision before it becomes a sourcing project"
      contextParagraphs={[
        "White labelling allows a business to sell a product manufactured by another company under its own brand. The opportunity is attractive because you do not need to build a factory before launching, but the work goes far beyond printing a logo. You still need to decide who the product is for, what problem it solves, which specifications matter, how the packaging should communicate value and what level of quality the market will accept.",
        "For a Nigerian importer, the factory quotation is only one part of the commercial picture. Branding, samples, packaging, inspection, international shipping, local delivery, payment costs and product-specific requirements can all affect the landed cost. If these numbers are calculated after production, a product that looked profitable at the beginning may become difficult to price or reorder. The seminar shows you how to ask the commercial questions earlier.",
        "A stronger launch begins with evidence. That may include conversations with the intended buyer, competitor reviews, existing search demand, realistic selling prices and a small test of the offer before committing to a larger order. Once the product direction is clearer, the sourcing brief should define materials, dimensions, performance, artwork, packaging and quality checks so suppliers are quoting the same requirement rather than different interpretations of a product name.",
      ]}
      audienceHeading="Who should watch this white-label sourcing seminar?"
      audienceItems={[
        "Entrepreneurs exploring products they can brand and sell in Nigeria or another African market",
        "Existing retailers who want to move from generic stock to a more defensible own-brand product",
        "Online sellers evaluating a single-product brand, bundle or repeat-purchase category",
        "Importers who need to understand landed cost before paying a supplier or approving packaging",
        "Business owners comparing Alibaba listings, Chinese factories and private-label manufacturers",
        "Anyone with a product idea who needs a structured route from validation to sourcing execution",
      ]}
      decisionHeading="Most white-label mistakes happen before production begins."
      decisionCopy="Tochukwu Nkwocha draws on Sure Imports' practical China sourcing experience to explain the decisions that protect capital before an order is placed. The objective is not simply to put a logo on a generic product. It is to build an offer your market wants at a cost and quality level the business can sustain and reproduce."
      faqs={[
        {
          question: "What is a white-label product?",
          answer: "A white-label product is manufactured by one company and sold by another business under its own brand. Depending on the factory and order, the buyer may customize the logo, colours, packaging, bundle or selected specifications while using an existing product platform.",
        },
        {
          question: "Is white labelling the same as private labelling?",
          answer: "The terms are often used interchangeably. In practice, white labelling commonly begins with a relatively standard product offered to several brands, while private labelling may involve more exclusive specifications, formulation, tooling or packaging. The important issue is to document exactly what the supplier will customize and control.",
        },
        {
          question: "How much money do I need to start a white-label business in Nigeria?",
          answer: "There is no responsible universal figure. Capital depends on the product, minimum order, samples, branding, packaging, quality checks, shipping method and destination requirements. Calculate the complete landed cost and working-capital need for the exact project instead of relying on a generic starting amount.",
        },
        {
          question: "How do I choose a product to import and brand?",
          answer: "Start with a defined customer and problem. Look for evidence of demand, room to differentiate, realistic repeat or referral potential and a landed cost that supports your intended selling price. Then assess product complexity, quality risk and any destination-market requirements before ordering inventory.",
        },
        {
          question: "Can a Chinese supplier add my logo and custom packaging?",
          answer: "Many suppliers offer logo application and packaging customization, but available methods and minimum quantities differ. Approve the logo size, colour, placement, packaging artwork and production-equivalent sample, and record them in the purchase specification before mass production.",
        },
        {
          question: "What happens after I watch the seminar?",
          answer: "You can explore LineScout's white-label product ideas and start a sourcing project for a specific product. LineScout keeps the product brief, conversation, quotations and project activity together rather than forcing a complex sourcing project into scattered WhatsApp messages.",
        },
      ]}
      relatedLinks={[
        {
          href: "/white-label",
          label: "Explore more than 1,000 white-label product ideas",
          description: "Compare product opportunities and open detailed sourcing guides before choosing a direction.",
        },
        {
          href: "https://www.sureimports.com/blog/how-to-import-from-china-to-nigeria-in-2026-the-complete-beginner-to-pro-guide",
          label: "Read the complete guide to importing from China to Nigeria",
          description: "Understand the broader sourcing, supplier, inspection and shipping process around your product.",
        },
        {
          href: "/projects/new",
          label: "Start a structured LineScout sourcing project",
          description: "Turn a chosen product into a brief that can move through sourcing, quotation and execution.",
        },
      ]}
    />
  );
}
