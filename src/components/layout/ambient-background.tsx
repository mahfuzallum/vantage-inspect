/**
 * Ambient background used behind every public page.
 *
 * Three soft, blurred glows drift slowly and independently — the "living"
 * feel the site was missing came from motion, not from more saturated flat
 * colour. Fixed positioning keeps it from adding scroll height or affecting
 * layout; `pointer-events-none` and a negative z-index keep it fully out of
 * the way of content and interaction.
 */
export function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-base"
    >
      <div
        className="animate-ambient absolute left-[8%] top-[-10%] size-[38rem] rounded-full opacity-[0.16] blur-[110px]"
        style={{
          background:
            "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
        }}
      />
      <div
        className="animate-ambient-slow absolute right-[-6%] top-[18%] size-[32rem] rounded-full opacity-[0.11] blur-[110px]"
        style={{
          background:
            "radial-gradient(circle, var(--color-accent-2) 0%, transparent 70%)",
        }}
      />
      <div
        className="animate-ambient absolute bottom-[-14%] left-[28%] size-[34rem] rounded-full opacity-[0.10] blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, var(--color-accent-strong) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
