// app/machine-sourcing/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import BusinessPlanForm from "@/components/BusinessPlanForm";

type Mode = "chat" | "businessPlan";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

export default function MachineSourcingPage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      role: "assistant",
      content:
        "Hi, I’m LineScout. Tell me the production line you’re considering and where you want to install it (for example 5T per day groundnut oil line in Lagos). I’ll help you think through capacity, budget and key machines.",
    },
  ]);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Single source of truth for token (persisted)
  const [sourcingToken, setSourcingToken] = useState("");

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Lead capture
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);

  const [leadName, setLeadName] = useState("");
  const [leadWhatsapp, setLeadWhatsapp] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadIntent, setLeadIntent] = useState("");

  // Token verify + handoff modal
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [handoffSubmitting, setHandoffSubmitting] = useState(false);

  const [handoffEmail, setHandoffEmail] = useState("");
  const [handoffWhatsapp, setHandoffWhatsapp] = useState("");
  const [handoffContext, setHandoffContext] = useState("");

  const [uiAlertOpen, setUiAlertOpen] = useState(false);
  const [uiAlertTitle, setUiAlertTitle] = useState("Notice");
  const [uiAlertMessage, setUiAlertMessage] = useState("");

  // Keep a live ref of messages so API payload is never stale
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const makeId = () => Math.random().toString(36).slice(2);

  // Persistent sessionId (stored once per browser)
  function getLineScoutSessionId() {
    const key = "linescout_session_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  }

  // Load leadCaptured once (so we do not ask again after refresh)
  useEffect(() => {
    const captured = localStorage.getItem("linescout_lead_captured");
    if (captured === "true") setLeadCaptured(true);

    // Optional: prefill fields if available
    const n = localStorage.getItem("linescout_lead_name") || "";
    const w = localStorage.getItem("linescout_lead_whatsapp") || "";
    const e = localStorage.getItem("linescout_lead_email") || "";
    const i = localStorage.getItem("linescout_lead_intent") || "";

    if (n) setLeadName(n);
    if (w) setLeadWhatsapp(w);
    if (e) setLeadEmail(e);
    if (i) setLeadIntent(i);

    // Prefill handoff fields from stored lead
    if (e) setHandoffEmail(e);
    if (w) setHandoffWhatsapp(w);
  }, []);

  function showUiAlert(title: string, message: string) {
    setUiAlertTitle(title);
    setUiAlertMessage(message);
    setUiAlertOpen(true);
  }

  // Trigger lead modal after 3 user messages (chat mode only)
  useEffect(() => {
    if (mode !== "chat") return;
    if (leadCaptured) return;

    const userMessages = messages.filter((m) => m.role === "user").length;
    if (userMessages >= 3) setShowLeadModal(true);
  }, [messages, leadCaptured, mode]);

  function normalizeWhatsAppUI(raw: string) {
    const digits = raw.replace(/\D/g, "");

    if (digits.startsWith("234")) {
      if (digits.length !== 13) throw new Error("Invalid Nigerian WhatsApp number.");
      return digits;
    }

    if (digits.startsWith("0")) {
      const trimmed = digits.slice(1);
      if (trimmed.length !== 10) throw new Error("Invalid Nigerian WhatsApp number.");
      return "234" + trimmed;
    }

    if (digits.length === 10) return "234" + digits;

    throw new Error("Please enter a valid Nigerian WhatsApp number.");
  }

  async function submitLead() {
    const name = leadName.trim();
    let whatsapp: string;

    try {
      whatsapp = normalizeWhatsAppUI(leadWhatsapp.trim());
    } catch (err: any) {
      alert(err.message);
      return;
    }

    const email = leadEmail.trim();
    const intent = leadIntent.trim();

    if (!name || !whatsapp || !email || !intent) {
      alert("All fields are required.");
      return;
    }

    setLeadSubmitting(true);

    try {
      const res = await fetch("/api/linescout-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getLineScoutSessionId(),
          name,
          whatsapp,
          email,
          sourcingRequest: intent,
          meta: { source: "linescout-chat" },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to save lead");

      // Persist for follow ups and future flows
      localStorage.setItem("linescout_lead_captured", "true");
      localStorage.setItem("linescout_lead_name", name);
      localStorage.setItem("linescout_lead_whatsapp", whatsapp);
      localStorage.setItem("linescout_lead_email", email);
      localStorage.setItem("linescout_lead_intent", intent);

      setLeadCaptured(true);
      setShowLeadModal(false);

      // Prefill handoff fields too
      setHandoffEmail(email);
      setHandoffWhatsapp(whatsapp);
    } catch {
      alert("Could not save your details. Please try again.");
    } finally {
      setLeadSubmitting(false);
    }
  }

  // Load token once
  useEffect(() => {
    const key = "linescout_sourcing_token";
    const existing = localStorage.getItem(key);
    if (existing) setSourcingToken(existing);
  }, []);

  // Save token whenever it changes
  useEffect(() => {
    const key = "linescout_sourcing_token";
    const v = sourcingToken.trim();
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);

    // If the token changes, it is no longer verified
    setIsVerified(false);
  }, [sourcingToken]);

  async function handleVerifyOrGetToken() {
    const t = sourcingToken.trim();

    // No token typed, treat button as "Get your token"
    if (!t) {
      window.open("https://paystack.shop/pay/sourcing", "_blank", "noopener,noreferrer");
      return;
    }

    if (verifying) return;

    setVerifying(true);
    try {
      const res = await fetch("/api/verify-sourcing-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t, type: "sourcing" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        showUiAlert("Token not valid", String(data?.message || data?.error || "Token is invalid or expired."));
        setIsVerified(false);
        return;
      }

      setIsVerified(true);

      // Prefill email from token record (you said you store only email)
      if (data.email) setHandoffEmail(String(data.email));

      // Prefill whatsapp from lead if available
      const storedWhatsapp = localStorage.getItem("linescout_lead_whatsapp") || "";
      if (storedWhatsapp && !handoffWhatsapp) setHandoffWhatsapp(storedWhatsapp);

      setShowHandoffModal(true);
    } catch {
      alert("Could not verify token. Please try again.");
      setIsVerified(false);
    } finally {
      setVerifying(false);
    }
  }

  async function submitHandoff() {
    const t = sourcingToken.trim();
    const email = handoffEmail.trim();
    const context = handoffContext.trim();

    let whatsapp: string;
    try {
      whatsapp = normalizeWhatsAppUI(handoffWhatsapp.trim());
    } catch (err: any) {
      alert(err.message);
      return;
    }

    if (!t) {
      alert("Please paste your token first.");
      return;
    }

    if (!email || !whatsapp || !context) {
      alert("Please fill all fields.");
      return;
    }

    if (handoffSubmitting) return;

    setHandoffSubmitting(true);
    try {
      const res = await fetch("/api/linescout-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: t,
          email,
          whatsapp_number: whatsapp,
          context,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) throw new Error(data?.error || data?.message || "Could not submit handoff");

      setShowHandoffModal(false);
      setHandoffContext("");

      showUiAlert("We have received your details.", "You will receive a WhatsApp message shortly.");
    } catch (e: any) {
      alert(e?.message || "Could not submit handoff. Please try again.");
    } finally {
      setHandoffSubmitting(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const question = input.trim();

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: question,
    };

    // Add user message to UI
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    // Create one assistant message we will "stream into"
    const assistantId = makeId();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const payloadMessages = [...messagesRef.current, userMsg];

      const res = await fetch("/api/linescout-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getLineScoutSessionId(),
          message: question,
          messages: payloadMessages,
          tokenCandidate: sourcingToken.trim() || "",
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: errText || `LineScout could not reply right now (status ${res.status}). Please try again.`,
                }
              : m
          )
        );
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        const fullText = await res.text();
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m)));
        return;
      }

      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        full += chunk;

        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: full } : m)));
      }

      if (!full.trim()) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: "LineScout returned no reply text." } : m))
        );
      }
    } catch (err) {
      console.error("LineScout chat error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Something went wrong while talking to LineScout. Please check your internet connection and try again.",
              }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  // Basic swipe between modes on touch devices
  function handleTouchStart(e: React.TouchEvent) {
    const x = e.touches[0]?.clientX;
    if (typeof x === "number") setTouchStartX(x);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX == null) return;
    const endX = e.changedTouches[0]?.clientX;
    if (typeof endX !== "number") return;

    const deltaX = endX - touchStartX;
    const threshold = 60;

    if (deltaX < -threshold && mode === "chat") setMode("businessPlan");
    else if (deltaX > threshold && mode === "businessPlan") setMode("chat");

    setTouchStartX(null);
  }

  return (
    // Key fix for mobile: use 100dvh and a flex column shell so the composer is always visible
    <div className="h-[100dvh] min-h-[100dvh] bg-slate-950 text-slate-50 text-sm sm:text-base flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#060a17]/75 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center" aria-label="LineScout home">
              <Image
                src="/linescout-logo.png"
                alt="LineScout"
                width={120}
                height={28}
                priority
                className="h-[26px] w-auto"
              />
            </Link>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-sm text-slate-300">Your co-pilot for machine sourcing</div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-emerald-200">
              BETA
            </span>
          </div>

          <nav className="hidden items-center gap-6 lg:flex">
            <Link href="/#how" className="text-sm font-medium text-slate-300 hover:text-white">
              How it works
            </Link>
            <Link href="/#products" className="text-sm font-medium text-slate-300 hover:text-white">
              Modes
            </Link>
            <Link href="/#prompts" className="text-sm font-medium text-slate-300 hover:text-white">
              Examples
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/machine-sourcing"
              className="hidden rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-white/10 sm:inline-flex"
            >
              Business plan
            </Link>
            <Link
              href="/machine-sourcing"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-400/35 hover:bg-emerald-500/20"
            >
              Start chat
            </Link>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="mx-auto w-full flex-1 min-h-0 max-w-6xl gap-4 px-4 py-3 md:py-5 flex">
        {/* Sidebar */}
        <aside className="hidden w-64 flex-shrink-0 flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 md:flex">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Modes</div>

          <button
            type="button"
            onClick={() => setMode("chat")}
            className={`
              flex flex-col items-start rounded-xl px-4 py-3 text-left transition ring-1
              ${
                mode === "chat"
                  ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/35"
                  : "bg-white/5 text-slate-200 ring-white/15 hover:bg-white/10"
              }
            `}
          >
            <span className="font-semibold">Machine Sourcing Chat</span>
            <span className="mt-0.5 text-sm text-slate-400">
              Ask about production lines, capacity, suppliers and budgets.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode("businessPlan")}
            className={`
              flex flex-col items-start rounded-xl px-4 py-3 text-left transition ring-1
              ${
                mode === "businessPlan"
                  ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/35"
                  : "bg-white/5 text-slate-200 ring-white/15 hover:bg-white/10"
              }
            `}
          >
            <span className="font-semibold">Business Plan Writer</span>
            <span className="mt-0.5 text-sm text-slate-400">Use your paid token to generate a full plan.</span>
          </button>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-400">
            <div className="mb-1 font-semibold text-slate-200">How tokens work</div>
            <p>
              • Sourcing tokens unlock human-agent sourcing (exact quotation).
              <br />
              • Business plan tokens generate a full DOCX business plan.
              <br />
              • Each token is single use.
            </p>
          </div>
        </aside>

        {/* Content */}
        <section
          className="flex-1 min-h-0 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 sm:p-4 flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Mobile mode switcher */}
          <div className="mb-3 flex gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`
                flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ring-1
                ${
                  mode === "chat"
                    ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/35"
                    : "bg-white/5 text-slate-300 ring-white/15 hover:bg-white/10"
                }
              `}
            >
              Chat
            </button>

            <button
              type="button"
              onClick={() => setMode("businessPlan")}
              className={`
                flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ring-1
                ${
                  mode === "businessPlan"
                    ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/35"
                    : "bg-white/5 text-slate-300 ring-white/15 hover:bg-white/10"
                }
              `}
            >
              Business Plan
            </button>
          </div>

          {/* Important: make inner content min-h-0 so scroll areas behave and the send button stays visible */}
          <div className="flex-1 min-h-0">
            {mode === "chat" ? (
              <ChatMode
                messages={messages}
                input={input}
                sending={sending}
                onChangeInput={setInput}
                onSend={handleSendMessage}
                sourcingToken={sourcingToken}
                onChangeSourcingToken={setSourcingToken}
                onVerifyOrGetToken={handleVerifyOrGetToken}
                verifyLabel={
                  sourcingToken.trim() ? (verifying ? "Verifying…" : "Verify token") : "Get your token"
                }
                verifyDisabled={verifying}
                verified={isVerified}
              />
            ) : (
              <div className="h-full min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                  <BusinessPlanForm />
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Lead Capture Modal */}
      {showLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-xl shadow-black/50">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Let’s continue properly</h2>
            <p className="text-sm text-slate-400 mb-4">Please share your details so our team can support you better.</p>

            <div className="space-y-3">
              <input
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />

              <input
                value={leadWhatsapp}
                onChange={(e) => setLeadWhatsapp(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={13}
                placeholder="WhatsApp number (e.g. 8037649956)"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />

              <input
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />

              <textarea
                value={leadIntent}
                onChange={(e) => setLeadIntent(e.target.value)}
                placeholder="What do you want to source from China?"
                className="w-full min-h-[90px] resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={submitLead}
              disabled={leadSubmitting}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {leadSubmitting ? "Saving…" : "Continue with LineScout"}
            </button>

            <p className="mt-3 text-xs text-slate-500">All fields are required to continue.</p>
          </div>
        </div>
      )}

      {/* Handoff Modal */}
      {showHandoffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-xl shadow-black/50">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Ready for human agents</h2>
            <p className="text-sm text-slate-400 mb-4">Confirm your details and tell us briefly what you want to source.</p>

            <div className="space-y-3">
              <input
                value={handoffEmail}
                onChange={(e) => setHandoffEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />

              <input
                value={handoffWhatsapp}
                onChange={(e) => setHandoffWhatsapp(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={13}
                placeholder="WhatsApp number (e.g. 8037649956)"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />

              <textarea
                value={handoffContext}
                onChange={(e) => setHandoffContext(e.target.value)}
                placeholder="What are you in the market for? Mention product, capacity, location, budget if you have one."
                className="w-full min-h-[110px] resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={submitHandoff}
              disabled={handoffSubmitting}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {handoffSubmitting ? "Submitting…" : "Let’s get started"}
            </button>

            <button
              type="button"
              onClick={() => setShowHandoffModal(false)}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-900"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* UI alert modal */}
      {uiAlertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-xl shadow-black/50">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">{uiAlertTitle}</h2>
            <p className="text-sm text-slate-300 whitespace-pre-line">{uiAlertMessage}</p>

            <button
              type="button"
              onClick={() => setUiAlertOpen(false)}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type ChatModeProps = {
  messages: ChatMessage[];
  input: string;
  sending: boolean;
  onChangeInput: (v: string) => void;
  onSend: (e: React.FormEvent) => void;
  sourcingToken: string;
  onChangeSourcingToken: (v: string) => void;
  onVerifyOrGetToken: () => void;
  verifyLabel: string;
  verifyDisabled: boolean;
  verified: boolean;
};

function ChatMode({
  messages,
  input,
  sending,
  onChangeInput,
  onSend,
  sourcingToken,
  onChangeSourcingToken,
  onVerifyOrGetToken,
  verifyLabel,
  verifyDisabled,
  verified,
}: ChatModeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

return (
  // ChatMode root must be a bounded height container from parent.
  <div className="h-full min-h-0 flex flex-col">
    {/* Token strip: pin it like WhatsApp header */}
    <div className="sticky top-0 z-20">
      <TokenStrip
        sourcingToken={sourcingToken}
        onChangeSourcingToken={onChangeSourcingToken}
        onVerifyOrGetToken={onVerifyOrGetToken}
        verifyLabel={verifyLabel}
        verifyDisabled={verifyDisabled}
        verified={verified}
      />
    </div>

    {/* Messages: the ONLY scroll area */}
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 space-y-3 overflow-y-auto py-2 pr-1"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm sm:text-base ${
              m.role === "user"
                ? "rounded-br-sm bg-[#12356b] text-slate-50"
                : "rounded-bl-sm bg-slate-800 text-slate-100"
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}

      {sending && (
        <div className="flex justify-start">
          <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>LineScout is thinking…</span>
          </div>
        </div>
      )}
    </div>

    {/* Composer: pinned bottom, not affecting message scroll */}
    <form
      onSubmit={onSend}
      className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-950/95"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 10px)",
      }}
    >
      <div className="flex flex-col gap-2 px-0 pt-2">
        <textarea
          className="min-h-[70px] w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm sm:text-base text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
          placeholder="Example: Help me evaluate a 1T per hour cassava flour line for Ogun state with a budget under NGN 120M."
          value={input}
          onChange={(e) => onChangeInput(e.target.value)}
        />

        <div className="flex items-center justify-end gap-2 text-sm text-slate-500">
          <span className="hidden sm:inline mr-auto">
            LineScout is advisory. Human agents at Sure Imports handle actual product sourcing in China.
          </span>

          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="
              touch-manipulation
              inline-flex items-center justify-center
              rounded-xl
              bg-emerald-500/15
              px-5 py-2.5
              text-sm sm:text-base
              font-semibold
              text-emerald-100
              ring-1 ring-emerald-400/35
              hover:bg-emerald-500/20
              whitespace-nowrap
              disabled:opacity-60
              disabled:cursor-not-allowed
            "
          >
            {sending ? "Sending…" : "Send to LineScout"}
          </button>
        </div>
      </div>
    </form>
  </div>
);
}

type TokenStripProps = {
  sourcingToken: string;
  onChangeSourcingToken: (v: string) => void;
  onVerifyOrGetToken: () => void;
  verifyLabel: string;
  verifyDisabled: boolean;
  verified: boolean;
};

function TokenStrip({
  sourcingToken,
  onChangeSourcingToken,
  onVerifyOrGetToken,
  verifyLabel,
  verifyDisabled,
  verified,
}: TokenStripProps) {
  const [open, setOpen] = useState(false);
  const hasToken = Boolean(sourcingToken.trim());

  function onToggle() {
    setOpen((v) => !v);
  }

  return (
    <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
      {/* Header (toggle only, no nested buttons) */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3 cursor-pointer select-none"
        aria-expanded={open}
      >
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-sm sm:text-base font-semibold text-slate-100">Sourcing token</span>

          {verified ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2.5 py-1 text-xs text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Verified
            </span>
          ) : hasToken ? (
            <span className="text-xs text-slate-400">Token pasted</span>
          ) : (
            <span className="text-xs text-slate-400">Optional</span>
          )}
        </div>

        <span className="text-slate-500 text-sm">{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-slate-800">
          <div className="pt-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2 lg:items-center">
            <div className="min-w-0">
              <div className="text-sm text-slate-400 leading-relaxed">
                Paste your <span className="text-slate-200 font-semibold">sourcing token</span> to move to human agents for
                exact quotation and landing cost. You can still chat without it.
              </div>
              <div className="mt-2 text-xs text-slate-500">Tip: If you already paid, paste the token and click verify.</div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <input
                value={sourcingToken}
                onChange={(e) => onChangeSourcingToken(e.target.value)}
                placeholder="Paste sourcing token"
                className="touch-manipulation w-full sm:w-[340px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 outline-none"
              />

              <button
                type="button"
                onClick={onVerifyOrGetToken}
                disabled={verifyDisabled}
                className="
                  touch-manipulation
                  w-full sm:w-auto
                  inline-flex items-center justify-center
                  rounded-xl
                  bg-emerald-500/15
                  px-4 py-2
                  text-sm sm:text-base
                  font-semibold
                  text-emerald-100
                  ring-1 ring-emerald-400/35
                  hover:bg-emerald-500/20
                  whitespace-nowrap
                  disabled:opacity-60
                  disabled:cursor-not-allowed
                "
              >
                {verifyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}