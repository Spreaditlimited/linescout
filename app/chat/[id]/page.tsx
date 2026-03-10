import { redirect } from "next/navigation";

export default async function LegacyChatRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const chatId = encodeURIComponent(String(id || "").trim());
  redirect(`/conversations/${chatId}`);
}
