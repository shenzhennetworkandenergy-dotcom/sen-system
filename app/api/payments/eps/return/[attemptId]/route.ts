import { NextRequest, NextResponse } from "next/server";
import { getPaymentOrigin } from "@/lib/payments/eps-config";
import { reconcileEpsAttempt } from "@/lib/payments/eps-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function returnFromEps(
  _request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await context.params;
  // Return query/body status and amount are untrusted; only EPS verification settles money.
  const attempt = await reconcileEpsAttempt(attemptId);
  return NextResponse.redirect(
    new URL(
      attempt ? `/account/orders/${attempt.order_id}/pay` : "/account/orders",
      getPaymentOrigin(),
    ),
    {
      status: 303,
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    },
  );
}
export const GET = returnFromEps;
export const POST = returnFromEps;
