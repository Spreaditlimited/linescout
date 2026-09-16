// Presentation policy only: historical country IDs and payment records remain intact.
export function visibleMarketCountries<T extends { iso2?: string | null; name?: string | null }>(countries: T[]): T[] {
  return countries.filter(country =>
    !["NA", "ZA"].includes(String(country.iso2 || "").trim().toUpperCase()) &&
    !["namibia", "south africa"].includes(String(country.name || "").trim().toLowerCase())
  );
}
