"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import { ChevronDown } from "lucide-react";

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

type ProjectRow = {
  route_type: string;
  conversation_id: number;
  conversation_status: string;
  handoff_id: number | null;
  stage: string | null;
  has_active_project: boolean;
  updated_at: string;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [routeOpen, setRouteOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [stageQuery, setStageQuery] = useState("");
  const [routeActive, setRouteActive] = useState(0);
  const [stageActive, setStageActive] = useState(0);
  const routeRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery = query
        ? String(project.handoff_id || project.conversation_id)
            .toLowerCase()
            .includes(query.toLowerCase()) ||
          String(project.stage || "")
            .toLowerCase()
            .includes(query.toLowerCase())
        : true;
      const matchesRoute = routeFilter === "all" || project.route_type === routeFilter;
      const matchesStage = stageFilter === "all" || (project.stage || "pending") === stageFilter;
      return matchesQuery && matchesRoute && matchesStage;
    });
  }, [projects, query, routeFilter, stageFilter]);

  const hasProjects = useMemo(() => filtered.length > 0, [filtered]);

  const routeOptions = useMemo(
    () => [
      { value: "all", label: "All routes" },
      { value: "machine_sourcing", label: "Machine sourcing" },
      { value: "white_label", label: "White label" },
    ],
    []
  );

  const stageOptions = useMemo(
    () => [
      { value: "all", label: "All stages" },
      { value: "pending", label: "Pending" },
      { value: "claimed", label: "Claimed" },
      { value: "in_progress", label: "In progress" },
      { value: "completed", label: "Completed" },
    ],
    []
  );

  const filteredRouteOptions = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    if (!q) return routeOptions;
    return routeOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [routeQuery, routeOptions]);

  const filteredStageOptions = useMemo(() => {
    const q = stageQuery.trim().toLowerCase();
    if (!q) return stageOptions;
    return stageOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [stageQuery, stageOptions]);

  useEffect(() => {
    if (!routeOpen) return;
    const idx = Math.max(
      0,
      filteredRouteOptions.findIndex((opt) => opt.value === routeFilter)
    );
    setRouteActive(idx >= 0 ? idx : 0);
  }, [routeOpen, routeFilter, filteredRouteOptions]);

  useEffect(() => {
    if (!stageOpen) return;
    const idx = Math.max(
      0,
      filteredStageOptions.findIndex((opt) => opt.value === stageFilter)
    );
    setStageActive(idx >= 0 ? idx : 0);
  }, [stageOpen, stageFilter, filteredStageOptions]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (routeRef.current && !routeRef.current.contains(target)) setRouteOpen(false);
      if (stageRef.current && !stageRef.current.contains(target)) setStageOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus("loading");
      setMessage(null);

      const res = await authFetch("/api/mobile/projects");
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load projects.");
        }
        return;
      }

      if (active) {
        setProjects(Array.isArray(json?.projects) ? json.projects : []);
        setStatus("idle");
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Projects</h1>
          <p className="mt-1 text-sm text-neutral-600">Track paid sourcing projects and milestones.</p>
        </div>
        <div />
      </div>

      <div className="mt-6 grid gap-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by project ID or stage"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <div ref={routeRef} className="relative">
              <button
                type="button"
                onClick={() => setRouteOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <span>{routeFilter === "all" ? "All routes" : routeFilter.replace("_", " ")}</span>
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              </button>
              {routeOpen ? (
                <div
                  className="absolute z-10 mt-2 w-full rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setRouteActive((i) =>
                        Math.min(i + 1, Math.max(filteredRouteOptions.length - 1, 0))
                      );
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setRouteActive((i) => Math.max(i - 1, 0));
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const opt = filteredRouteOptions[routeActive];
                      if (opt) {
                        setRouteFilter(opt.value);
                        setRouteOpen(false);
                        setRouteQuery("");
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRouteOpen(false);
                    }
                  }}
                >
                  <input
                    type="text"
                    value={routeQuery}
                    onChange={(e) => setRouteQuery(e.target.value)}
                    placeholder="Search routes"
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <div className="mt-2 max-h-48 overflow-y-auto">
                    {filteredRouteOptions.length === 0 ? (
                      <div className="rounded-xl px-3 py-2 text-xs text-neutral-500">
                        No routes found.
                      </div>
                    ) : (
                      filteredRouteOptions.map((item, index) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setRouteFilter(item.value);
                        setRouteOpen(false);
                        setRouteQuery("");
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                        routeFilter === item.value || routeActive === index
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      <span>{item.label}</span>
                      {routeFilter === item.value ? (
                        <span className="text-emerald-600">Selected</span>
                      ) : null}
                    </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div ref={stageRef} className="relative">
              <button
                type="button"
                onClick={() => setStageOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <span>{stageFilter === "all" ? "All stages" : stageFilter.replace("_", " ")}</span>
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              </button>
              {stageOpen ? (
                <div
                  className="absolute z-10 mt-2 w-full rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setStageActive((i) =>
                        Math.min(i + 1, Math.max(filteredStageOptions.length - 1, 0))
                      );
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setStageActive((i) => Math.max(i - 1, 0));
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const opt = filteredStageOptions[stageActive];
                      if (opt) {
                        setStageFilter(opt.value);
                        setStageOpen(false);
                        setStageQuery("");
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setStageOpen(false);
                    }
                  }}
                >
                  <input
                    type="text"
                    value={stageQuery}
                    onChange={(e) => setStageQuery(e.target.value)}
                    placeholder="Search stages"
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <div className="mt-2 max-h-48 overflow-y-auto">
                    {filteredStageOptions.length === 0 ? (
                      <div className="rounded-xl px-3 py-2 text-xs text-neutral-500">
                        No stages found.
                      </div>
                    ) : (
                      filteredStageOptions.map((item, index) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setStageFilter(item.value);
                        setStageOpen(false);
                        setStageQuery("");
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                        stageFilter === item.value || stageActive === index
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      <span>{item.label}</span>
                      {stageFilter === item.value ? (
                        <span className="text-emerald-600">Selected</span>
                      ) : null}
                    </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {status === "loading" ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
              <div className="h-16 w-full rounded-2xl bg-neutral-100" />
              <div className="h-16 w-full rounded-2xl bg-neutral-100" />
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {message}
          </div>
        ) : null}

        {status === "idle" && !hasProjects ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-sm">
            <p>No projects yet. Once a project is activated, it will appear here.</p>
          </div>
        ) : null}

        {filtered.map((project) => (
          <Link
            key={project.conversation_id}
            href={`/projects/${project.conversation_id}`}
            className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  {project.route_type?.replace("_", " ") || "Project"}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-neutral-900">
                  Project #{project.handoff_id || project.conversation_id}
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Stage: <span className="font-semibold text-neutral-800">{project.stage || "pending"}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Updated {formatter.format(new Date(project.updated_at))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
