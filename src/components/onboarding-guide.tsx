"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, X } from "lucide-react";
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_STORAGE_VALUE,
} from "@/lib/onboarding";
import { PRIMARY_NAV_ITEMS } from "@/lib/primary-navigation";

export function OnboardingGuide() {
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const [hasDismissedInSession, setHasDismissedInSession] = useState(false);
  const shouldAutoOpen = useSyncExternalStore(
    subscribeToOnboardingStorage,
    getOnboardingIncomplete,
    getServerOnboardingIncomplete,
  );
  const open = isManuallyOpen || (shouldAutoOpen && !hasDismissedInSession);

  function dismissGuide() {
    try {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        ONBOARDING_STORAGE_VALUE,
      );
    } catch {
      // The guide still closes for this page when browser storage is unavailable.
    }

    setHasDismissedInSession(true);
    setIsManuallyOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setIsManuallyOpen(true);
      return;
    }

    dismissGuide();
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        className="transition-colors hover:text-[var(--term-text)] focus-visible:text-[var(--term-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--term-amber)]"
        style={{
          color: "var(--term-text-muted)",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
        }}
      >
        GUIDE
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-[var(--term-bg)] opacity-85" />
        <Dialog.Viewport className="fixed inset-0 z-[101] flex items-end justify-center sm:items-center sm:p-4">
          <Dialog.Popup
            className="relative max-h-[88dvh] w-full overflow-y-auto border border-[var(--term-border)] border-t-2 border-t-[var(--term-amber)] bg-[var(--term-surface)] p-4 text-[var(--term-text)] outline-none sm:max-w-xl sm:p-5"
            style={{ borderRadius: "var(--term-radius)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p
                  className="mono font-bold"
                  style={{
                    color: "var(--term-amber)",
                    fontSize: "11px",
                    letterSpacing: "0.08em",
                  }}
                >
                  QUICK GUIDE
                </p>
                <Dialog.Title className="mt-1 text-2xl font-bold tracking-tight">
                  Welcome to FullCourt
                </Dialog.Title>
                <Dialog.Description
                  className="mono mt-1 max-w-lg"
                  style={{
                    color: "var(--term-text-dim)",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  Five views for exploring schedule load, historical results,
                  playoff probabilities, and shot value.
                </Dialog.Description>
              </div>

              <Dialog.Close
                aria-label="Close guide"
                className="flex size-8 shrink-0 items-center justify-center border border-[var(--term-border)] text-[var(--term-text-muted)] transition-colors hover:border-[var(--term-hairline)] hover:text-[var(--term-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--term-amber)] active:translate-y-px"
                style={{ borderRadius: "var(--term-radius-sm)" }}
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <nav className="mt-4" aria-label="FullCourt page guide">
              <ul>
                {PRIMARY_NAV_ITEMS.map((item) => (
                  <li
                    key={item.href}
                    className="border-b border-[var(--term-border)] last:border-b-0"
                  >
                    <Link
                      href={item.href}
                      className="group grid grid-cols-[1fr_auto] items-center gap-4 px-1 py-3 transition-colors hover:bg-[var(--term-surface-2)] focus-visible:bg-[var(--term-surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--term-amber)]"
                      onClick={dismissGuide}
                    >
                      <span className="min-w-0">
                        <span
                          className="mono block font-bold"
                          style={{
                            color: "var(--term-text)",
                            fontSize: "12px",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {item.label}
                        </span>
                        <span
                          className="mt-1 block"
                          style={{
                            color: "var(--term-text-muted)",
                            fontSize: "12px",
                            lineHeight: 1.45,
                          }}
                        >
                          {item.guideDescription}
                        </span>
                      </span>
                      <ArrowRight
                        className="size-4 text-[var(--term-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--term-amber)]"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-4 flex justify-end">
              <Dialog.Close
                className="mono border border-[var(--term-amber)] bg-[var(--term-amber)] px-4 py-2 font-bold text-[var(--term-bg)] transition-colors hover:bg-[var(--term-hardwood)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--term-amber)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--term-surface)] active:translate-y-px"
                style={{
                  borderRadius: "var(--term-radius-sm)",
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                }}
              >
                START EXPLORING
              </Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function subscribeToOnboardingStorage(callback: () => void) {
  window.addEventListener("storage", callback);

  return () => window.removeEventListener("storage", callback);
}

function getOnboardingIncomplete() {
  try {
    return (
      window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !==
      ONBOARDING_STORAGE_VALUE
    );
  } catch {
    return true;
  }
}

function getServerOnboardingIncomplete() {
  return false;
}
