import { formatCompactEuro } from "@/lib/xray/format";
import { signedBadgeClass } from "@/components/embat/chrome";
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
      // eslint-disable-next-line @next/next/no-img-element
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
}: {
  amount: number;
  prefix?: string;
}) {
  return (
    <span className="inline-flex items-center justify-center rounded-xl bg-violet-700/10 px-1 py-0.5">
      <span className="text-[14px] font-semibold tracking-[-0.14px] tabular-nums text-violet-700">
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
        "inline-flex items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px] tabular-nums",
        signedBadgeClass(value)
      )}
    >
      {children}
    </span>
  );
}
