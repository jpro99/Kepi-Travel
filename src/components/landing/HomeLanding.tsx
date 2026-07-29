"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BedDouble,
  Check,
  Plane,
  Quote,
  MapPinned,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { InviteCodeForm } from "@/components/ui/InviteCodeForm";
import { appleBtnPrimary } from "@/lib/ui/appleDesign";

const pageBg = "bg-[var(--apple-bg)]";
const textPrimary = "text-[var(--apple-text)]";
const textSecondary = "text-[var(--apple-text-secondary)]";
const container = "mx-auto w-full max-w-5xl px-5 sm:px-8";
const systemFont =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif';

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=80";

const demoSlides = [
  {
    id: "stay",
    eyebrow: "Stays",
    title: "Every night covered",
    body: "Know which nights still need a place — before you leave home.",
    icon: BedDouble,
    phone: {
      label: "Trip status",
      headline: "Flights and stays set",
      rows: [
        { k: "Monopoli", v: "Sep 5 – 7" },
        { k: "Venice", v: "Sep 12 – 14" },
        { k: "Open nights", v: "Sep 8 – 11", warn: true },
      ],
    },
  },
  {
    id: "flight",
    eyebrow: "Flights",
    title: "Calm when it counts",
    body: "Leave-by times and connection checks — without the noise.",
    icon: Plane,
    phone: {
      label: "Today",
      headline: "Leave by 10:15",
      rows: [
        { k: "AS 180", v: "SEA → FCO" },
        { k: "Connection", v: "Looks fine" },
        { k: "Boards", v: "in 2h 10m" },
      ],
    },
  },
  {
    id: "airport",
    eyebrow: "Airport Mode",
    title: "One screen at the airport",
    body: "Gate, walk, and what to do next — when you’re already there.",
    icon: MapPinned,
    phone: {
      label: "At the airport",
      headline: "Gate B12",
      rows: [
        { k: "Security", v: "~18 min" },
        { k: "Walk to gate", v: "12 min" },
        { k: "Boarding", v: "1:25 PM" },
      ],
    },
  },
] as const;

const testimonials = [
  {
    name: "Maya R.",
    route: "NYC → Lisbon",
    quote:
      "Gate changed twice. Kepi quietly rerouted my steps — I boarded without sprinting.",
    icon: Plane,
  },
  {
    name: "David L.",
    route: "Chicago → Tokyo",
    quote:
      "Airport Mode felt like someone who already knew the terminal walking with me.",
    icon: MapPinned,
  },
] as const;

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-48px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function LandingNavbar({ userId }: { userId: string | null }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-black/5 bg-white/90 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className={`${container} flex h-14 items-center justify-between sm:h-16`}>
        <Link href="/" className="shrink-0" aria-label="Kepi Travel home">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {userId ? (
            <Link
              href="/travel-assistant"
              className={`${appleBtnPrimary} inline-flex min-h-[40px] items-center px-4 text-[15px] shadow-[0_0_0_0_rgba(0,122,255,0.35)] transition hover:shadow-[0_0_24px_rgba(0,122,255,0.35)]`}
            >
              Open app
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={`inline-flex min-h-[40px] items-center px-3 text-[15px] font-semibold ${
                  scrolled ? textSecondary : "text-white/90"
                } transition hover:opacity-80`}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className={`${appleBtnPrimary} inline-flex min-h-[40px] items-center px-4 text-[15px] shadow-[0_0_0_0_rgba(0,122,255,0.35)] transition hover:shadow-[0_0_24px_rgba(0,122,255,0.35)]`}
              >
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HeroSection({ userId }: { userId: string | null }) {
  const ctaHref = userId ? "/travel-assistant" : "/sign-up";

  return (
    <section
      className="relative flex min-h-[100dvh] items-end sm:items-center"
      aria-labelledby="hero-heading"
    >
      <div className="absolute inset-0">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/20"
          aria-hidden
        />
      </div>

      <div className={`relative ${container} w-full pb-16 pt-28 sm:pb-24 sm:pt-32`}>
        <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/70">Kepi</p>
        <h1
          id="hero-heading"
          className="mt-4 max-w-xl text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl"
        >
          Your trip, calmly handled.
        </h1>
        <p className="mt-4 max-w-md text-[17px] leading-relaxed text-white/85 sm:text-[19px]">
          Book anywhere. Forward confirmations. Kepi walks you through flights, stays, and the airport —
          quietly.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={ctaHref}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-white px-7 text-[17px] font-semibold text-[#007AFF] shadow-[0_8px_30px_rgba(0,0,0,0.2)] transition hover:shadow-[0_8px_40px_rgba(0,122,255,0.35)] active:scale-[0.98]"
          >
            {userId ? "Open your trip" : "Start free"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          {!userId ? (
            <Link
              href="/sign-in"
              className="inline-flex min-h-[48px] items-center justify-center px-2 text-[15px] font-semibold text-white/85 transition hover:text-white"
            >
              Sign in
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PhoneFrame({
  label,
  headline,
  rows,
}: {
  label: string;
  headline: string;
  rows: ReadonlyArray<{ k: string; v: string; warn?: boolean }>;
}) {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border border-[#E5E5EA] bg-[#F5F5F7] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
      <div className="overflow-hidden rounded-[1.5rem] bg-white">
        <div className="border-b border-[#F2F2F7] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6E6E73]">{label}</p>
          <p className="mt-1 text-[22px] font-semibold tracking-tight text-[#1D1D1F]">{headline}</p>
        </div>
        <ul className="divide-y divide-[#F2F2F7]">
          {rows.map((row) => (
            <li key={row.k} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] text-[#6E6E73]">{row.k}</span>
              <span
                className={`text-[15px] font-semibold ${
                  row.warn ? "text-[#C93400]" : "text-[#1D1D1F]"
                }`}
              >
                {row.v}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DemoCarousel() {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const touchX = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const slide = demoSlides[index]!;

  const go = useCallback(
    (next: number) => {
      setStarted(true);
      const len = demoSlides.length;
      setIndex(((next % len) + len) % len);
    },
    [],
  );

  return (
    <section
      id="demo"
      className="scroll-mt-20 bg-white py-20 sm:py-28"
      aria-labelledby="demo-heading"
    >
      <div className={container}>
        <Reveal>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6E6E73]">
            Try a day
          </p>
          <h2
            id="demo-heading"
            className="mt-3 max-w-lg text-[2rem] font-semibold tracking-tight text-[#1D1D1F] sm:text-[2.5rem]"
          >
            Real guidance. Zero overwhelm.
          </h2>
          <p className={`mt-3 max-w-md text-[17px] leading-relaxed ${textSecondary}`}>
            Swipe the phone — three moments Kepi handles for you. Tap to begin.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <div
            className="grid items-center gap-10 lg:grid-cols-2"
            onPointerDown={() => setStarted(true)}
          >
            <div
              className="relative touch-pan-y"
              onTouchStart={(e) => {
                touchX.current = e.changedTouches[0]?.clientX ?? null;
                setStarted(true);
              }}
              onTouchEnd={(e) => {
                const start = touchX.current;
                const end = e.changedTouches[0]?.clientX;
                touchX.current = null;
                if (start == null || end == null) return;
                const delta = end - start;
                if (Math.abs(delta) < 40) return;
                go(delta < 0 ? index + 1 : index - 1);
              }}
            >
              {!started ? (
                <button
                  type="button"
                  onClick={() => setStarted(true)}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/5 backdrop-blur-[1px]"
                >
                  <span className="rounded-full bg-white px-5 py-3 text-[15px] font-semibold text-[#007AFF] shadow-md">
                    Tap to preview
                  </span>
                </button>
              ) : null}
              <motion.div
                key={slide.id}
                initial={reduceMotion || !started ? false : { opacity: 0.4, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <PhoneFrame
                  label={slide.phone.label}
                  headline={slide.phone.headline}
                  rows={slide.phone.rows}
                />
              </motion.div>
            </div>

            <div>
              <div className="flex flex-wrap gap-2">
                {demoSlides.map((item, i) => {
                  const Icon = item.icon;
                  const active = i === index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(i)}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition ${
                        active
                          ? "bg-[#1D1D1F] text-white"
                          : "bg-[#F5F5F7] text-[#6E6E73] hover:text-[#1D1D1F]"
                      }`}
                      aria-current={active ? "true" : undefined}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {item.eyebrow}
                    </button>
                  );
                })}
              </div>
              <h3 className="mt-6 text-[28px] font-semibold tracking-tight text-[#1D1D1F]">
                {slide.title}
              </h3>
              <p className={`mt-2 text-[17px] leading-relaxed ${textSecondary}`}>{slide.body}</p>
              <div className="mt-6 flex gap-2" aria-hidden>
                {demoSlides.map((item, i) => (
                  <span
                    key={item.id}
                    className={`h-1.5 flex-1 rounded-full transition ${
                      i === index ? "bg-[#007AFF]" : "bg-[#E5E5EA]"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="bg-[#F5F5F7] py-20 sm:py-24" aria-labelledby="stories-heading">
      <div className={container}>
        <Reveal>
          <h2
            id="stories-heading"
            className="text-[2rem] font-semibold tracking-tight text-[#1D1D1F] sm:text-[2.25rem]"
          >
            Quiet confidence on the road
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {testimonials.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.name} delay={i * 0.06}>
                <article className="h-full rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-[#007AFF]">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold text-[#1D1D1F]">{item.name}</p>
                      <p className="text-[13px] text-[#6E6E73]">{item.route}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-[17px] leading-relaxed text-[#1D1D1F]">
                    <Quote className="mr-1 inline h-4 w-4 text-[#D2D2D7]" aria-hidden />
                    {item.quote}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PricingSection({
  userId,
  hasProAccess,
}: {
  userId: string | null;
  hasProAccess: boolean;
}) {
  const freeHref = userId ? "/travel-assistant" : "/sign-up";
  const proHref = userId ? "/billing" : "/sign-up?plan=pro";

  return (
    <section id="pricing" className="scroll-mt-20 bg-white py-20 sm:py-28" aria-labelledby="pricing-heading">
      <div className={container}>
        <Reveal>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6E6E73]">Pricing</p>
          <h2
            id="pricing-heading"
            className="mt-3 text-[2rem] font-semibold tracking-tight text-[#1D1D1F] sm:text-[2.5rem]"
          >
            Start free. Upgrade when you want more.
          </h2>
          <p className={`mt-3 max-w-lg text-[17px] ${textSecondary}`}>
            No invite required. Lifetime and invite codes live in the app when you have one.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <Reveal>
            <article className="flex h-full flex-col rounded-3xl border border-[#E5E5EA] bg-[#F5F5F7] p-6">
              <p className="text-[15px] font-semibold text-[#6E6E73]">Free</p>
              <p className="mt-2 text-[40px] font-semibold tracking-tight text-[#1D1D1F]">
                $0<span className="text-[17px] font-medium text-[#6E6E73]">/mo</span>
              </p>
              <p className={`mt-2 text-[15px] ${textSecondary}`}>One active trip. Core guidance.</p>
              <ul className="mt-6 space-y-2 text-[15px] text-[#1D1D1F]">
                {["Trip timeline & calendar", "Stay gap awareness", "Airport Mode basics"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#34C759]" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={freeHref}
                className={`${appleBtnPrimary} mt-8 inline-flex min-h-[48px] items-center justify-center text-[16px] transition hover:shadow-[0_0_24px_rgba(0,122,255,0.3)]`}
              >
                Start free
              </Link>
            </article>
          </Reveal>

          <Reveal delay={0.06}>
            <article className="flex h-full flex-col rounded-3xl bg-[#1D1D1F] p-6 text-white">
              <p className="text-[15px] font-semibold text-white/60">Pro</p>
              <p className="mt-2 text-[40px] font-semibold tracking-tight">
                $9<span className="text-[17px] font-medium text-white/50">/mo</span>
              </p>
              <p className="mt-2 text-[15px] text-white/70">
                {hasProAccess ? "You’re on Pro." : "Alerts and import when you travel often."}
              </p>
              <ul className="mt-6 space-y-2 text-[15px] text-white/90">
                {["Unlimited trips", "Email import", "Gate & delay alerts"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#34C759]" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={proHref}
                className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-white text-[16px] font-semibold text-[#1D1D1F] transition hover:shadow-[0_0_28px_rgba(255,255,255,0.35)]"
              >
                {hasProAccess ? "Manage billing" : "Start Pro"}
              </Link>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function InviteFooterSection({ userId }: { userId: string | null }) {
  if (userId) return null;
  return (
    <section className="border-t border-[#E5E5EA] bg-[#F5F5F7] py-14" aria-labelledby="invite-heading">
      <div className={`${container} max-w-xl`}>
        <Reveal>
          <h2 id="invite-heading" className="text-[20px] font-semibold text-[#1D1D1F]">
            Have an invite or lifetime code?
          </h2>
          <p className={`mt-2 text-[15px] ${textSecondary}`}>
            Optional — you can start free without one. Redeem here or later in the app.
          </p>
          <div className="mt-5">
            <InviteCodeForm />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta({ userId }: { userId: string | null }) {
  const href = userId ? "/travel-assistant" : "/sign-up";
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className={container}>
        <Reveal>
          <div className="rounded-[28px] bg-[#F5F5F7] px-6 py-14 text-center sm:px-12">
            <h2 className="mx-auto max-w-xl text-[2rem] font-semibold tracking-tight text-[#1D1D1F] sm:text-[2.5rem]">
              Travel lighter. Know more. Stress less.
            </h2>
            <p className={`mx-auto mt-3 max-w-md text-[17px] ${textSecondary}`}>
              Intelligence stays in the background. You just get the next calm step.
            </p>
            <Link
              href={href}
              className={`${appleBtnPrimary} mt-8 inline-flex min-h-[52px] items-center gap-2 px-8 text-[17px] transition hover:shadow-[0_0_28px_rgba(0,122,255,0.35)]`}
            >
              {userId ? "Open app" : "Start free"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[#E5E5EA] bg-white px-5 py-10 sm:px-8">
      <div className={`${container} flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between`}>
        <Logo size="sm" />
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          {[
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "mailto:support@kepitravel.com", label: "Support" },
          ].map((link) =>
            link.href.startsWith("mailto:") ? (
              <a
                key={link.href}
                href={link.href}
                className={`text-[14px] ${textSecondary} hover:text-[#1D1D1F]`}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[14px] ${textSecondary} hover:text-[#1D1D1F]`}
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <p className={`text-[13px] ${textSecondary}`}>
          &copy; {new Date().getFullYear()} Kepi Travel
        </p>
      </div>
    </footer>
  );
}

export interface HomeLandingProps {
  userId: string | null;
  hasProAccess: boolean;
}

export function HomeLanding({ userId, hasProAccess }: HomeLandingProps) {
  return (
    <div
      className={`min-h-screen ${pageBg} ${textPrimary} antialiased`}
      style={{ fontFamily: systemFont }}
    >
      <LandingNavbar userId={userId} />
      <main>
        <HeroSection userId={userId} />
        <DemoCarousel />
        <TestimonialsSection />
        <PricingSection userId={userId} hasProAccess={hasProAccess} />
        <InviteFooterSection userId={userId} />
        <FinalCta userId={userId} />
      </main>
      <LandingFooter />
    </div>
  );
}
