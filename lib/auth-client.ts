"use client";

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  return fetch(input, { ...init, headers, credentials: "include" });
}
