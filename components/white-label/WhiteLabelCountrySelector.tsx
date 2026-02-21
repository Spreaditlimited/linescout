"use client";

import SearchableSelect from "@/app/internal/_components/SearchableSelect";

type Option = { value: string; label: string };

function setCookie(value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `wl_country=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export default function WhiteLabelCountrySelector({
  value,
  className = "",
  options,
}: {
  value: string;
  className?: string;
  options: Option[];
}) {
  return (
    <div className={className}>
      <SearchableSelect
        value={value}
        onChange={(next) => {
          setCookie(next);
          window.location.reload();
        }}
        options={options}
        placeholder="Select country"
        variant="light"
      />
      <p className="mt-1 text-xs text-neutral-500">Pricing uses sea freight estimates.</p>
    </div>
  );
}
