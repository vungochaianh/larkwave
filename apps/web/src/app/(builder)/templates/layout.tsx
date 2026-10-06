import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Thư viện mẫu",
};

export default function TemplatesLayout({ children }: { children: ReactNode }) {
  return children;
}
