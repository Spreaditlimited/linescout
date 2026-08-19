import WebinarLeadForm from "@/components/marketing/WebinarLeadForm";

export default function WhiteLabelLeadForm() {
  return (
    <WebinarLeadForm
      endpoint="/api/white-label-webinar/lead"
      page="white-label-leads"
      dialogId="white-label-webinar"
      seminarName="white-label seminar"
    />
  );
}
