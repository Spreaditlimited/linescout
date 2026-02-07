import type { PoolConnection } from "mysql2/promise";

export type WhiteLabelProductSeed = {
  product_name: string;
  category: string;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  mockup_prompt: string | null;
  image_url: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_1000: number | null;
  sort_order: number;
  is_active: 0 | 1;
};

export const WHITE_LABEL_PRICING_DEFAULTS = {
  fx_rate_ngn: 1500,
  cbm_rate_ngn: 450000,
  markup_percent: 0.2,
} as const;

export const WHITE_LABEL_PRODUCT_SEED: WhiteLabelProductSeed[] = [
  {
    product_name: 'USB-C braided cables',
    category: 'Phone & Computer Accessories',
    short_desc: 'Spare cables are a daily need for phones and power banks.',
    why_sells: 'Spare cables are a daily need for phones and power banks.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Braided USB-C cable with minimal packaging, brand name YOUR LOGO on sleeve.',
    image_url: null,
    fob_low_usd: 0.9,
    fob_high_usd: 2.5,
    cbm_per_1000: 0.5,
    sort_order: 1,
    is_active: 1,
  },
  {
    product_name: 'USB-C wall chargers (18–30W)',
    category: 'Phone & Computer Accessories',
    short_desc: 'Fast charging demand is strong across Android devices.',
    why_sells: 'Fast charging demand is strong across Android devices.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Compact 20–30W USB-C wall charger, white matte, YOUR LOGO printed.',
    image_url: null,
    fob_low_usd: 2.5,
    fob_high_usd: 4.0,
    cbm_per_1000: 0.5,
    sort_order: 2,
    is_active: 1,
  },
  {
    product_name: 'Car chargers (dual-port)',
    category: 'Phone & Computer Accessories',
    short_desc: 'Ride-hailing drivers need multi-device charging.',
    why_sells: 'Ride-hailing drivers need multi-device charging.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Dual-port car charger in black, YOUR LOGO on the side.',
    image_url: null,
    fob_low_usd: 2.0,
    fob_high_usd: 4.0,
    cbm_per_1000: 0.5,
    sort_order: 3,
    is_active: 1,
  },
  {
    product_name: 'Power banks (10,000mAh)',
    category: 'Phone & Computer Accessories',
    short_desc: 'Power outages make power banks essential.',
    why_sells: 'Power outages make power banks essential.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Slim 10,000mAh power bank, YOUR LOGO center, retail box.',
    image_url: null,
    fob_low_usd: 5.0,
    fob_high_usd: 9.0,
    cbm_per_1000: 1.0,
    sort_order: 4,
    is_active: 1,
  },
  {
    product_name: 'Tempered glass screen protectors',
    category: 'Phone & Computer Accessories',
    short_desc: 'High replacement rate and low cost impulse buy.',
    why_sells: 'High replacement rate and low cost impulse buy.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Tempered glass protector with clean box, YOUR LOGO.',
    image_url: null,
    fob_low_usd: 0.5,
    fob_high_usd: 1.8,
    cbm_per_1000: 0.5,
    sort_order: 5,
    is_active: 1,
  },
  {
    product_name: 'Phone cases (TPU)',
    category: 'Phone & Computer Accessories',
    short_desc: 'Phone case replacement cycle is frequent.',
    why_sells: 'Phone case replacement cycle is frequent.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Clear TPU case with subtle YOUR LOGO branding on packaging.',
    image_url: null,
    fob_low_usd: 0.6,
    fob_high_usd: 1.2,
    cbm_per_1000: 0.5,
    sort_order: 6,
    is_active: 1,
  },
  {
    product_name: 'Laptop sleeves',
    category: 'Phone & Computer Accessories',
    short_desc: 'Students and remote workers need protection on the go.',
    why_sells: 'Students and remote workers need protection on the go.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: '13–15 inch laptop sleeve, minimalist, YOUR LOGO stitched.',
    image_url: null,
    fob_low_usd: 2.0,
    fob_high_usd: 6.0,
    cbm_per_1000: 1.0,
    sort_order: 7,
    is_active: 1,
  },
  {
    product_name: 'Aluminum laptop stands',
    category: 'Phone & Computer Accessories',
    short_desc: 'Affordable premium desk upgrade.',
    why_sells: 'Affordable premium desk upgrade.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Adjustable aluminum laptop stand, YOUR LOGO etched.',
    image_url: null,
    fob_low_usd: 8.0,
    fob_high_usd: 15.0,
    cbm_per_1000: 1.0,
    sort_order: 8,
    is_active: 1,
  },
  {
    product_name: 'Wireless mouse',
    category: 'Phone & Computer Accessories',
    short_desc: 'Every laptop user needs a mouse.',
    why_sells: 'Every laptop user needs a mouse.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Silent-click wireless mouse, YOUR LOGO on top.',
    image_url: null,
    fob_low_usd: 8.0,
    fob_high_usd: 15.0,
    cbm_per_1000: 0.5,
    sort_order: 9,
    is_active: 1,
  },
  {
    product_name: 'Keyboard + mouse combo',
    category: 'Phone & Computer Accessories',
    short_desc: 'Home office and study setups are growing.',
    why_sells: 'Home office and study setups are growing.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Wireless keyboard + mouse set, YOUR LOGO on box.',
    image_url: null,
    fob_low_usd: 8.0,
    fob_high_usd: 15.0,
    cbm_per_1000: 1.0,
    sort_order: 10,
    is_active: 1,
  },
  {
    product_name: 'USB-C hubs (basic)',
    category: 'Phone & Computer Accessories',
    short_desc: 'Laptops with few ports need hubs.',
    why_sells: 'Laptops with few ports need hubs.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: '6-in-1 USB-C hub, YOUR LOGO on aluminum shell.',
    image_url: null,
    fob_low_usd: 6.5,
    fob_high_usd: 14.5,
    cbm_per_1000: 0.5,
    sort_order: 11,
    is_active: 1,
  },
  {
    product_name: 'Bluetooth earbuds (basic)',
    category: 'Phone & Computer Accessories',
    short_desc: 'Always-on demand for affordable audio.',
    why_sells: 'Always-on demand for affordable audio.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Budget earbuds in small case, YOUR LOGO on lid.',
    image_url: null,
    fob_low_usd: 2.0,
    fob_high_usd: 5.0,
    cbm_per_1000: 0.5,
    sort_order: 12,
    is_active: 1,
  },
  {
    product_name: 'Cable organizers / tech pouches',
    category: 'Phone & Computer Accessories',
    short_desc: 'Easy add-on with good perceived value.',
    why_sells: 'Easy add-on with good perceived value.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Compact tech pouch, YOUR LOGO on patch.',
    image_url: null,
    fob_low_usd: 1.5,
    fob_high_usd: 3.0,
    cbm_per_1000: 0.5,
    sort_order: 13,
    is_active: 1,
  },
  {
    product_name: 'Phone stands',
    category: 'Phone & Computer Accessories',
    short_desc: 'Cheap accessory for desks and video calls.',
    why_sells: 'Cheap accessory for desks and video calls.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Foldable phone stand, YOUR LOGO on base.',
    image_url: null,
    fob_low_usd: 0.8,
    fob_high_usd: 1.5,
    cbm_per_1000: 0.5,
    sort_order: 14,
    is_active: 1,
  },
  {
    product_name: 'Webcam covers + privacy filters',
    category: 'Phone & Computer Accessories',
    short_desc: 'Remote work privacy add-on.',
    why_sells: 'Remote work privacy add-on.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Webcam cover set with YOUR LOGO on card.',
    image_url: null,
    fob_low_usd: 0.5,
    fob_high_usd: 1.0,
    cbm_per_1000: 0.5,
    sort_order: 15,
    is_active: 1,
  },
  {
    product_name: 'Smart plugs',
    category: 'Tech / Smart Utility',
    short_desc: 'Low-cost smart home starter.',
    why_sells: 'Low-cost smart home starter.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Wi-Fi smart plug, YOUR LOGO on box.',
    image_url: null,
    fob_low_usd: 4.0,
    fob_high_usd: 9.0,
    cbm_per_1000: 0.5,
    sort_order: 16,
    is_active: 1,
  },
  {
    product_name: 'Motion sensor night lights',
    category: 'Tech / Smart Utility',
    short_desc: 'Popular for bedrooms and hallways.',
    why_sells: 'Popular for bedrooms and hallways.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Rechargeable night light, YOUR LOGO on base.',
    image_url: null,
    fob_low_usd: 1.8,
    fob_high_usd: 4.2,
    cbm_per_1000: 0.5,
    sort_order: 17,
    is_active: 1,
  },
  {
    product_name: 'Portable LED desk lamp',
    category: 'Tech / Smart Utility',
    short_desc: 'Useful for study and power outages.',
    why_sells: 'Useful for study and power outages.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Rechargeable desk lamp, YOUR LOGO on stem.',
    image_url: null,
    fob_low_usd: 4.0,
    fob_high_usd: 10.0,
    cbm_per_1000: 1.0,
    sort_order: 18,
    is_active: 1,
  },
  {
    product_name: 'Mini handheld vacuum',
    category: 'Tech / Smart Utility',
    short_desc: 'Car owners like quick clean-ups.',
    why_sells: 'Car owners like quick clean-ups.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Compact handheld vacuum, YOUR LOGO on body.',
    image_url: null,
    fob_low_usd: 8.0,
    fob_high_usd: 15.0,
    cbm_per_1000: 1.0,
    sort_order: 19,
    is_active: 1,
  },
  {
    product_name: 'Bluetooth speaker (mini)',
    category: 'Tech / Smart Utility',
    short_desc: 'Outdoor and social listening culture.',
    why_sells: 'Outdoor and social listening culture.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Mini Bluetooth speaker, YOUR LOGO on grille.',
    image_url: null,
    fob_low_usd: 3.0,
    fob_high_usd: 8.0,
    cbm_per_1000: 1.0,
    sort_order: 20,
    is_active: 1,
  },
  {
    product_name: 'Digital kitchen scale',
    category: 'Tech / Smart Utility',
    short_desc: 'Home bakers and diet tracking.',
    why_sells: 'Home bakers and diet tracking.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Slim digital scale, YOUR LOGO on glass surface.',
    image_url: null,
    fob_low_usd: 2.8,
    fob_high_usd: 6.5,
    cbm_per_1000: 1.0,
    sort_order: 21,
    is_active: 1,
  },
  {
    product_name: 'Rechargeable torch/flashlight',
    category: 'Tech / Smart Utility',
    short_desc: 'Power outages make torches essential.',
    why_sells: 'Power outages make torches essential.',
    regulatory_note: 'Non-regulated (electronics).',
    mockup_prompt: 'Rechargeable torch, YOUR LOGO on side.',
    image_url: null,
    fob_low_usd: 2.0,
    fob_high_usd: 5.0,
    cbm_per_1000: 0.5,
    sort_order: 22,
    is_active: 1,
  },
  {
    product_name: 'Mini tripod + phone mount',
    category: 'Tech / Smart Utility',
    short_desc: 'Content creators need stable shots.',
    why_sells: 'Content creators need stable shots.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Mini tripod with phone mount, YOUR LOGO on box.',
    image_url: null,
    fob_low_usd: 1.5,
    fob_high_usd: 4.0,
    cbm_per_1000: 0.5,
    sort_order: 23,
    is_active: 1,
  },
  {
    product_name: 'Resistance band set',
    category: 'Fitness / Wellness',
    short_desc: 'Affordable home fitness option.',
    why_sells: 'Affordable home fitness option.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Resistance band set, YOUR LOGO on pouch.',
    image_url: null,
    fob_low_usd: 2.5,
    fob_high_usd: 6.0,
    cbm_per_1000: 0.5,
    sort_order: 24,
    is_active: 1,
  },
  {
    product_name: 'Jump rope',
    category: 'Fitness / Wellness',
    short_desc: 'Simple, low-cost cardio tool.',
    why_sells: 'Simple, low-cost cardio tool.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Speed jump rope, YOUR LOGO on handle.',
    image_url: null,
    fob_low_usd: 1.0,
    fob_high_usd: 3.0,
    cbm_per_1000: 0.5,
    sort_order: 25,
    is_active: 1,
  },
  {
    product_name: 'Exercise / yoga mat (PVC)',
    category: 'Fitness / Wellness',
    short_desc: 'Growing fitness trend and visible branding.',
    why_sells: 'Growing fitness trend and visible branding.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Yoga mat with centered YOUR LOGO print.',
    image_url: null,
    fob_low_usd: 5.0,
    fob_high_usd: 9.0,
    cbm_per_1000: 6.0,
    sort_order: 26,
    is_active: 1,
  },
  {
    product_name: 'Massage gun (budget)',
    category: 'Fitness / Wellness',
    short_desc: 'Premium feel at mid price.',
    why_sells: 'Premium feel at mid price.',
    regulatory_note: 'Low-regulated (electronics).',
    mockup_prompt: 'Budget massage gun, YOUR LOGO on case.',
    image_url: null,
    fob_low_usd: 18.0,
    fob_high_usd: 32.0,
    cbm_per_1000: 1.0,
    sort_order: 27,
    is_active: 1,
  },
  {
    product_name: 'Wrist / ankle weights',
    category: 'Fitness / Wellness',
    short_desc: 'Simple add-on for home workouts.',
    why_sells: 'Simple add-on for home workouts.',
    regulatory_note: 'Non-regulated.',
    mockup_prompt: 'Adjustable ankle weights, YOUR LOGO on tag.',
    image_url: null,
    fob_low_usd: 4.0,
    fob_high_usd: 8.0,
    cbm_per_1000: 1.0,
    sort_order: 28,
    is_active: 1,
  },
  {
    product_name: 'Sports water bottle (Tritan)',
    category: 'Fitness / Wellness',
    short_desc: 'Everyday essential, easy branding.',
    why_sells: 'Everyday essential, easy branding.',
    regulatory_note: 'Non-regulated (food-contact plastic).',
    mockup_prompt: 'Tritan bottle with YOUR LOGO print.',
    image_url: null,
    fob_low_usd: 1.2,
    fob_high_usd: 2.5,
    cbm_per_1000: 1.0,
    sort_order: 29,
    is_active: 1,
  },
  {
    product_name: 'Posture corrector',
    category: 'Fitness / Wellness',
    short_desc: 'Strong online demand for desk posture.',
    why_sells: 'Strong online demand for desk posture.',
    regulatory_note: 'Low-regulated (wearable).',
    mockup_prompt: 'Posture corrector with YOUR LOGO on packaging.',
    image_url: null,
    fob_low_usd: 2.0,
    fob_high_usd: 6.0,
    cbm_per_1000: 0.5,
    sort_order: 30,
    is_active: 1,
  },
];

export async function ensureWhiteLabelProductsTable(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_white_label_products (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      product_name VARCHAR(140) NOT NULL,
      category VARCHAR(80) NOT NULL,
      short_desc VARCHAR(280) NULL,
      why_sells VARCHAR(280) NULL,
      regulatory_note VARCHAR(160) NULL,
      mockup_prompt TEXT NULL,
      image_url VARCHAR(512) NULL,
      fob_low_usd DECIMAL(10,2) NULL,
      fob_high_usd DECIMAL(10,2) NULL,
      cbm_per_1000 DECIMAL(10,3) NULL,
      is_active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_wl_active (is_active),
      INDEX idx_wl_category (category),
      INDEX idx_wl_sort (sort_order)
    )
  `);
}

export async function seedWhiteLabelProducts(conn: PoolConnection) {
  const [rows]: any = await conn.query(
    `SELECT COUNT(1) AS count FROM linescout_white_label_products`
  );
  const count = Number(rows?.[0]?.count || 0);
  if (count > 0) return;

  for (const item of WHITE_LABEL_PRODUCT_SEED) {
    await conn.query(
      `
      INSERT INTO linescout_white_label_products
        (product_name, category, short_desc, why_sells, regulatory_note, mockup_prompt, image_url, fob_low_usd, fob_high_usd, cbm_per_1000, is_active, sort_order)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        item.product_name,
        item.category,
        item.short_desc,
        item.why_sells,
        item.regulatory_note,
        item.mockup_prompt,
        item.image_url,
        item.fob_low_usd,
        item.fob_high_usd,
        item.cbm_per_1000,
        item.is_active,
        item.sort_order,
      ]
    );
  }
}

export function computeLandedRange(opts: {
  fob_low_usd?: number | string | null;
  fob_high_usd?: number | string | null;
  cbm_per_1000?: number | string | null;
  fx_rate_ngn?: number | string;
  cbm_rate_ngn?: number | string;
  markup_percent?: number | string;
}) {
  const fxRaw = Number(opts.fx_rate_ngn);
  const cbmRateRaw = Number(opts.cbm_rate_ngn);
  const markupRaw = Number(opts.markup_percent);
  const cbmRaw = Number(opts.cbm_per_1000);

  const fx = Number.isFinite(fxRaw) ? fxRaw : WHITE_LABEL_PRICING_DEFAULTS.fx_rate_ngn;
  const cbmRate = Number.isFinite(cbmRateRaw) ? cbmRateRaw : WHITE_LABEL_PRICING_DEFAULTS.cbm_rate_ngn;
  const markup = Number.isFinite(markupRaw) ? markupRaw : WHITE_LABEL_PRICING_DEFAULTS.markup_percent;
  const cbm = Number.isFinite(cbmRaw) ? cbmRaw : 0;
  const freightPerUnit = cbm > 0 ? (cbm * cbmRate) / 1000 : 0;

  function compute(val?: number | string | null) {
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    const base = n * fx + freightPerUnit;
    const landed = base * (1 + markup);
    return landed;
  }

  const low = compute(opts.fob_low_usd ?? null);
  const high = compute(opts.fob_high_usd ?? null);

  return {
    freight_per_unit_ngn: freightPerUnit,
    landed_ngn_per_unit_low: low,
    landed_ngn_per_unit_high: high,
    landed_ngn_total_1000_low: low != null ? low * 1000 : null,
    landed_ngn_total_1000_high: high != null ? high * 1000 : null,
  };
}
