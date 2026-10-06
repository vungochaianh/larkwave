import { Html, Head, Main, NextScript } from 'next/document';

// Runs SYNCHRONOUSLY in <head> before the body paints, so the very first frame already
// has the right theme — no white flash on load/reload before React + ThemeProvider mount.
// Keep the two layer colors in sync with PALETTES.layer in packages/ui/src/theme.ts.
const THEME_INIT = `(function(){try{
  var m = localStorage.getItem('tw-theme');
  if (m !== 'light' && m !== 'dark') {
    m = 'light'; // default to LIGHT (ignore OS dark) — an explicit toggle to dark still wins
  }
  var r = document.documentElement;
  r.setAttribute('data-theme', m);
  r.style.backgroundColor = (m === 'dark') ? '#13151C' : '#F4F5FB';
} catch (e) {} })();`;

export default function Document() {
  return (
    <Html>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
