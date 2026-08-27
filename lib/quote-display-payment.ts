export type QuotePaymentPurpose = "deposit" | "shipping_payment" | "full_product_payment" | string;

type QuoteDisplayPaymentInput = {
  purpose: QuotePaymentPurpose;
  displayCurrency: string;
  productTotalNgn: number;
  totalProductRmbWithAgent: number;
  totalShippingUsd: number;
  totalMarkupNgn: number;
  totalVatNgn: number;
  addonTotalDisplay: number;
  depositPercent: number;
  commitmentAmount: number;
  commitmentCurrency: string;
  commitmentAmountNgn: number;
  depositPaidDisplay: number;
  productPaidDisplay: number;
  shippingPaidDisplay: number;
  walletAppliedDisplay?: number;
  ngnToDisplay: number;
  rmbToDisplay: number;
  usdToDisplay: number;
};

function finite(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function roundMoney(value: number) {
  return Number(Math.max(0, finite(value)).toFixed(2));
}

export function convertQuoteAmountToDisplay(params: {
  amount: number;
  currency: string;
  displayCurrency: string;
  ngnToDisplay: number;
  usdToDisplay: number;
}) {
  const amount = finite(params.amount);
  const currency = String(params.currency || "NGN").trim().toUpperCase() || "NGN";
  const displayCurrency = String(params.displayCurrency || "NGN").trim().toUpperCase() || "NGN";
  if (amount <= 0) return 0;
  if (currency === displayCurrency) return amount;
  if (currency === "NGN") return amount * finite(params.ngnToDisplay);
  if (currency === "USD") return amount * finite(params.usdToDisplay);
  return 0;
}

export function computeQuoteDisplayPayment(input: QuoteDisplayPaymentInput) {
  const displayCurrency = String(input.displayCurrency || "NGN").trim().toUpperCase() || "NGN";
  const ngnToDisplay = displayCurrency === "NGN" ? 1 : finite(input.ngnToDisplay);
  const rmbToDisplay = finite(input.rmbToDisplay);
  const usdToDisplay = finite(input.usdToDisplay);
  const commitmentCurrency = String(input.commitmentCurrency || "NGN").trim().toUpperCase() || "NGN";
  const commitmentAmount = finite(input.commitmentAmount);
  const commitmentDisplay =
    commitmentAmount > 0 && commitmentCurrency === displayCurrency
      ? commitmentAmount
      : finite(input.commitmentAmountNgn) * ngnToDisplay;

  const productTotalDisplay =
    displayCurrency === "NGN"
      ? finite(input.productTotalNgn)
      : finite(input.totalProductRmbWithAgent) * rmbToDisplay +
        finite(input.totalMarkupNgn) * ngnToDisplay +
        finite(input.addonTotalDisplay) +
        finite(input.totalVatNgn) * ngnToDisplay;
  const productTargetDisplay = roundMoney(productTotalDisplay - commitmentDisplay);
  const depositTargetNgn = Math.round(
    (finite(input.productTotalNgn) * Math.max(0, Math.min(100, finite(input.depositPercent)))) / 100
  );
  const depositTargetDisplay = roundMoney(depositTargetNgn * ngnToDisplay);
  const shippingTargetDisplay = roundMoney(finite(input.totalShippingUsd) * usdToDisplay);
  const walletAppliedDisplay = finite(input.walletAppliedDisplay);
  const depositPaidDisplay = finite(input.depositPaidDisplay);
  const productPaidDisplay = finite(input.productPaidDisplay);
  const shippingPaidDisplay = finite(input.shippingPaidDisplay);

  const depositRemainingDisplay = roundMoney(
    depositTargetDisplay - depositPaidDisplay - walletAppliedDisplay
  );
  const productRemainingDisplay = roundMoney(
    productTargetDisplay - depositPaidDisplay - productPaidDisplay - walletAppliedDisplay
  );
  const shippingRemainingDisplay = roundMoney(
    shippingTargetDisplay - shippingPaidDisplay - walletAppliedDisplay
  );
  const remainingDisplay =
    input.purpose === "deposit"
      ? depositRemainingDisplay
      : input.purpose === "shipping_payment"
        ? shippingRemainingDisplay
        : productRemainingDisplay;

  return {
    commitmentDisplay: roundMoney(commitmentDisplay),
    productTotalDisplay: roundMoney(productTotalDisplay),
    productTargetDisplay,
    depositTargetDisplay,
    shippingTargetDisplay,
    depositRemainingDisplay,
    productRemainingDisplay,
    shippingRemainingDisplay,
    remainingDisplay,
  };
}
