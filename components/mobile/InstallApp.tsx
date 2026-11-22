"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    update();
    standalone.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      standalone.removeEventListener("change", update);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setMessage("Follow your browser’s installation instructions.");
    } catch { setMessage("Use your browser menu to add SEN to your home screen."); }
    setPrompt(null);
  }
  return <div className="space-y-3">
    {installed ? <p role="status" className="font-semibold text-emerald-700">SEN is open as an installed app.</p> : prompt ? <button type="button" onClick={install} className="sen-app-button sen-app-button-secondary">Add SEN to this device</button> : null}
    <p role="status" className="text-sm text-slate-600">{message}</p>
  </div>;
}
