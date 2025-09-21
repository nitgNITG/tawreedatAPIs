import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { fieldTranslations } from "../../lang/fieldTranslations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Reverse Arabic words if needed (for simple visual RTL layout)
export const reverseIfArabic = (text, lang) => {
  if (lang === "ar") {
    return text.split(" ").reverse().join("  ");
  }
  return text;
};

const createTableHeader = (
  doc,
  fields,
  lang,
  startX,
  startY,
  colWidths,
  rowHeight,
  colPadding,
  currentPage
) => {
  const headerHeight =
    Math.max(
      rowHeight,
      ...fields.map((field, i) =>
        doc.heightOfString(field, { width: colWidths[i] - colPadding * 2 })
      )
    ) + 10;

  doc.font("Arabic").fontSize(12).fillColor("#2ab09c");
  doc.text(
    reverseIfArabic(
      (fieldTranslations["page"]?.[lang] || "page") + " " + currentPage,
      lang
    ),
    doc.page.width - 100,
    30,
    {
      align: lang === "en" ? "left" : "right",
    }
  );

  fields.forEach((field, i) => {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc
      .rect(x, startY, colWidths[i], headerHeight)
      .fill("#2ab09c")
      .stroke()
      .fillColor("white")
      .font("Arabic")
      .text(field, x + colPadding, startY + 7, {
        width: colWidths[i] - colPadding * 2,
        align: lang === "en" ? "left" : "right",
      });
  });

  return startY + headerHeight;
};

export const handlePDFDownload = (
  formattedData,
  model,
  title,
  subTitle,
  lang,
  res
) => {
  const fields = Object.keys(formattedData[0] || {});
  const headerFields = fields.map((field) => reverseIfArabic(field, lang));

  const doc = new PDFDocument({
    margin: 50,
    size: "A4",
    layout: "landscape",
  });

  doc.registerFont(
    "Arabic",
    path.join(__dirname, "../../assets/fonts/Rubik-VariableFont_wght.ttf")
  );

  try {
    doc.font("Arabic");
  } catch {
    doc.font("Helvetica");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${model}-${Date.now()}.pdf`
  );
  doc.pipe(res);

  const pageWidth = doc.page.width - 100;
  const pageHeight = doc.page.height - 80;
  const startX = 50;
  const rowHeight = 30;
  const colPadding = 10;
  const colWidths = fields.map(() => pageWidth / fields.length);
  let currentPage = 1;
  let startY = 90;

  const calculateRowHeight = (doc, row, fields) => {
    return (
      Math.max(
        rowHeight,
        ...fields.map((field, i) =>
          doc.heightOfString(String(row[field] || ""), {
            width: colWidths[i] - colPadding * 2,
          })
        )
      ) + 10
    );
  };

  const date = new Date();
  const day = date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
  });
  const month = date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
    month: "2-digit",
  });
  const year = date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
    year: "numeric",
  });

  const time = new Date().toLocaleTimeString(
    lang === "ar" ? "ar-SA" : "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  );

  const formattedDate = `${day}-${month}-${year} ${time}`;

  const addPageTitle = () => {
    const titleY = 40;
    doc.fontSize(20).fillColor("#000000").text(`${title}`, 0, titleY, {
      align: "center",
    });

    // Add subTitle if present and not empty
    if (subTitle && Object.keys(subTitle).length > 0) {
      let subTitleText = Object.values(subTitle)
        .filter(Boolean)
        .join(" - ");
      doc
        .fontSize(12)
        .fillColor("#444")
        .text(subTitleText, 0, titleY + 28, {
          align: "center",
        });
    }

    doc
      .fontSize(10)
      .fillColor("#555")
      .text(
        reverseIfArabic(
          (fieldTranslations["generated"]?.[lang] || "Generated") +
            ":" +
            " " +
            formattedDate,
          lang
        ),
        startX,
        titleY + 25 + (subTitle && Object.keys(subTitle).length > 0 ? 20 : 0), // push down if subTitle exists
        {
          align: lang === "en" ? "left" : "right",
        }
      );
  };

  const addTableHeader = () => {
    startY = createTableHeader(
      doc,
      headerFields,
      lang,
      startX,
      doc.y + 10,
      colWidths,
      rowHeight,
      colPadding,
      currentPage
    );
  };

  addPageTitle();
  addTableHeader();

  formattedData.forEach((row, index) => {
    const thisRowHeight = calculateRowHeight(doc, row, fields);

    if (startY + thisRowHeight > pageHeight) {
      doc.addPage();
      currentPage++;
      addTableHeader();
      startY = doc.y + 20;
    }

    if (index % 2 === 0) {
      doc
        .rect(startX, startY, pageWidth, thisRowHeight)
        .fill("#f9f9f9")
        .strokeColor("#ddd")
        .stroke();
    }

    fields.forEach((field, i) => {
      const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const text = reverseIfArabic(String(row[field] || ""), lang);

      doc
        .fillColor("#000")
        .fontSize(10)
        .font("Arabic")
        .text(text, x + colPadding, startY + 6, {
          width: colWidths[i] - colPadding * 2,
          align: lang === "en" ? "left" : "right",
          lineGap: 1.2,
        });

      // Draw cell borders
      doc
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .rect(x, startY, colWidths[i], thisRowHeight)
        .stroke();
    });

    startY += thisRowHeight;
  });

  doc.end();
};
