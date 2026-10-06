import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Apps",
};

export default function AppsLayout({ children }: { children: ReactNode }) {
  return children;
}
