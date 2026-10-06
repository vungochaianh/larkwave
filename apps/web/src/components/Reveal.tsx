"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Scroll-reveal wrapper: fades + rises its children into place the first time
 * they enter the viewport (IntersectionObserver). Pure CSS transition (class
 * `tw-reveal` / `tw-in` in globals.css); honours prefers-reduced-motion there.
 * A client island so it can wrap server-rendered children on the landing page.
 */
export default function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  /** Stagger delay in ms. */
  delay?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={shown ? "tw-reveal tw-in" : "tw-reveal"}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}
