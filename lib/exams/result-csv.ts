export type ExamResultExportRow = {
  userId: string;
  studentName: string;
  institute: string;
  totalScore: number;
  maxScore: number;
  rank: number | null;
  createdAt: string;
};

function csvCell(value: string | number | null) {
  let text = value === null ? "" : String(value);

  // Prevent spreadsheet applications from interpreting profile data as a formula.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function createExamResultsCsv(rows: ExamResultExportRow[]) {
  const header = [
    "Rank",
    "Student ID",
    "Student Name",
    "Institute",
    "Total Score",
    "Maximum Score",
    "Percentage",
    "Result Created At",
  ];

  const body = rows.map((row) => {
    const percentage = row.maxScore > 0
      ? `${(row.totalScore * 100 / row.maxScore).toFixed(2)}%`
      : "0.00%";

    return [
      row.rank,
      row.userId,
      row.studentName,
      row.institute,
      row.totalScore,
      row.maxScore,
      percentage,
      row.createdAt,
    ].map(csvCell).join(",");
  });

  // A UTF-8 BOM keeps names written in Bangla readable when opened in Excel.
  return `\uFEFF${[header.map(csvCell).join(","), ...body].join("\r\n")}\r\n`;
}

export function examResultsFilename(title: string, examId: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);

  return `${slug || examId}-results.csv`;
}
