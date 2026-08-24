/** Brauzer orqali PDF (Chop etish → PDF sifatida saqlash) */

export type CandidatePdfData = {
  fullName: string;
  phone?: string | null;
  birthDate?: string | null;
  address?: string | null;
  education?: string | null;
  experience?: string | null;
  expectedSalary?: string | null;
  notes?: string | null;
  stage?: string | null;
  stageLabel?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  recruiterName?: string | null;
  createdAt?: string | null;
};

export type VacancyPdfMeta = {
  title: string;
  location?: string | null;
  salaryRange?: string | null;
  recruiterName?: string | null;
  departmentName?: string | null;
};

function esc(s: string | null | undefined) {
  if (!s) return "—";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string | null | undefined) {
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;width:34%;font-size:12px;">${esc(label)}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;">${esc(value)}</td>
  </tr>`;
}

function candidateBlock(c: CandidatePdfData, vacancy: VacancyPdfMeta, index?: number) {
  const title =
    index != null ? `${index + 1}. ${c.fullName}` : c.fullName;
  return `
  <section style="page-break-inside:avoid;margin-bottom:28px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0b3a5c;color:#fff;padding:14px 16px;">
      <div style="font-size:16px;font-weight:700;">${esc(title)}</div>
      <div style="font-size:12px;opacity:.85;margin-top:4px;">Ish o'rni: ${esc(vacancy.title)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Telefon", c.phone)}
      ${row("Tug'ilgan sana", c.birthDate)}
      ${row("Manzil", c.address)}
      ${row("Ta'lim", c.education)}
      ${row("Tajriba", c.experience)}
      ${row("Kutilayotgan maosh", c.expectedSalary)}
      ${row("Bosqich", c.stageLabel || c.stage)}
      ${row("Holat", c.statusLabel || c.status)}
      ${row("Rekruter", c.recruiterName || vacancy.recruiterName)}
      ${row("Qo'shilgan", c.createdAt)}
      ${row("Izoh", c.notes)}
    </table>
  </section>`;
}

function wrapHtml(body: string, heading: string) {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8" />
  <title>${esc(heading)}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; color: #0b3a5c; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    .actions { margin-bottom: 16px; }
    @media print { .actions { display: none; } }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()" style="padding:10px 16px;background:#0b3a5c;color:#fff;border:0;border-radius:8px;cursor:pointer;font-weight:600;">
      PDF sifatida saqlash / Chop etish
    </button>
  </div>
  <h1>${esc(heading)}</h1>
  ${body}
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;
}

export function openCandidatePdf(candidate: CandidatePdfData, vacancy: VacancyPdfMeta) {
  const meta = `
    <div class="meta">
      ${esc(vacancy.departmentName || "")}
      ${vacancy.location ? ` · ${esc(vacancy.location)}` : ""}
      ${vacancy.salaryRange ? ` · ${esc(vacancy.salaryRange)}` : ""}
    </div>`;
  const html = wrapHtml(meta + candidateBlock(candidate, vacancy), `Nomzod — ${candidate.fullName}`);
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function openVacancyCandidatesPdf(
  candidates: CandidatePdfData[],
  vacancy: VacancyPdfMeta,
) {
  const meta = `
    <div class="meta">
      Jami: ${candidates.length} ta nomzod
      ${vacancy.recruiterName ? ` · Rekruter: ${esc(vacancy.recruiterName)}` : ""}
      ${vacancy.location ? ` · ${esc(vacancy.location)}` : ""}
      ${vacancy.salaryRange ? ` · ${esc(vacancy.salaryRange)}` : ""}
    </div>`;
  const blocks = candidates
    .map((c, i) => candidateBlock(c, vacancy, i))
    .join("\n");
  const html = wrapHtml(
    meta + (blocks || "<p>Nomzod yo'q</p>"),
    `Nomzodlar — ${vacancy.title}`,
  );
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
