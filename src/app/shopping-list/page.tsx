import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingListClient } from "@/components/ShoppingListClient";
import { site } from "@/data/site";
import { isCookWithWhatYouHaveEnabled } from "@/lib/cook-with-what-you-have";
import { isShoppingListEnabled, SHOPPING_LIST_PATH } from "@/lib/shopping-list";

const DESCRIPTION =
  "Everything you've added from Mesa recipes — a simple grocery list in your browser.";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  if (!isShoppingListEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  return {
    title: "Shopping List",
    description: DESCRIPTION,
    alternates: { canonical: SHOPPING_LIST_PATH },
    robots: { index: false, follow: true },
    openGraph: {
      title: `Shopping List | ${site.name}`,
      description: DESCRIPTION,
      url: `${site.url}${SHOPPING_LIST_PATH}`,
      siteName: site.name,
      type: "website",
    },
  };
}

export default function ShoppingListPage() {
  if (!isShoppingListEnabled()) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-16 md:px-6 md:pb-20">
      <header>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Kitchen tools
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">Shopping List</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted md:mt-5">{DESCRIPTION}</p>
      </header>

      <ShoppingListClient cwywEnabled={isCookWithWhatYouHaveEnabled()} />
    </div>
  );
}
