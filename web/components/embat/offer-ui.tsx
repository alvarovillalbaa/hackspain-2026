import { signedBadgeClass } from "@/components/embat/chrome";
import { formatCompactEuro } from "@/lib/xray/format";
import { cn } from "@/lib/utils";

export const ISSUER_LOGOS: Array<{
  test: RegExp;
  src: string;
}> = [
  { test: /bbva/i, src: "/embat/banks/bbva.svg" },
  { test: /santander/i, src: "/embat/banks/santander.svg" },
  { test: /sabadell/i, src: "/embat/banks/sabadell.svg" },
  { test: /march/i, src: "/embat/banks/march.svg" },
  { test: /embat/i, src: "/embat/banks/embat.svg" },
];

export function issuerLogo(name: string) {
  return ISSUER_LOGOS.find((logo) => logo.test.test(name)) ?? null;
}

export function formatSavingPerYear(value: number): string {
  return `${formatCompactEuro(value)}/año`;
}

export function IssuerMark({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const logo = issuerLogo(name);
  if (logo) {
    return (
      <img
        src={logo.src}
        alt={name}
        title={name}
        draggable={false}
        className={cn(
          "h-5 w-auto max-w-[148px] shrink-0 object-contain object-left",
          className
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "block truncate text-[14px] font-medium tracking-[-0.14px] text-black",
        className
      )}
      title={name}
    >
      {name}
    </span>
  );
}

export function FeeBadge({
  amount,
  prefix,
  angle = 103,
}: {
  amount: number;
  prefix?: string;
  angle?: number;
}) {
  return (
    <span className="inline-flex items-center justify-center rounded-[4px] bg-[rgba(163,75,203,0.1)] px-1 py-0.5">
      <span
        className="bg-clip-text text-[14px] font-semibold tracking-[-0.14px] text-transparent"
        style={{
          backgroundImage: `linear-gradient(${angle}deg, rgb(103, 140, 253) 5%, rgb(163, 75, 203) 111%)`,
        }}
      >
        {prefix}
        {formatCompactEuro(amount)}
      </span>
    </span>
  );
}

export function SignedMetricBadge({
  value,
  children,
}: {
  value: number;
  children: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
        signedBadgeClass(value)
      )}
    >
      {children}
    </span>
  );
}
