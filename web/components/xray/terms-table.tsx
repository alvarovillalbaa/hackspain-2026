import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBps, formatRate } from "@/lib/xray/format";
import type { ProductTerms } from "@/lib/xray/types";

function cell(field: keyof ProductTerms, terms: ProductTerms): string {
  switch (field) {
    case "rate_annual":
      return formatRate(terms.rate_annual);
    case "term_months":
      return `${terms.term_months} m`;
    case "fees_bps":
      return formatBps(terms.fees_bps);
    case "amortization":
      return terms.amortization;
    case "collateral":
      return terms.collateral;
  }
}

const ROWS: { field: keyof ProductTerms; label: string }[] = [
  { field: "rate_annual", label: "Tipo anual" },
  { field: "term_months", label: "Plazo" },
  { field: "fees_bps", label: "Comisiones" },
  { field: "amortization", label: "Amortización" },
  { field: "collateral", label: "Colateral" },
];

export function TermsTable({
  issuer,
  ideal,
}: {
  issuer: ProductTerms;
  ideal: ProductTerms;
}) {
  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
        <TableRow>
          <TableHead>Término</TableHead>
          <TableHead>Emisor (oferta)</TableHead>
          <TableHead>Ideal cliente</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((r) => (
          <TableRow key={r.field}>
            <TableCell className="font-medium">{r.label}</TableCell>
            <TableCell className="font-mono tabular-nums">
              {cell(r.field, issuer)}
            </TableCell>
            <TableCell className="font-mono tabular-nums text-muted-foreground">
              {cell(r.field, ideal)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
