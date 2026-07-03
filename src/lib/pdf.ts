import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Holding } from './types';
import { fromISODate, effectiveStatus, summarize } from './calc';

export interface ReportFilter {
  status?: Holding['status'] | 'all';
  securityTypes?: Holding['securityType'][];
  institution?: string;
  taxYear?: number;
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

interface BuildArgs {
  holdings: Holding[];
  filter: ReportFilter;
  meta: Record<string, string>;
}

export function exportStandardPDF({ holdings, filter, meta }: BuildArgs): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header
  doc.setFillColor(15, 31, 116); // brand-900
  doc.rect(0, 0, pageWidth, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Bills n\u2019 Bonds — Holdings Report', margin, 38);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, 56);
  doc.setTextColor(15, 23, 42);

  // Filter summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Filters', margin, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 106;
  for (const [k, v] of Object.entries(meta)) {
    doc.text(`${k}: ${v}`, margin, y);
    y += 14;
  }

  // Portfolio summary — `summarize()` is the single source of truth
  // for both the Dashboard KPIs and this PDF report, so the "Active
  // Holdings" line can no longer drift from what the user sees on the
  // web (e.g. by under-counting Pending). See `lib/calc.ts` for the
  // exact rollup rules.
  const totals = summarize(holdings);
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Portfolio Summary', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Total Face Value: $${totals.totalFaceValue.toLocaleString()}`, margin, y);
  doc.text(`Cost Basis: $${totals.totalCostBasis.toLocaleString()}`, pageWidth / 2, y);
  y += 14;
  doc.text(`Interest Earned: $${totals.totalInterestEarned.toLocaleString()}`, margin, y);
  doc.text(
    totals.pendingCount > 0
      ? `Active Holdings: ${totals.activeCount} (${totals.pendingCount} maturing soon)`
      : `Active Holdings: ${totals.activeCount}`,
    pageWidth / 2,
    y,
  );
  y += 14;
  doc.text(`Matured Holdings: ${totals.maturedCount}`, margin, y);
  doc.text(`Average Yield (Active): ${totals.avgYieldActive.toFixed(2)}%`, pageWidth / 2, y);
  y += 22;

  autoTable(doc, {
    startY: y,
    head: [
      [
        'Type',
        'Institution',
        'Term',
        'CUSIP',
        'Purchased',
        'Matures',
        'Face',
        'Rate',
        'Interest',
        'Status',
      ],
    ],
    body: holdings.map((h) => [
      h.securityType,
      h.institution,
      h.termMonths >= 12 ? `${Math.round(h.termMonths / 12)}Y` : `${h.termMonths}M`,
      h.cusip ?? '—',
      h.purchaseDate,
      h.maturityDate,
      `$${h.faceValue.toLocaleString()}`,
      `${h.highRate.toFixed(2)}%`,
      `$${h.interestEarned.toLocaleString()}`,
      h.status,
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 31, 116], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    columnStyles: {
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => addFooter(doc, pageWidth),
  });

  doc.save(`bnb-holdings-${nowStamp()}.pdf`);
}

export function exportTaxSummaryPDF({
  holdings,
  taxYear,
}: {
  holdings: Holding[];
  taxYear: number;
}): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const now = new Date();

  doc.setFillColor(15, 31, 116);
  doc.rect(0, 0, pageWidth, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`Tax Summary — ${taxYear}`, margin, 38);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Generated ' + now.toLocaleString(), margin, 56);

  doc.setTextColor(15, 23, 42);

  // Header note
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  const intro =
    `This summary groups interest income earned in the selected tax year ` +
    `from your Bills n' Bonds holdings. State-tax-exempt income is shown separately. ` +
    `Always confirm with your tax advisor before filing.`;
  doc.text(doc.splitTextToSize(intro, pageWidth - margin * 2), margin, 90);

  // Federal interest income (this is what shows on Form 1099-INT)
  const federalRows = holdings
    .filter((h) => {
      const eff = effectiveStatus(h, now);
      const maturesTaxYear = fromISODate(h.maturityDate).getFullYear() === taxYear;
      const maturedThisYear = eff === 'Matured' && maturesTaxYear;
      const _pastMatured = eff === 'Matured' && fromISODate(h.maturityDate).getFullYear() < taxYear;
      // For client-only estimation: count interestEarned if the holding either
      // matured in taxYear, or was active during the year and matured later.
      return (
        maturedThisYear ||
        (h.taxYear === taxYear && (eff === 'Active' || eff === 'Matured' || eff === 'Pending'))
      );
    })
    .map((h) => [
      h.securityType,
      h.institution,
      h.cusip ?? '—',
      h.purchaseDate,
      h.maturityDate,
      `$${h.interestEarned.toLocaleString()}`,
      h.stateTaxExempt ? 'Yes' : 'No',
    ]);

  const totalFederal = federalRows.reduce((s, r) => s + Number(String(r[5]).replace(/[^\d.]/g, '')), 0);
  const exemptRows = federalRows.filter((r) => r[6] === 'Yes');
  const totalExempt = exemptRows.reduce((s, r) => s + Number(String(r[5]).replace(/[^\d.]/g, '')), 0);

  let y = 130;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Interest Income', margin, y);
  y += 18;

  autoTable(doc, {
    startY: y,
    head: [['Type', 'Institution', 'CUSIP', 'Purchased', 'Maturity', 'Interest', 'State-Exempt']],
    body: federalRows.length ? federalRows : [['—', 'No records for this year', '', '', '', '—', '—']],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 31, 116], textColor: [255, 255, 255] },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: margin, right: margin },
    didDrawPage: () => addFooter(doc, pageWidth),
  });

  // Add totals table below.
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 60;
  let y2 = finalY + 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Total 1099-INT-style Income: $${totalFederal.toLocaleString()}`, margin, y2);
  y2 += 14;
  doc.text(`State-Tax-Exempt Portion: $${totalExempt.toLocaleString()}`, margin, y2);
  y2 += 14;
  doc.text(`Federally Taxable Portion: $${(totalFederal - totalExempt).toLocaleString()}`, margin, y2);

  doc.save(`bnb-tax-${taxYear}-${nowStamp()}.pdf`);
}

function addFooter(doc: jsPDF, pageWidth: number) {
  const page = doc.getCurrentPageInfo().pageNumber;
  const total = (doc as any).internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Bills n' Bonds  ·  Page ${page} of ${total}`,
    pageWidth - 40,
    doc.internal.pageSize.getHeight() - 18,
    { align: 'right' },
  );
  doc.text(
    'Generated locally — your data never leaves this device.',
    40,
    doc.internal.pageSize.getHeight() - 18,
  );
}
