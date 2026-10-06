import type { Metadata } from "next";

/**
 * Marks this shared surface NON-INDEXABLE.
 *
 * The root layout sets `robots: { index: true, follow: true }` for the whole app, which is right
 * for the marketing pages but wrong here: these routes hand out a user's own content behind a
 * slug (an artifact, a chat transcript, a chat-able assistant). Letting a search engine index
 * them turns every private-ish share link into a permanently discoverable, scrapeable page — and
 * for /g it also invites anonymous LLM turns billed to the owner.
 *
 * A page.tsx here is a client component and cannot export metadata, hence this layout.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
