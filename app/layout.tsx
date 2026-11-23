import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/components/data-context";
import { Shell } from "@/components/shell";
import { loadSnapshot } from "@/lib/snapshot";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Claude Code Usage",
  description: "Tokens, cost, sessions and tools across Claude Code sessions.",
};

// Applies the saved theme before first paint to avoid a flash.
const themeBoot = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <DataProvider snapshot={loadSnapshot()}>
          <Shell>{children}</Shell>
        </DataProvider>
      </body>
    </html>
  );
}
