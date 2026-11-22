import type { Metadata } from "next";
import Image from "next/image";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { InstallApp } from "@/components/mobile/InstallApp";
import { mobileApp } from "@/lib/mobile/app";
import "../mobile.css";

export const metadata: Metadata = {
  title: "Get the SEN app",
  description: "Download SEN for Android or add SEN to your iPhone Home Screen. Use your existing SEN account.",
  alternates: { canonical: "/app" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SEN" },
};

export default function AppDownloadPage() {
  return <div className="public-experience sen-app-page"><PublicHeader /><main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-16">
    <div className="sen-app-hero">
      <Image src="/mobile/icon-192.png" alt="SEN" width={88} height={88} className="mx-auto rounded-2xl" priority />
      <p className="mt-5 text-sm font-bold uppercase tracking-widest text-cyan-700">SEN · Shenzhen Energy &amp; Networks</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">SEN, ready for your phone.</h1>
      <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">Products, quotations, sales and your daily workspace. The same account and access, with a home on your phone.</p>
      <p className="mt-3 text-sm text-slate-500" lang="bn">একই SEN অ্যাকাউন্ট দিয়ে মোবাইলে কাজ করুন। ইন্টারনেট সংযোগ প্রয়োজন।</p>
    </div>
    <div className="mt-10 grid gap-5 md:grid-cols-2">
      <section className="sen-app-card" aria-labelledby="android-title">
        <span className="sen-app-platform">ANDROID</span><h2 id="android-title" className="mt-3 text-2xl font-bold">Download. Install. Open SEN.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Version {mobileApp.version} · {mobileApp.minimumAndroid} · Uses your up-to-date browser.</p>
        <a href={mobileApp.download} download="sen-android-2.0.0.apk" className="sen-app-button mt-6 w-full">Download Android app <span aria-hidden="true">↓</span></a>
        <ol className="sen-app-steps mt-6"><li>Download the APK on your Android phone.</li><li>Open the file. If Android asks, allow installation from the browser you used.</li><li>Install SEN, open it and sign in with your existing account.</li></ol>
        <p className="mt-4 text-xs leading-5 text-slate-500">Keep Chrome or another compatible browser updated. Already have the SEN Android app? This version installs as an update.</p>
      </section>
      <section className="sen-app-card" aria-labelledby="iphone-title">
        <span className="sen-app-platform">IPHONE &amp; IPAD</span><h2 id="iphone-title" className="mt-3 text-2xl font-bold">Add SEN to your Home Screen.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Open SEN in Safari, then add it as a web app. No APK is needed on iPhone.</p>
        <ol className="sen-app-steps mt-6"><li>Open <strong>sen.com.bd</strong> in Safari.</li><li>Tap Safari’s <strong>Share</strong> button <span aria-hidden="true">↥</span>, then <strong>Add to Home Screen</strong>.</li><li>If shown, leave <strong>Open as Web App</strong> on. Tap <strong>Add</strong>.</li><li>Open the SEN icon and sign in.</li></ol>
        <p className="mt-5 text-sm leading-6 text-slate-600" lang="bn">Safari → Share → Add to Home Screen → Add। এরপর SEN আইকন থেকে ব্যবহার করুন।</p>
      </section>
    </div>
    <section className="sen-app-card mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-center" aria-labelledby="browser-install-title">
      <div><h2 id="browser-install-title" className="text-xl font-bold">Prefer to use your browser?</h2><p className="mt-2 text-sm leading-6 text-slate-600">SEN also works in your mobile browser. Use “Install app” or “Add to Home Screen” in its menu.</p><div className="mt-3"><InstallApp /></div></div>
      <a href="/account" className="sen-app-button sen-app-button-secondary shrink-0">Open my account →</a>
    </section>
    <p className="mt-6 text-center text-sm leading-6 text-slate-500">Your existing account permissions apply in the app. Changes appear after they are saved online.</p>
  </main><PublicFooter /></div>;
}
