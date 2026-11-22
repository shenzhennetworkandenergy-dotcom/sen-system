import Image from "next/image";

export function MobileAppDownload() {
  return <section id="mobile-app" className="sen-app-home" aria-labelledby="mobile-app-title">
    <div className="sen-app-home-inner">
      <Image src="/mobile/icon-192.png" alt="" width={80} height={80} className="rounded-2xl" />
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-cyan-200">SEN on your phone</p><h2 id="mobile-app-title" className="!text-white mt-1 text-2xl font-bold">Your workspace. Wherever you are.</h2><p className="mt-2 text-sm leading-6 text-slate-200">Download the Android app, or add SEN to your iPhone Home Screen. Sign in with your existing SEN account.</p></div>
      <a href="/app" className="sen-app-button sen-app-button-light">Get the SEN app <span aria-hidden="true">↗</span></a>
    </div>
  </section>;
}
