import type { Metadata } from "next";
import { Factory, Gauge, HardHat, ShieldAlert } from "lucide-react";
import WebinarLeadLanding from "@/components/marketing/WebinarLeadLanding";
import MachineWebinarLeadForm from "@/components/marketing/MachineWebinarLeadForm";
import {
  LINESCOUT_SOCIAL_IMAGE,
  LINESCOUT_SOCIAL_IMAGE_METADATA,
} from "@/lib/linescout-metadata";

const PAGE_URL = "https://linescout.sureimports.com/machine-sourcing-webinar";

export const metadata: Metadata = {
  title: "How to Source Machines from China: Free Nigeria Seminar",
  description:
    "Learn how to evaluate, specify and source processing machines from China for Nigeria, including capacity, factory testing and installation planning.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    siteName: "LineScout by Sure Imports",
    title: "How to Source Processing Machines from China",
    description:
      "A free Nigeria-focused seminar on machine capacity, technical specifications, supplier verification, factory testing and installation readiness.",
    images: [LINESCOUT_SOCIAL_IMAGE_METADATA],
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Source Processing Machines from China",
    description:
      "Learn what to verify before paying for production or shipping industrial equipment to Nigeria.",
    images: [LINESCOUT_SOCIAL_IMAGE],
  },
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
      headline="How to Source the Right Processing Machine from China for Nigeria"
      introduction="A practical seminar on machine capacity, technical specifications, Chinese supplier verification, factory testing and installation planning—designed around Nigerian operating conditions."
      durationLabel="On-demand training"
      form={<MachineWebinarLeadForm />}
      lessons={lessons}
      lessonsCopy="A machine can be genuine and still be wrong for your raw material, output target, site or power conditions. Learn what must be resolved before capital and timelines are committed."
      contextHeading="Importing a machine is an engineering and operations decision—not a catalogue purchase"
      contextParagraphs={[
        "A machine name is not a complete requirement. Two factories may both offer a filling machine, dryer, packaging line or agricultural processor while proposing very different capacities, materials, motors, controls and supporting equipment. The correct starting point is the operation: the raw material going in, the finished output required, the working hours, available labour, utilities, floor space and quality standard the business must achieve.",
        "Advertised capacity also needs interrogation. Practical output can change with the size and moisture of the input, operator skill, feeding method, downtime, cleaning, changeovers and the specification of connected equipment. A useful supplier discussion therefore asks what conditions produced the quoted output and how the factory will demonstrate the machine using a representative process before shipment. A video of an empty motor running is not the same as a meaningful production test.",
        "Installation planning must begin before the machine leaves China. Voltage and frequency, generator or grid capacity, water, compressed air, ventilation, drainage, foundation, access doors, lifting equipment, local technicians, training, spare parts and commissioning can determine whether good equipment performs reliably in Nigeria. Resolving those requirements early protects the project from arriving with a machine that the site is not ready to receive or operate.",
      ]}
      audienceHeading="Who should watch this machine sourcing seminar?"
      audienceItems={[
        "Entrepreneurs planning an agro-processing, packaging, recycling or light-manufacturing business",
        "Existing manufacturers replacing equipment or increasing production capacity",
        "Small and medium businesses comparing machines from Alibaba or Chinese factories",
        "Project owners who need to translate a business idea into a technical machine specification",
        "Consultants and procurement teams evaluating supplier quotations for equipment projects",
        "Anyone preparing to pay a deposit, approve factory testing or ship machinery to Nigeria",
      ]}
      decisionHeading="The biggest machine losses often happen before shipment."
      decisionCopy="Tochukwu Nkwocha explains machine sourcing from the perspective of execution under real Nigerian conditions. Capacity, process fit, factory testing and installation readiness need to be resolved while the equipment can still be specified, demonstrated or corrected—not after it reaches the destination."
      faqs={[
        {
          question: "What types of machines can LineScout help businesses source from China?",
          answer: "Projects can include agro-processing, packaging, food and beverage, light-manufacturing, printing, recycling and other business equipment. The first step is defining the product, process and required output so the sourcing team can determine the appropriate machine category and supporting equipment.",
        },
        {
          question: "How do I know the machine capacity I actually need?",
          answer: "Begin with the required finished output over a realistic working period, then account for the input material, efficiency, cleaning, changeovers, labour and expected downtime. Ask suppliers to state the conditions behind their capacity figure and how that output will be demonstrated before shipment.",
        },
        {
          question: "What should I ask a Chinese machine supplier before paying?",
          answer: "Clarify the complete specification, materials, motors, controls, utilities, included accessories, consumables, spare parts, documentation, warranty process, training, installation responsibilities and factory test. Confirm that every quotation covers the same scope before comparing prices.",
        },
        {
          question: "Should machinery be inspected and tested before it leaves China?",
          answer: "A suitable pre-shipment verification plan is important because many mismatches are easier to correct at the factory. The test should be designed around the machine and project, using agreed acceptance criteria and representative material where practical—not only photographs or a short idle-running video.",
        },
        {
          question: "What installation information should be confirmed before shipping?",
          answer: "Confirm machine dimensions and weight, power, voltage and frequency, air or water requirements, drainage, ventilation, foundation, access and lifting needs, layout, technician support, commissioning, operator training and the spare parts required for startup and routine maintenance.",
        },
        {
          question: "What happens after I watch the machine sourcing seminar?",
          answer: "You can create a LineScout project and select the machine-sourcing route. The structured project keeps requirements, conversations, supplier information, quotations and execution activity together so several equipment projects can be managed without relying on fragmented WhatsApp threads.",
        },
      ]}
      relatedLinks={[
        {
          href: "https://www.sureimports.com/blog/how-to-import-from-china-to-nigeria-in-2026-the-complete-beginner-to-pro-guide",
          label: "Read the complete guide to importing from China to Nigeria",
          description: "Review the broader supplier, inspection, payment and shipping process around an equipment import.",
        },
        {
          href: "/projects/new",
          label: "Create a LineScout machine sourcing project",
          description: "Turn your output, process and site requirements into a structured sourcing route.",
        },
      ]}
    />
  );
}
