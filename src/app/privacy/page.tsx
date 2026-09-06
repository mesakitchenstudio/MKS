import type { Metadata } from "next";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${site.name} collects, uses, and retains account, newsletter, and site information.`,
  alternates: { canonical: "/privacy" },
};

const sectionClass = "border-t border-line pt-8";
const headingClass = "font-serif text-2xl leading-snug text-ink md:text-[1.65rem]";
const bodyClass = "mt-3 space-y-4 text-base leading-8 text-muted";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[46rem] px-4 py-14 md:px-6 md:py-16">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Legal
      </p>
      <h1 className="mt-2 font-serif text-5xl leading-tight text-ink">Privacy policy</h1>
      <p className="mt-5 text-base leading-8 text-muted">
        {site.name} keeps privacy practical: we store what we need to run accounts, send
        the emails you asked for, and understand how the site is used — and we explain
        what stays when you leave.
      </p>
      <p className="mt-4 text-sm leading-6 text-muted">Last updated September 6, 2026</p>

      <div className="prose-mesa mt-12 space-y-10">
        <section className={sectionClass} aria-labelledby="privacy-provide">
          <h2 id="privacy-provide" className={headingClass}>
            Information you provide
          </h2>
          <div className={bodyClass}>
            <p>
              When you create a member account we store your name, email, optional profile
              photo, and password hash if you register with email. We also store the
              recipes you save so they appear on your profile.
            </p>
            <p>
              When you write to us through the contact form, we store your name, email, and
              message so we can read and reply.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-accounts">
          <h2 id="privacy-accounts" className={headingClass}>
            Member accounts &amp; saved recipes
          </h2>
          <div className={bodyClass}>
            <p>
              Your account lets you save recipes and leave reviews. Saved recipes are tied
              to your member profile until you remove them or delete your account.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-newsletter">
          <h2 id="privacy-newsletter" className={headingClass}>
            Newsletter
          </h2>
          <div className={bodyClass}>
            <p>
              When you join the newsletter, we store your email so we can send recipes and
              studio notes you asked for. You may receive a short welcome message after
              signing up. You can unsubscribe at any time using the link in those emails,
              or by deleting your member account.
            </p>
            <p>
              After you unsubscribe, your address may remain in an unsubscribed state so we
              can honor that preference and avoid mailing you again by mistake.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-reviews">
          <h2 id="privacy-reviews" className={headingClass}>
            Reviews
          </h2>
          <div className={bodyClass}>
            <p>
              Reviews you publish on recipes are shown on the site. If you delete your
              account, published reviews may remain without a link to your former account.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-signin">
          <h2 id="privacy-signin" className={headingClass}>
            Sign-in &amp; security information
          </h2>
          <div className={bodyClass}>
            <p>
              You can sign in with Google or with email and password. We keep a record of
              how you signed in, your IP address, and approximate location from the hosting
              provider so we can understand sign-ups and keep the site secure. Session
              cookies keep you signed in while you browse.
            </p>
            <p>
              Deleting your Mesa account does not delete your Google account. That remains
              with Google under their terms.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-analytics">
          <h2 id="privacy-analytics" className={headingClass}>
            Analytics &amp; site logs
          </h2>
          <div className={bodyClass}>
            <p>
              We use first-party visitor analytics to understand which pages are useful.
              That may include a guest cookie, page views, and approximate location from
              the hosting provider. Guest network details such as IP addresses are reduced
              over time according to our retention process.
            </p>
            <p>
              Recipe pages include structured data so search engines can show cook times
              and ingredients. Embedded YouTube videos are loaded from YouTube when you
              play them.
            </p>
            <p>
              Emails we send (contact replies, newsletter, password reset) are delivered
              through our email provider when that service is configured.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-deletion">
          <h2 id="privacy-deletion" className={headingClass}>
            Account deletion
          </h2>
          <div className={bodyClass}>
            <p>
              When you delete your account from your profile, your Mesa member account and
              saved recipes are removed. Sign-in connection records for that account are
              removed as well. Published reviews may remain without a link to your former
              account. If you subscribed to email updates, your address may remain in an
              unsubscribed state so we can honor that preference.
            </p>
            <p>We do not sell personal information.</p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="privacy-contact">
          <h2 id="privacy-contact" className={headingClass}>
            Contact
          </h2>
          <div className={bodyClass}>
            <p>
              Questions about privacy:{" "}
              <a
                href={`mailto:${site.email}`}
                className="break-all font-semibold text-terracotta transition-colors hover:text-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              >
                {site.email}
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
