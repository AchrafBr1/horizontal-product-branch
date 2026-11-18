import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "HPB Markup · Next.js",
  description: "Horizontal Product Branch diagrams rendered from text with @hpb/react.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <a href="/">Server-rendered</a>
          <a href="/interactive">Interactive</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
