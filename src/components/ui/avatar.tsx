import Image from "next/image";
import { initials } from "@/lib/media/placeholder";
import { cn } from "@/lib/utils/cn";

const SIZES = { sm: 24, md: 36, lg: 56, xl: 88 } as const;
export type AvatarSize = keyof typeof SIZES;

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
};

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const px = SIZES[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        "rounded-full border border-line bg-raised",
        className,
      )}
      style={{ width: px, height: px }}
    >
      {src ? (
        <Image src={src} alt="" width={px} height={px} className="size-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="font-display font-semibold text-ink-muted"
          style={{ fontSize: px * 0.38 }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
