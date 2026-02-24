import type { PoolConnection } from "mysql2/promise";

type RegulatorySeed = {
  category: string;
  country_iso2: "NG" | "GB" | "CA";
  note: string;
};

function normalizeIso2(value: string | null | undefined) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "UK") return "GB";
  return raw;
}

export async function ensureWhiteLabelRegulatoryNotesTable(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_white_label_regulatory_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(255) NOT NULL,
      country_iso2 VARCHAR(2) NOT NULL,
      note TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_category_country (category, country_iso2)
    )
  `);
}

const REGULATORY_SEED: RegulatorySeed[] = [
  // Beauty & Skincare (Cosmetics)
  {
    category: "Beauty & Skincare",
    country_iso2: "GB",
    note:
      "Cosmetics must be safe, have a UK Responsible Person, and be notified to OPSS before sale. Labels must show required information.",
  },
  {
    category: "Beauty & Skincare",
    country_iso2: "CA",
    note:
      "Cosmetics must be notified to Health Canada and comply with the Food and Drugs Act and Cosmetic Regulations.",
  },
  {
    category: "Beauty & Skincare",
    country_iso2: "NG",
    note:
      "Cosmetics are regulated by NAFDAC. Registration and compliance checks are required before sale.",
  },

  // Health & Medical Devices
  {
    category: "Health & Medical Devices",
    country_iso2: "GB",
    note:
      "Medical devices are regulated by MHRA. Devices must meet UK rules and be registered where required.",
  },
  {
    category: "Health & Medical Devices",
    country_iso2: "CA",
    note:
      "Medical devices are regulated by Health Canada. Many devices require licensing and establishment licences.",
  },
  {
    category: "Health & Medical Devices",
    country_iso2: "NG",
    note:
      "Medical devices are regulated by NAFDAC. Registration and compliance checks are required before sale.",
  },

  // Household Chemicals
  {
    category: "Household Chemicals",
    country_iso2: "GB",
    note:
      "Household chemical products must be safe for consumers and correctly labelled under UK product safety rules.",
  },
  {
    category: "Household Chemicals",
    country_iso2: "CA",
    note:
      "Consumer chemical products must meet Canada’s Consumer Chemicals and Containers Regulations (labeling and packaging rules).",
  },
  {
    category: "Household Chemicals",
    country_iso2: "NG",
    note:
      "Chemicals and detergents are regulated by NAFDAC. Registration and compliance checks are required before sale.",
  },

  // General consumer goods (OPSS / CCPSA / SON + FCCPC)
  {
    category: "Home & Kitchen (Non-food contact)",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Home & Kitchen (Non-food contact)",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Home & Kitchen (Non-food contact)",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
  {
    category: "Home Organization",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Home Organization",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Home Organization",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
  {
    category: "Travel Accessories",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Travel Accessories",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Travel Accessories",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
  {
    category: "Phone & Computer Accessories",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Phone & Computer Accessories",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Phone & Computer Accessories",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
  {
    category: "Baby & Kids",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Baby & Kids",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Baby & Kids",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
  {
    category: "Fitness & Wellness Accessories",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Fitness & Wellness Accessories",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Fitness & Wellness Accessories",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
  {
    category: "Stationery & Office",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Stationery & Office",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Stationery & Office",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
  {
    category: "Fashion Accessories",
    country_iso2: "GB",
    note:
      "Most consumer goods are overseen by OPSS. Products must meet UK safety requirements and correct labelling.",
  },
  {
    category: "Fashion Accessories",
    country_iso2: "CA",
    note:
      "Most consumer goods fall under the Canada Consumer Product Safety Act (CCPSA).",
  },
  {
    category: "Fashion Accessories",
    country_iso2: "NG",
    note:
      "Product standards and certification are overseen by SON; consumer protection is handled by FCCPC.",
  },
];

export async function seedWhiteLabelRegulatoryNotes(conn: PoolConnection) {
  await ensureWhiteLabelRegulatoryNotesTable(conn);
  if (!REGULATORY_SEED.length) return;
  const values = REGULATORY_SEED.map((row) => [row.category, row.country_iso2, row.note]);
  await conn.query(
    `
    INSERT INTO linescout_white_label_regulatory_notes (category, country_iso2, note)
    VALUES ?
    ON DUPLICATE KEY UPDATE note = VALUES(note)
    `,
    [values]
  );
}

export async function getWhiteLabelRegulatoryNote(
  conn: PoolConnection,
  category: string | null,
  countryIso2: string | null
) {
  await seedWhiteLabelRegulatoryNotes(conn);
  const iso2 = normalizeIso2(countryIso2);
  const cat = String(category || "").trim();
  if (!iso2 || !cat) return null;

  const [[row]]: any = await conn.query(
    `
    SELECT note
    FROM linescout_white_label_regulatory_notes
    WHERE category = ? AND country_iso2 = ?
    LIMIT 1
    `,
    [cat, iso2]
  );
  if (row?.note) return String(row.note);

  // Fallback to a generic note for the country.
  const [[fallback]]: any = await conn.query(
    `
    SELECT note
    FROM linescout_white_label_regulatory_notes
    WHERE category = 'Home & Kitchen (Non-food contact)' AND country_iso2 = ?
    LIMIT 1
    `,
    [iso2]
  );
  return fallback?.note ? String(fallback.note) : null;
}

