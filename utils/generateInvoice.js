const PDFDocument = require("pdfkit");
const moment = require("moment");

/* ---------------- GENERATE PDF FOR BOOKING INVOICE ---------------- */
function generateInvoicePDF(data) {
  console.log("Invoice Data", data);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageWidth = 595.28; // A4 width
      const margin = 40;
      const usableWidth = pageWidth - margin * 2;
      const rightEdge = pageWidth - margin;

      /* ---------------- HEADER ---------------- */

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#000")
        .text(data.business.name, margin, margin);

      doc.font("Helvetica").fontSize(9).fillColor("#555");
      doc.text(data.business.email, margin, doc.y + 3);
      doc.text(data.business.phone, margin, doc.y + 2);

      // Invoice details (right)
      const invoiceY = margin;
      doc.font("Helvetica-Bold").fontSize(22).fillColor("#000");
      doc.text("INVOICE", rightEdge - 100, invoiceY, {
        width: 100,
        align: "right",
      });

      doc.font("Helvetica").fontSize(9).fillColor("#555");
      doc.text(`#${data.invoiceNumber}`, rightEdge - 120, invoiceY + 30, {
        width: 120,
        align: "right",
      });
      doc.text(moment().format("DD MMM YYYY"), rightEdge - 120, doc.y + 2, {
        width: 120,
        align: "right",
      });

      doc.y = Math.max(doc.y, margin + 70);
      drawLine(doc, margin, rightEdge);

      /* ---------------- BILLING DETAILS ---------------- */

      doc.moveDown(0.5);
      const detailsY = doc.y;

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
      doc.text("BILL TO", margin, detailsY);

      doc.font("Helvetica").fontSize(9).fillColor("#333");
      let customerY = doc.y + 5;
      doc.text(data.customer.name, margin, customerY);
      doc.text(data.customer.email, margin, doc.y + 2);

      if (data.customer.address && data.customer.address !== "N/A") {
        doc.text(data.customer.address, margin, doc.y + 2, { width: 240 });
      }

      const customerEndY = doc.y;

      const providerX = pageWidth / 2 + 20;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
      doc.text("SERVICE PROVIDER", providerX, detailsY);

      doc.font("Helvetica").fontSize(9).fillColor("#333");
      let providerY = detailsY + 17;
      doc.text(data.provider.name, providerX, providerY);

      const providerEndY = doc.y;

      doc.y = Math.max(customerEndY, providerEndY);
      doc.moveDown(0.5);
      drawLine(doc, margin, rightEdge);

      /* ---------------- SERVICES TABLE ---------------- */

      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
      doc.text("SERVICES", margin, doc.y);

      doc.moveDown(0.3);
      const itemsTableY = doc.y;

      // Table header
      doc
        .rect(margin, itemsTableY, usableWidth, 20)
        .fillAndStroke("#f5f5f5", "#ddd");

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      doc.text("Description", margin + 8, itemsTableY + 6);
      doc.text("Amount", rightEdge - 85, itemsTableY + 6, {
        width: 75,
        align: "right",
      });

      let currentY = itemsTableY + 26;
      let total = 0;

      doc.font("Helvetica").fontSize(9).fillColor("#333");

      data.items.forEach((item, idx) => {
        // Alternate row background
        if (idx % 2 === 0) {
          doc
            .rect(margin, currentY - 4, usableWidth, 36)
            .fillAndStroke("#fafafa", "#fafafa");
        }

        // Service name
        doc
          .font("Helvetica-Bold") // Make title bold to distinguish it
          .fontSize(9)
          .fillColor("#333")
          .text(item.title, margin + 8, currentY, {
            width: usableWidth - 110,
          });

        // Price
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#333")
          .text(
            `Rs ${item.price.toLocaleString("en-IN")}`,
            rightEdge - 85,
            currentY,
            { width: 75, align: "right" }
          );

        // Slot details (on the next line)
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#666")
          .text(
            `Date: ${item.bookingDate} | Slot: ${item.slotTime}`,
            margin + 8,
            currentY + 12, // This is now 12 points below the title
            { width: usableWidth - 110 }
          );
        currentY += 36;
        total += item.price;
      });

      doc.y = currentY + 5;
      drawLine(doc, margin, rightEdge);

      /* ---------------- TOTALS ---------------- */

      doc.moveDown(0.5);
      const totalsLabelX = rightEdge - 185;
      const totalsValueX = rightEdge - 85;

      doc.font("Helvetica").fontSize(9).fillColor("#333");
      doc.text("Subtotal:", totalsLabelX, doc.y);
      doc.text(`Rs ${total.toLocaleString("en-IN")}`, totalsValueX, doc.y, {
        width: 75,
        align: "right",
      });

      if (data.payment.tax && data.payment.tax > 0) {
        doc.moveDown(0.3);
        doc.text("Tax:", totalsLabelX, doc.y);
        doc.text(
          `Rs ${data.payment.tax.toLocaleString("en-IN")}`,
          totalsValueX,
          doc.y,
          { width: 75, align: "right" }
        );
        total += data.payment.tax;
      }

      doc.moveDown(0.5);
      const totalBoxY = doc.y - 2;
      doc
        .rect(totalsLabelX - 8, totalBoxY, 193, 24)
        .fillAndStroke("#2c3e50", "#2c3e50");

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#fff");
      doc.text("TOTAL:", totalsLabelX, totalBoxY + 5);
      doc.text(
        `Rs ${total.toLocaleString("en-IN")} /-`,
        totalsValueX,
        totalBoxY + 5,
        { width: 75, align: "right" }
      );

      /* ---------------- PAYMENT INFO ---------------- */

      doc.y = totalBoxY + 30;
      doc.moveDown(0.5);
      drawLine(doc, margin, rightEdge);

      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      doc.text("PAYMENT INFORMATION", margin, doc.y);

      doc.font("Helvetica").fontSize(9).fillColor("#333");
      doc.moveDown(0.3);
      const paymentY = doc.y;
      doc.text(`Status: ${data.payment.status}`, margin, paymentY);
      doc.text(`Method: ${data.payment.method}`, margin + 160, paymentY);
      doc.text(
        `Transaction ID: ${data.payment.transactionId}`,
        margin + 320,
        paymentY,
        { width: 200 }
      );

      /* ---------------- FOOTER ---------------- */

      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888");
      doc.text("Thank you for choosing our service!", margin, pageWidth - 80, {
        align: "center",
        width: usableWidth,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/* ---------------- DRAW LINE ---------------- */

function drawLine(doc, startX, endX) {
  doc
    .strokeColor("#ddd")
    .lineWidth(0.5)
    .moveTo(startX, doc.y)
    .lineTo(endX, doc.y)
    .stroke();
}

module.exports = { generateInvoicePDF };
