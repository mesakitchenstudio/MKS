import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { JsonLd } from "@/components/JsonLd";
import { PublicChrome } from "@/components/PublicChrome";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { site } from "@/data/site";
import { isSitePrivate } from "@/lib/flags";
import { organizationJsonLd } from "@/lib/schema";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  icons: {
    icon: [
      { url: "/favicon.ico?v=mesa", sizes: "any" },
      { url: "/icon.png?v=mesa", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=mesa" }],
  },
  openGraph: {
    title: site.name,
    description: site.description,
    url: site.url,
    siteName: site.name,
    locale: "en_US",
    type: "website",
    images: [{ url: "/icon.png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const privateMode = isSitePrivate();

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink">
        {privateMode ? null : <JsonLd data={organizationJsonLd()} />}
        <PublicChrome
          header={privateMode ? null : <SiteHeader />}
          footer={privateMode ? null : <SiteFooter />}
        >
          <main className={privateMode ? "flex min-h-full flex-1 flex-col" : "flex-1"}>
            {children}
          </main>
        </PublicChrome>
      </body>
    </html>
  );
}
