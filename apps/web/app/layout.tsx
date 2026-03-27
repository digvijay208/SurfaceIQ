import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "SurfaceIQ",
  description: "Authorized website security scanner for public web applications."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html data-landing-theme="dark" lang="en">
      <body className={`${display.variable} ${body.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var mode=localStorage.getItem("surfaceiq-landing-theme");document.documentElement.dataset.landingTheme=mode==="light"?"light":"dark";}catch(e){document.documentElement.dataset.landingTheme="dark";}`
          }}
        />
        {children}
      </body>
    </html>
  );
}
