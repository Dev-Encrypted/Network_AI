// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "NETWORK AI · Laboratório",
  description:
    "Rede de inferência comunitária. Ambiente privado de desenvolvimento por Dev-Encrypted.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
