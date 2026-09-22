import Image from "next/image";

import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { siteConfig } from "@/config/site";

export function AndroidAppDownload() {
  return (
    <Section className="sen-section py-10 sm:py-14" aria-labelledby="android-app-download-title">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-[linear-gradient(120deg,#07152f,#102b57_58%,#075985)] p-6 text-white shadow-[0_24px_70px_rgb(16_28_70/.22)] sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10">
        <div className="sen-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative z-10 flex items-start gap-4 sm:items-center">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-cyan-200/30 bg-white p-2 shadow-[0_0_26px_rgb(37_184_255/.2)]">
            <Image
              src={siteConfig.brandAsset.logo}
              alt=""
              width={160}
              height={160}
              className="h-full w-full object-contain"
            />
          </span>
          <div>
            <p className="sen-kicker w-fit">SEN ERP mobile</p>
            <h2 id="android-app-download-title" className="!text-white mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Download SEN ERP for Android
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
              Use the same SEN ERP workspace on your Android device.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[.16em] text-cyan-200">
              Version 1.0.0 · Android 8.0 or later
            </p>
          </div>
        </div>
        <div className="relative z-10 mt-6 lg:mt-0 lg:shrink-0">
          <Button
            href="/downloads/sen-erp-android.apk"
            download="sen-erp-android.apk"
            size="lg"
            className="sen-button-glow w-full sm:w-auto"
          >
            Download SEN ERP for Android <span aria-hidden="true">↓</span>
          </Button>
        </div>
      </div>
    </Section>
  );
}
