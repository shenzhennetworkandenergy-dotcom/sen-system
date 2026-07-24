"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return false;
  if (destination.href === window.location.href) return false;
  if (
    destination.pathname === window.location.pathname &&
    destination.search === window.location.search &&
    destination.hash
  ) return false;
  return true;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setProgress(100);
      window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 180);
    };
    stop();
  }, [pathname]);

  useEffect(() => {
    const start = (label = "Loading page") => {
      if (timer.current) clearInterval(timer.current);
      setVisible(true);
      setProgress(8);
      document.documentElement.dataset.navigationState = label;
      timer.current = setInterval(() => {
        setProgress((current) => current >= 92 ? current : current + Math.max(1, Math.round((92 - current) / 7)));
      }, 180);
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (anchor && isInternalNavigation(event, anchor)) start("Loading page");
    };
    const submit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (!form.checkValidity()) return;
      start("Saving changes");
    };
    const restore = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setVisible(false);
      setProgress(0);
      delete document.documentElement.dataset.navigationState;
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    window.addEventListener("pageshow", restore);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      window.removeEventListener("pageshow", restore);
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (!visible) return null;
  return <div className="pointer-events-none fixed inset-x-0 top-0 z-[1000]" role="status" aria-live="polite" aria-label={`Loading ${progress}%`}>
    <div className="h-1 bg-slate-200/80">
      <div className="h-full bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 shadow-[0_0_14px_rgba(37,99,235,.7)] transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }}/>
    </div>
    <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-blue-950 shadow-lg backdrop-blur">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700"/>
      Loading {progress}%
    </div>
  </div>;
}
