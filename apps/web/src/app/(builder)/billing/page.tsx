"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Splash from "@/components/Splash";

/**
 * Billing was merged into the unified "Gói & Thanh toán" page (/pricing), which
 * now shows the current plan + usage, the plans (with any active discount) and
 * the payment history all in one place. This route just redirects there so old
 * links / bookmarks keep working.
 */
export default function BillingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/pricing");
  }, [router]);
  return <Splash tagline="Đang mở Gói & Thanh toán…" />;
}
