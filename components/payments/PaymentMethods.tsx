import Image from "next/image";
import { availableEpsGateway } from "@/lib/payments/eps-server";
export async function PaymentMethods() {
  const gateway = await availableEpsGateway();
  if (!gateway) return null;
  return (
    <section
      aria-label="Online payments"
      className="border-t border-white/10 py-5"
    >
      <p className="mb-3 text-center text-sm text-slate-300">
        Secure online checkout with EPS{" "}
        {gateway.test_mode
          ? "· Sandbox demonstration"
          : "· Available methods are shown at checkout"}
      </p>
      <Image
        src="/payments/eps-payment-methods.png"
        width={7832}
        height={402}
        alt="Payment channels supported by EPS"
        className="h-auto w-full rounded-lg"
      />
    </section>
  );
}
