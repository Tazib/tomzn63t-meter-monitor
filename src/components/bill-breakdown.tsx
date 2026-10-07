import type { Bill } from "@/lib/billing";
import { kwh, slabRange, tk } from "@/lib/format";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Line-by-line bill: slabs, then charges, then total. */
export function BillBreakdown({ bill }: { bill: Bill }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bill.lines.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground">
              No usage yet
            </TableCell>
          </TableRow>
        )}
        {bill.lines.map((l) => (
          <TableRow key={l.fromKwh}>
            <TableCell>{bill.lifeline ? "Lifeline rate" : slabRange(l.fromKwh, l.toKwh)}</TableCell>
            <TableCell className="text-right tabular-nums">{kwh(l.kwh)}</TableCell>
            <TableCell className="text-right tabular-nums">{tk(l.rate)}</TableCell>
            <TableCell className="text-right tabular-nums">{tk(l.amount)}</TableCell>
          </TableRow>
        ))}
        <Row label="Energy charge" amount={bill.energyCharge} strong />
        <Row label="Demand charge" amount={bill.demandCharge} />
        {bill.rebate > 0 && <Row label="Rebate" amount={-bill.rebate} />}
        <Row label="VAT" amount={bill.vat} />
        <Row label="Meter rent" amount={bill.meterRent} />
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="font-semibold">
            Total
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">{tk(bill.total)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function Row({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <TableRow>
      <TableCell colSpan={3} className={strong ? "font-medium" : undefined}>
        {label}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${strong ? "font-medium" : ""}`}>{tk(amount)}</TableCell>
    </TableRow>
  );
}
