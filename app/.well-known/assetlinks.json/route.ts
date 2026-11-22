import { mobileApp } from "@/lib/mobile/app";

export function GET() {
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: mobileApp.packageName,
        sha256_cert_fingerprints: [mobileApp.certificate],
      },
    },
  ], { headers: { "Cache-Control": "public, max-age=3600" } });
}
