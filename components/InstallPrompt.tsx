"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  // iOS Safari
  const iosStandalone = (window.navigator as any).standalone === true;

  // Modern browsers
  const displayModeStandalone =
    window.matchMedia &&
    window.matchMedia("(display-mode: standalone)").matches;

  return iosStandalone || displayModeStandalone;
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("crios");
  return isSafari;
}

export default function InstallPrompt({
  minSeconds = 90,
  minVisits = 2,
  cooldownDays = 7,
  maxShows = 3,
}: {
  minSeconds?: number;
  minVisits?: number;
  cooldownDays?: number;
  maxShows?: number;
}) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const secondsRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  const storageKeys = useMemo(() => {
    return {
      visits: "ls_a2hs_visits",
      lastShown: "ls_a2hs_last_shown",
      showCount: "ls_a2hs_show_count",
      dismissed: "ls_a2hs_dismissed_forever",
    };
  }, []);

  function getNumber(key: string) {
    const v = localStorage.getItem(key);
    return v ? Number(v) : 0;
  }

  function canShowNow() {
    if (typeof window === "undefined") return false;
    if (isStandaloneMode()) return false;

    if (localStorage.getItem(storageKeys.dismissed) === "1") return false;

    const showCount = getNumber(storageKeys.showCount);
    if (showCount >= maxShows) return false;

    const lastShown = getNumber(storageKeys.lastShown);
    if (lastShown) {
      const msSince = Date.now() - lastShown;
      const daysSince = msSince / (1000 * 60 * 60 * 24);
      if (daysSince < cooldownDays) return false;
    }

    const visits = getNumber(storageKeys.visits);
    if (visits < minVisits) return false;

    if (secondsRef.current < minSeconds) return false;

    return true;
  }

  function markShown() {
    localStorage.setItem(storageKeys.lastShown, String(Date.now()));
    localStorage.setItem(storageKeys.showCount, String(getNumber(storageKeys.showCount) + 1));
  }

  function markDismissedForever() {
    localStorage.setItem(storageKeys.dismissed, "1");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Track visits
    const visits = getNumber(storageKeys.visits) + 1;
    localStorage.setItem(storageKeys.visits, String(visits));

    // Capture Android install prompt
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // Time on app tracking
    intervalRef.current = window.setInterval(() => {
      secondsRef.current += 1;

      // Decide whether to open
      if (!open && canShowNow()) {
        // Choose platform
        const hasAndroidPrompt = !!deferredPromptRef.current;
        if (hasAndroidPrompt) setPlatform("android");
        else if (isIOS() && isSafari()) setPlatform("ios");
        else setPlatform(null);

        if (hasAndroidPrompt || (isIOS() && isSafari())) {
          markShown();
          setOpen(true);
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInstallAndroid() {
    const ev = deferredPromptRef.current;
    if (!ev) return;

    await ev.prompt();
    const choice = await ev.userChoice;

    // Clear it so it does not fire repeatedly
    deferredPromptRef.current = null;

    if (choice.outcome === "accepted") {
      setOpen(false);
    } else {
      setOpen(false);
    }
  }

  function close() {
    setOpen(false);
  }

  if (!open || !platform) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[1000]">
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/90 p-4 shadow-lg backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Add LineScout to your Home Screen</p>
            <p className="mt-1 text-sm text-white/80">
              Faster access and a more app-like experience.
            </p>

            {platform === "ios" ? (
              <p className="mt-2 text-sm text-white/80">
                On iPhone: tap <span className="font-semibold text-white">Share</span> then{" "}
                <span className="font-semibold text-white">Add to Home Screen</span>.
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {platform === "android" ? (
                <button
                  onClick={handleInstallAndroid}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
                >
                  Install
                </button>
              ) : null}

              <button
                onClick={close}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white"
              >
                Not now
              </button>

              <button
                onClick={() => {
                  markDismissedForever();
                  close();
                }}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80"
              >
                Do not show again
              </button>
            </div>
          </div>

          <button
            aria-label="Close"
            onClick={close}
            className="rounded-lg px-2 py-1 text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}