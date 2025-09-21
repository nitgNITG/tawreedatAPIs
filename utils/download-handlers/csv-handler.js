import { Parser } from "@json2csv/plainjs";

export const handleCSVDownload = (formattedData, title, lang, res) => {
  const BOM = "\uFEFF";

  const fields = Object.keys(formattedData[0] || {});

  const parser = new Parser({
    fields,
    withBOM: true,
    transforms: [
      (value) => {
        if (typeof value === "string" && lang === "ar") {
          return "\u202B" + value + "\u202C";
        }
        return value;
      },
    ],
  });

  const csv = parser.parse(formattedData);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${title}-${Date.now()}.csv`
  );
  return res.send(BOM + csv);
};
