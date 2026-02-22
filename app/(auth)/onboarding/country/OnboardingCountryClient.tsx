"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import SearchableSelect from "@/app/internal/_components/SearchableSelect";

type ProfileResponse = {
  ok?: boolean;
  country_id?: number | null;
  display_currency_code?: string | null;
  countries?: { id: number; name: string; iso2: string; default_currency_id?: number | null }[];
  currencies?: { id: number; code: string; symbol?: string | null }[];
  error?: string;
};

export default function OnboardingCountryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [countries, setCountries] = useState<ProfileResponse["countries"]>([]);
  const [currencies, setCurrencies] = useState<ProfileResponse["currencies"]>([]);
  const [countryId, setCountryId] = useState<number | "">("");
  const [displayCurrencyCode, setDisplayCurrencyCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus("loading");
      setMessage(null);
      const res = await authFetch("/api/mobile/profile");
      const json: ProfileResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load profile.");
        }
        return;
      }
      if (active) {
        setCountries(Array.isArray(json?.countries) ? json.countries : []);
        setCurrencies(Array.isArray(json?.currencies) ? json.currencies : []);
        setCountryId(typeof json?.country_id === "number" ? json.country_id : "");
        setDisplayCurrencyCode(String(json?.display_currency_code || ""));
        setFirstName(String((json as any)?.first_name || ""));
        setLastName(String((json as any)?.last_name || ""));
        setPhone(String((json as any)?.phone || ""));
        setStatus("idle");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [router]);

  function getCountryDefaultCurrency(nextCountryId: number | "") {
    if (!nextCountryId) return "";
    const country = (countries || []).find((c) => Number(c.id) === Number(nextCountryId));
    const defaultCurrencyId = country?.default_currency_id ? Number(country.default_currency_id) : null;
    if (!defaultCurrencyId) return "";
    const currency = (currencies || []).find((c) => Number(c.id) === defaultCurrencyId);
    return currency?.code ? String(currency.code) : "";
  }

  const countryOptions = useMemo(
    () =>
      [{ value: "", label: "Select country" }].concat(
        (countries || []).map((c) => ({ value: String(c.id), label: `${c.name} (${c.iso2})` }))
      ),
    [countries]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countryId) {
      setStatus("error");
      setMessage("Please select your country to continue.");
      return;
    }
    if (!firstName || !lastName) {
      setStatus("error");
      setMessage("Please complete your name to continue.");
      return;
    }

    setStatus("saving");
    setMessage(null);

    const res = await authFetch("/api/mobile/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        phone,
        country_id: countryId || null,
        display_currency_code: null,
      }),
    });

    const json: ProfileResponse = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setStatus("error");
      setMessage(json?.error || "Unable to save your country.");
      return;
    }

    const nextParam = String(searchParams.get("next") || "").trim();
    const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
    router.replace(safeNext || "/white-label/ideas");
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/90 p-8 shadow-2xl shadow-emerald-200/40 backdrop-blur">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">LineScout</p>
        <h1 className="text-3xl font-semibold text-neutral-900">Select your country</h1>
        <p className="text-sm text-neutral-600">
          We use your country to set your currency and payment options.
        </p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600">Country</label>
          <SearchableSelect
            value={countryId === "" ? "" : String(countryId)}
            onChange={(value) => {
              const next = value ? Number(value) : "";
              setCountryId(next);
              const nextCurrency = getCountryDefaultCurrency(next);
              setDisplayCurrencyCode(nextCurrency);
            }}
            options={countryOptions}
            placeholder="Select country"
            variant="light"
          />
          {displayCurrencyCode ? (
            <p className="text-[11px] text-neutral-500">Currency: {displayCurrencyCode}</p>
          ) : null}
        </div>

        {message ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {message}
          </div>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={status === "loading" || status === "saving"}>
          {status === "saving" ? "Saving..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
