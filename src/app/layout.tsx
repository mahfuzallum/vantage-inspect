import type { ReactNode } from "react";
import localFont from "next/font/local";
import { rootMetadata } from "@/lib/seo/metadata";
import { jsonLdScript, websiteJsonLd } from "@/lib/seo/structured-data";
import { AuthProvider } from "./providers";
import "./globals.css";

/**
 * Three roles, three faces: Space Grotesk for display (tight, slightly
 * mechanical), Inter for reading, JetBrains Mono for the timecode metadata
 * that runs through the whole interface.
 *
 * Self-hosted rather than fetched from Google Fonts. Browser QA found that an
 * unreachable font CDN threw during render and took down every page using the
 * root layout — a third-party host had become a hard boot dependency. These are
 * the same typefaces, served from ./fonts. See ./fonts/README.md.
 *
 * Each is a variable font, so the full weight axis is still available and the
 * rendering is unchanged.
 */
const display = localFont({
  src: [
    { path: "./fonts/space-grotesk-latin-wght-normal.woff2", style: "normal" },
    { path: "./fonts/space-grotesk-latin-ext-wght-normal.woff2", style: "normal" },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
  // Matches the metrics of the fallback so swapping in the real face does not
  // shift layout — the same protection next/font/google applied.
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const body = localFont({
  src: [
    { path: "./fonts/inter-latin-wght-normal.woff2", style: "normal" },
    { path: "./fonts/inter-latin-ext-wght-normal.woff2", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const mono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-latin-wght-normal.woff2", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-ext-wght-normal.woff2", style: "normal" },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata = rootMetadata;

export const viewport = {
  themeColor: "#0c0d10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AuthProvider>{children}</AuthProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
      </body>
    </html>
  );
}
