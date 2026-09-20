"use client";

import { useEffect, useState } from "react";

const AGE_GATE_COOKIE = "vantage_age_verified";
const AGE_GATE_MAX_AGE = 60 * 60 * 24 * 30;

function hasAgeVerification() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${AGE_GATE_COOKIE}=`));
}

function setAgeVerification() {
  document.cookie = [
    `${AGE_GATE_COOKIE}=1`,
    "Path=/",
    `Max-Age=${AGE_GATE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}

export default function AgeGate() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (hasAgeVerification()) {
      setVisible(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!visible) {
    return null;
  }

  const handleContinue = () => {
    setAgeVerification();
    document.body.style.overflow = "";
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#07050d]">
      {/* Background */}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#120b1d_0%,#090812_45%,#05060b_100%)]" />

      {/* Vantage purple glow */}
      <div className="pointer-events-none absolute left-[50%] top-[-12%] h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-violet-500/[0.14] blur-[130px]" />

      <div className="pointer-events-none absolute bottom-[-15%] left-[-10%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/[0.08] blur-[130px]" />

      <div className="pointer-events-none absolute bottom-[-10%] right-[-8%] h-[380px] w-[380px] rounded-full bg-cyan-400/[0.06] blur-[130px]" />

      {/* Subtle grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:44px_44px]" />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_24%,rgba(0,0,0,0.68)_100%)]" />

      {/* Content */}
      <div className="relative flex min-h-screen items-center justify-center px-5 py-8">
        <div className="flex w-full max-w-[760px] flex-col items-center text-center">

          {/* Vantage logo */}
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-[13px] border border-violet-300/20 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 shadow-[0_0_45px_rgba(139,92,246,0.16)]">
            <div className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-white/50">
              <span className="font-display text-[11px] font-bold text-white">
                V
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="max-w-[690px] text-[11px] leading-5 text-white/35 sm:text-[13px]">
            Millions of archive videos of cam models around the world on
            Archivebate - the home to the world's best webcam archive videos
            platform.
          </p>

          {/* RTA + 18+ */}
          <div className="mt-4 flex items-center justify-center gap-6 sm:gap-8">
            <div className="flex flex-col items-center leading-none">
              <span className="font-sans text-[45px] font-black tracking-[-0.10em] text-white sm:text-[52px]">
                RTA
              </span>

              <span className="-mt-0.5 text-[4px] font-bold uppercase tracking-[0.22em] text-white/80">
                RESTRICTED TO ADULTS
              </span>
            </div>

            <span className="font-sans text-[48px] font-light leading-none tracking-[-0.06em] text-white sm:text-[56px]">
              18+
            </span>
          </div>

          {/* Continue */}
          <button
            type="button"
            onClick={handleContinue}
            className="group mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 bg-[length:180%_100%] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_14px_36px_rgba(139,92,246,0.24)] transition duration-300 hover:-translate-y-0.5 hover:bg-right hover:shadow-[0_18px_42px_rgba(139,92,246,0.32)] focus:outline-none focus:ring-2 focus:ring-violet-300/50"
          >
            <span>Continue</span>

            <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full border border-white/80 text-[9px] leading-none transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </button>

          {/* Compliance statement */}
          <p className="mt-6 text-[10px] font-medium text-violet-300/80 sm:text-[11px]">
            18 U.S.C. 2257 Record Keeping Requirements Compliance Statement
          </p>

          {/* Warning text */}
          <p className="mt-4 text-[11px] font-semibold leading-5 text-white/80 sm:text-[13px]">
            The sites contains sexually explicit material, enter only if you
            are over 18
          </p>

          {/* Small Vantage footer */}
          <div className="mt-7 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.7)]" />

            <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-white/20">
              Vantage Archive
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}