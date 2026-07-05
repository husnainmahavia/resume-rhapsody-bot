// Simple, ATS-friendly PDF export for tailored CVs and cover letters.
import jsPDF from "jspdf";

interface ExportOpts {
  title: string;
  body: string;
  filename: string;
}

export function exportTextAsPdf({ title, body, filename }: ExportOpts) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const marginTop = 56;
  const marginBottom = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, marginX, marginTop);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const lineHeight = 14;
  let y = marginTop + 24;

  const paragraphs = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const para of paragraphs) {
    // Heading heuristic: short ALL-CAPS or Title Case line
    const trimmed = para.trim();
    const isHeading =
      trimmed.length < 60 &&
      !trimmed.includes(".") &&
      (trimmed === trimmed.toUpperCase() || /^[A-Z][^\n]{2,40}$/.test(trimmed));

    if (isHeading) {
      if (y > marginTop + 10) y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      const lines = doc.splitTextToSize(trimmed, usableWidth);
      for (const l of lines) {
        if (y > pageHeight - marginBottom) { doc.addPage(); y = marginTop; }
        doc.text(l, marginX, y);
        y += lineHeight;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      continue;
    }

    const lines = doc.splitTextToSize(trimmed, usableWidth);
    for (const l of lines) {
      if (y > pageHeight - marginBottom) { doc.addPage(); y = marginTop; }
      doc.text(l, marginX, y);
      y += lineHeight;
    }
    y += 6;
  }

  doc.save(filename);
}
