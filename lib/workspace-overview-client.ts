import { authFetch } from "@/lib/auth-client";

export type WorkspaceProject = {
  route_type: string;
  conversation_id: number;
  conversation_status?: string;
  handoff_id?: number | null;
  stage: string | null;
  updated_at: string;
  team_visibility?: string;
};

export type WorkspaceQuoteSummary = {
  quote_id: number;
  quote_token: string;
  product_name: string | null;
  quantity: number;
  due_amount: number;
  shipping_type: string | null;
  product_balance: number;
  shipping_balance: number;
  display_currency_code?: string | null;
  due_amount_display?: number;
  product_balance_display?: number;
  shipping_balance_display?: number;
};

export type WorkspacePayment = {
  id: number;
  purpose: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string | null;
  paid_at: string | null;
};

export type WorkspaceSummary = {
  conversation_id: number;
  handoff_id?: number | null;
  stage: string;
  summary: string | null;
  quote_summary: WorkspaceQuoteSummary | null;
  quote_summaries?: WorkspaceQuoteSummary[] | null;
  payments: WorkspacePayment[];
};

export type WorkspaceOverview = {
  ok: true;
  projects: WorkspaceProject[];
  summaries: WorkspaceSummary[];
};

const CACHE_TTL_MS = 5_000;
let cachedOverview: WorkspaceOverview | null = null;
let cachedAt = 0;
let pendingOverview: Promise<WorkspaceOverview> | null = null;

export async function getWorkspaceOverview(options?: { force?: boolean }) {
  if (
    !options?.force &&
    cachedOverview &&
    Date.now() - cachedAt < CACHE_TTL_MS
  ) {
    return cachedOverview;
  }
  if (!options?.force && pendingOverview) return pendingOverview;

  const request = (async () => {
    const response = await authFetch("/api/mobile/projects/overview");
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
      const error = new Error(json?.error || "Unable to load workspace.") as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
    const overview: WorkspaceOverview = {
      ok: true,
      projects: Array.isArray(json.projects) ? json.projects : [],
      summaries: Array.isArray(json.summaries) ? json.summaries : [],
    };
    cachedOverview = overview;
    cachedAt = Date.now();
    return overview;
  })();
  pendingOverview = request;

  try {
    return await request;
  } finally {
    pendingOverview = null;
  }
}

export function clearWorkspaceOverviewCache() {
  cachedOverview = null;
  cachedAt = 0;
  pendingOverview = null;
}
