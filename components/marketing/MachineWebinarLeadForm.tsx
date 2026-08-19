import WebinarLeadForm from "@/components/marketing/WebinarLeadForm";

export default function MachineWebinarLeadForm() {
  return (
    <WebinarLeadForm
      endpoint="/api/machine-sourcing-webinar/lead"
      page="machine-sourcing-webinar"
      dialogId="machine-sourcing-webinar"
      seminarName="machine sourcing seminar"
    />
  );
}
