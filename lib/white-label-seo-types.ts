export type WhiteLabelSeoContent = {
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  introduction: string;
  businessSummary: string;
  marketNotes: string;
  whiteLabelAngle: string;
  demandDrivers: string[];
  targetBuyers: string[];
  specifications: Array<{ label: string; guidance: string }>;
  customizationIdeas: string[];
  supplierQuestions: string[];
  qualityChecks: string[];
  sourcingRisks: Array<{ title: string; guidance: string }>;
  shippingNotes: string;
  positioningIdeas: string[];
  faqs: Array<{ question: string; answer: string }>;
  relatedSlugs?: string[];
};

export type WhiteLabelSeoValidation = {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(value: unknown, minimum: number, field: string, errors: string[]) {
  if (!Array.isArray(value) || value.length < minimum || !value.every(isNonEmptyString)) {
    errors.push(`${field} must contain at least ${minimum} non-empty items.`);
  }
}

export function isWhiteLabelSeoContent(value: unknown): value is WhiteLabelSeoContent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WhiteLabelSeoContent>;
  return (
    isNonEmptyString(item.seoTitle) &&
    isNonEmptyString(item.seoDescription) &&
    isNonEmptyString(item.introduction) &&
    isNonEmptyString(item.businessSummary) &&
    isNonEmptyString(item.marketNotes) &&
    isNonEmptyString(item.whiteLabelAngle) &&
    isNonEmptyString(item.shippingNotes) &&
    Array.isArray(item.keywords) &&
    Array.isArray(item.demandDrivers) &&
    Array.isArray(item.targetBuyers) &&
    Array.isArray(item.specifications) &&
    Array.isArray(item.customizationIdeas) &&
    Array.isArray(item.supplierQuestions) &&
    Array.isArray(item.qualityChecks) &&
    Array.isArray(item.sourcingRisks) &&
    Array.isArray(item.positioningIdeas) &&
    Array.isArray(item.faqs)
  );
}

export function parseWhiteLabelSeoContent(value: unknown): WhiteLabelSeoContent | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return isWhiteLabelSeoContent(parsed) ? parsed : null;
}

export function validateWhiteLabelSeoContent(value: unknown): WhiteLabelSeoValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const content = parseWhiteLabelSeoContent(value);
  if (!content) {
    return { valid: false, score: 0, errors: ["Content does not match the product-guide schema."], warnings };
  }

  if (content.seoTitle.length < 35 || content.seoTitle.length > 65) {
    errors.push("SEO title must contain 35 to 65 characters.");
  }
  if (content.seoDescription.length < 120 || content.seoDescription.length > 165) {
    errors.push("SEO description must contain 120 to 165 characters.");
  }
  if (content.introduction.length < 300) errors.push("Introduction must contain at least 300 characters.");
  if (content.businessSummary.length < 300) errors.push("Business summary must contain at least 300 characters.");
  if (content.marketNotes.length < 250) errors.push("Market notes must contain at least 250 characters.");
  if (content.whiteLabelAngle.length < 250) errors.push("White-label angle must contain at least 250 characters.");
  if (content.shippingNotes.length < 250) errors.push("Shipping notes must contain at least 250 characters.");

  stringList(content.keywords, 5, "keywords", errors);
  stringList(content.demandDrivers, 4, "demandDrivers", errors);
  stringList(content.targetBuyers, 4, "targetBuyers", errors);
  stringList(content.customizationIdeas, 4, "customizationIdeas", errors);
  stringList(content.supplierQuestions, 6, "supplierQuestions", errors);
  stringList(content.qualityChecks, 6, "qualityChecks", errors);
  stringList(content.positioningIdeas, 4, "positioningIdeas", errors);

  if (new Set(content.keywords.map((item) => item.toLowerCase())).size !== content.keywords.length) {
    errors.push("Keywords must be unique.");
  }
  if (
    content.specifications.length < 7 ||
    !content.specifications.every((item) => isNonEmptyString(item?.label) && isNonEmptyString(item?.guidance))
  ) {
    errors.push("Specifications must contain at least seven complete entries.");
  }
  if (
    content.sourcingRisks.length < 4 ||
    !content.sourcingRisks.every((item) => isNonEmptyString(item?.title) && isNonEmptyString(item?.guidance))
  ) {
    errors.push("Sourcing risks must contain at least four complete entries.");
  }
  if (
    content.faqs.length < 6 ||
    !content.faqs.every((item) => isNonEmptyString(item?.question) && isNonEmptyString(item?.answer))
  ) {
    errors.push("FAQs must contain at least six complete entries.");
  }

  const serialized = JSON.stringify(content);
  if (/guaranteed profit|risk[- ]free|guaranteed sales/i.test(serialized)) {
    errors.push("Unsupported commercial guarantees are not allowed.");
  }
  if (/lorem ipsum|\bTODO\b|\bTBD\b|\[insert|placeholder/i.test(serialized)) {
    errors.push("Placeholder content is not allowed.");
  }
  if (/\b(NAFDAC|SONCAP|customs duty|import permit|certified|regulatory approval|government[- ]approved)\b/i.test(serialized)) {
    warnings.push("Regulatory or certification language requires an editorial source check.");
  }
  if (/\b\d+\s*(day|days|week|weeks)\b/i.test(serialized)) {
    warnings.push("Delivery or production timelines require an editorial source check.");
  }
  if (/\$|₦|£|CA\$|\bUSD\b|\bNGN\b|\bGBP\b|\bCAD\b/.test(serialized)) {
    warnings.push("Price and currency claims require an editorial source check.");
  }

  const checks = 18;
  const score = Math.max(0, Math.round(((checks - errors.length) / checks) * 100));
  return { valid: errors.length === 0, score, errors, warnings };
}
