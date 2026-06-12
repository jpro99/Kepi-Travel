import Link from "next/link";
import { InviteCodeForm } from "@/components/ui/InviteCodeForm";
import {
  comparisonRows,
  faqs,
  featureCards,
  pricingPlans,
  testimonials,
} from "@/lib/landing/landingContent";

interface LandingMarketingProps {
  userId: string | null;
  hasProAccess: boolean;
  authCtaHref: string;
}

export function LandingMarketing({ userId, hasProAccess, authCtaHref }: LandingMarketingProps) {
  return (
    <>
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
            Invite-only beta · kepitravel.com
          </div>
          <h1
            className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
            style={{ color: "#0c2461" }}
          >
            Never miss a flight.
            <br />
            <span className="bg-gradient-to-r from-[#0c2461] via-[#1a56b0] to-[#0ea5e9] bg-clip-text text-transparent">
              Never lose your trip.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600 dark:text-slate-300">
            Kepi is your personal travel execution assistant — live flight tracking, smart alerts, AI
            guidance, and real-time family location sharing. From the moment you pack to the moment you
            land.
          </p>

          {!userId ? (
            <InviteCodeForm />
          ) : (
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/travel-assistant"
                className="rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white hover:bg-sky-500"
              >
                Open my trips →
              </Link>
              <Link
                href="/?tab=plan"
                className="rounded-xl border border-sky-300 bg-white px-6 py-3 text-sm font-bold text-sky-800 hover:bg-sky-50 dark:border-sky-500/40 dark:bg-slate-900 dark:text-sky-200 dark:hover:bg-slate-800"
              >
                Plan a trip →
              </Link>
            </div>
          )}

          {!userId ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Or{" "}
              <Link href="/?tab=plan" className="font-semibold text-sky-700 hover:text-sky-600 dark:text-sky-300">
                search flights and hotels
              </Link>{" "}
              without signing in first.
            </p>
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-sm rounded-[2.2rem] border border-slate-300 bg-slate-950 p-3 shadow-2xl shadow-cyan-500/10 dark:border-slate-700">
          <div className="rounded-[1.6rem] border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>9:41</span>
              <span>Trip status: GREEN</span>
            </div>
            <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Today</p>
              <p className="mt-1 text-sm font-semibold text-white">SFO → JFK • UA 410</p>
              <p className="text-xs text-slate-300">Depart 14:05 • Gate C12 • On time</p>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300">
                11:55 • Leave for airport in 20 min
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300">
                12:35 • TSA estimate 14 min
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300">
                13:25 • Boarding reminder + seat + carry-on check
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">Product mockup placeholder · Kepi adaptive timeline UI</p>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
            Features
          </p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Everything needed to execute trips with confidence
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureCards.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
            >
              <p className="text-2xl">{feature.icon}</p>
              <h3 className="mt-3 text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      {!hasProAccess ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-8">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
              Pricing
            </p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Choose the plan that matches your travel intensity
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <article
                key={plan.id}
                className={`relative rounded-2xl border p-5 ${
                  plan.highlighted
                    ? "border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/10"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70"
                }`}
              >
                {plan.highlighted ? (
                  <span className="absolute right-4 top-4 rounded-full bg-cyan-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">
                    Most popular
                  </span>
                ) : null}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-2 text-3xl font-semibold">
                  {plan.price}
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{plan.period}</span>
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{plan.description}</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  {plan.features.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <Link
                  href={authCtaHref}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Feature</th>
                  <th className="px-4 py-3">Free</th>
                  <th className="px-4 py-3">Pro</th>
                  <th className="px-4 py-3">Concierge</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium">{row.feature}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.free}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.pro}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.concierge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-8">
          <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-6 text-cyan-950 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-50">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Plan status</p>
            <h2 className="mt-2 text-2xl font-semibold">Your Pro access is active</h2>
            <p className="mt-2 text-sm opacity-90">
              Your account already includes paid features. Open your trip workspace to continue.
            </p>
            <Link
              href="/travel-assistant"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Open my trips
            </Link>
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
            Social proof
          </p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Trusted by travelers under real trip pressure
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <article
              key={testimonial.name}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
            >
              <p className="text-amber-500">{testimonial.stars}</p>
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">“{testimonial.quote}”</p>
              <p className="mt-4 text-sm font-semibold">{testimonial.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{testimonial.route}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">FAQ</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Common questions</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="rounded-xl border border-slate-200 bg-white p-4 open:border-cyan-400 dark:border-slate-800 dark:bg-slate-900/70"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold">
                <span className="mr-2 text-cyan-600 dark:text-cyan-300">+</span>
                {faq.question}
              </summary>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 px-4 py-8 dark:border-slate-800 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
            <Link href="/privacy" className="hover:text-cyan-700 dark:hover:text-cyan-300">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-cyan-700 dark:hover:text-cyan-300">
              Terms
            </Link>
            <a href="mailto:support@kepitravel.com" className="hover:text-cyan-700 dark:hover:text-cyan-300">
              Support
            </a>
            <a
              href="https://x.com/kepitravel"
              target="_blank"
              rel="noreferrer"
              className="hover:text-cyan-700 dark:hover:text-cyan-300"
            >
              @kepitravel
            </a>
          </nav>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            &copy; 2026 Kepi Travel &middot; Built for travelers who can&apos;t afford a miss
          </p>
        </div>
      </footer>
    </>
  );
}
