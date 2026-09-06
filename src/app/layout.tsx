import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { AnalyticsBridge } from "@/components/AnalyticsBridge";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { AdSensePathLoader } from "@/components/ads/AdSensePathLoader";
import { FunnelAnalyticsBridge } from "@/components/FunnelAnalyticsBridge";
import { JsonLd } from "@/components/JsonLd";
import { PublicChrome } from "@/components/PublicChrome";
import {
  PAGE_TITLE_DEFAULT,
  PAGE_TITLE_TEMPLATE,
} from "@/lib/page-title";
import { site } from "@/data/site";
import { auth } from "@/auth";
import { getAdminSession } from "@/lib/auth";
import { isSitePrivate } from "@/lib/flags";
import { isMemberNewsletterSubscribed } from "@/lib/member-newsletter";
import { getAllRecipes } from "@/lib/recipes";
import { recipeSearchHaystack } from "@/lib/recipe-utils";
import { siteGraphJsonLd } from "@/lib/schema";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const brandDescription = `${site.name} — ${site.description}`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: PAGE_TITLE_DEFAULT,
    template: PAGE_TITLE_TEMPLATE,
  },
  description: brandDescription,
  applicationName: site.name,
  authors: [{ name: site.name, url: site.url }],
  creator: site.name,
  publisher: site.name,
  keywords: [
    "Mesa Kitchen Studio",
    "Mesa Kitchen",
    "mesa kitchen studio recipes",
    "studio-tested recipes",
    "home cooking",
  ],
  alternates: {
    canonical: "/",
  },
  robots: isSitePrivate()
    ? { index: false, follow: false }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      },
  openGraph: {
    title: `${site.name} | ${site.tagline}`,
    description: brandDescription,
    url: site.url,
    siteName: site.name,
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: site.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} | ${site.tagline}`,
    description: brandDescription,
    images: ["/icon.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=mesa", sizes: "any" },
      { url: "/icon.png?v=mesa", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=mesa" }],
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? {
        verification: {
          google: process.env.GOOGLE_SITE_VERIFICATION,
        },
      }
    : {}),
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sitePrivate = isSitePrivate();
  const admin = await getAdminSession();
  // Staff with a valid admin session unlock public chrome while Coming Soon stays on for visitors.
  const staffPreview = sitePrivate && Boolean(admin);
  const privateMode = sitePrivate && !staffPreview;
  // OAuth Web client ID is public by design; pass from AUTH_GOOGLE_ID so One Tap
  // does not depend on a separate NEXT_PUBLIC_* build-time env.
  const googleClientId =
    process.env.AUTH_GOOGLE_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    "";
  const session = await auth();
  const memberEmail = session?.user?.email?.trim() || "";
  const newsletterSubscribed =
    Boolean(memberEmail) &&
    session?.error !== "MemberDeleted" &&
    session?.error !== "SessionRevoked" &&
    (await isMemberNewsletterSubscribed(memberEmail));
  const recipes = privateMode
    ? []
    : (await getAllRecipes()).map((recipe) => ({
        slug: recipe.slug,
        title: recipe.title,
        image: recipe.image,
        imageAlt: recipe.imageAlt,
        searchHaystack: recipeSearchHaystack(recipe),
      }));

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink">
        <a
          href="#main-content"
          className="absolute left-4 top-4 z-[100] -translate-y-[200%] rounded-sm bg-paper px-4 py-2 text-sm font-semibold text-ink shadow-md transition-transform focus:translate-y-0 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-terracotta"
        >
          Skip to main content
        </a>
        {privateMode ? null : <JsonLd data={siteGraphJsonLd()} />}
        <AnalyticsScripts />
        <AdSensePathLoader sitePrivate={sitePrivate} />
        <AnalyticsBridge />
        <AuthSessionProvider
          googleOneTapEnabled={!sitePrivate && Boolean(googleClientId)}
          googleClientId={googleClientId}
        >
          <FunnelAnalyticsBridge />
          <PublicChrome
            hideTools={privateMode}
            showChrome={!privateMode}
            recipes={recipes}
            newsletterSubscribed={newsletterSubscribed}
          >
            <main
              id="main-content"
              className={privateMode ? "flex min-h-full flex-1 flex-col" : "flex-1"}
              tabIndex={-1}
            >
              {children}
            </main>
          </PublicChrome>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
