const PDFDocument = require("pdfkit");
const moment = require("moment");

/* ---------------- GENERATE PDF FOR PROVIDER SUBSCRIPTION INVOICE ---------------- */
function generateProviderSubscriptionInvoicePDF(data) {
  console.log("Provider Subscription Invoice Data", data);
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
      if (data.business.website) {
        doc.text(data.business.website, margin, doc.y + 2);
      }

      // Invoice details (right)
      const invoiceY = margin;
      doc.font("Helvetica-Bold").fontSize(22).fillColor("#000");
      doc.text("SUBSCRIPTION INVOICE", rightEdge - 180, invoiceY, {
        width: 180,
        align: "right",
      });

      doc.font("Helvetica").fontSize(9).fillColor("#555");
      doc.text(`#${data.invoiceNumber}`, rightEdge - 120, invoiceY + 30, {
        width: 120,
        align: "right",
      });
      doc.text(moment(data.invoiceDate).format("DD MMM YYYY"), rightEdge - 120, doc.y + 2, {
        width: 120,
        align: "right",
      });

      doc.y = Math.max(doc.y, margin + 80);
      drawLine(doc, margin, rightEdge);

      /* ---------------- BILLING DETAILS ---------------- */

      doc.moveDown(0.5);
      const detailsY = doc.y;

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
      doc.text("BILL TO", margin, detailsY);

      doc.font("Helvetica").fontSize(9).fillColor("#333");
      let providerY = doc.y + 5;
      doc.text(data.provider.name, margin, providerY);
      doc.text(data.provider.email, margin, doc.y + 2);
      if (data.provider.phone) {
        doc.text(data.provider.phone, margin, doc.y + 2);
      }
      if (data.provider.address && data.provider.address !== "N/A") {
        doc.text(data.provider.address, margin, doc.y + 2, { width: 240 });
      }

      const providerEndY = doc.y;

      // Subscription Period (right side)
      const periodX = pageWidth / 2 + 20;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
      doc.text("SUBSCRIPTION PERIOD", periodX, detailsY);

      doc.font("Helvetica").fontSize(9).fillColor("#333");
      let periodY = detailsY + 17;
      doc.text(`From: ${moment(data.subscription.periodStart).format("DD MMM YYYY")}`, periodX, periodY);
      doc.text(`To: ${moment(data.subscription.periodEnd).format("DD MMM YYYY")}`, periodX, doc.y + 2);
      doc.text(`Status: ${data.subscription.status.toUpperCase()}`, periodX, doc.y + 2);

      const periodEndY = doc.y;

      doc.y = Math.max(providerEndY, periodEndY);
      doc.moveDown(0.5);
      drawLine(doc, margin, rightEdge);

      /* ---------------- SUBSCRIPTION PLAN DETAILS ---------------- */

      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
      doc.text("SUBSCRIPTION PLAN", margin, doc.y);

      doc.moveDown(0.3);
      const planTableY = doc.y;

      // Table header
      doc
        .rect(margin, planTableY, usableWidth, 20)
        .fillAndStroke("#f5f5f5", "#ddd");

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      doc.text("Plan Details", margin + 8, planTableY + 6);
      doc.text("Amount", rightEdge - 85, planTableY + 6, {
        width: 75,
        align: "right",
      });

      let currentY = planTableY + 26;

      // Plan row background
      doc
        .rect(margin, currentY - 4, usableWidth, 50)
        .fillAndStroke("#fafafa", "#fafafa");

      // Plan name
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#333")
        .text(data.plan.name, margin + 8, currentY, {
          width: usableWidth - 110,
        });

      // Plan price
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#333")
        .text(
          `Rs ${data.plan.price.toLocaleString("en-IN")}`,
          rightEdge - 85,
          currentY,
          { width: 75, align: "right" }
        );

      // Plan features
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#666")
        .text(
          `Billing: ${data.plan.billingCycle}`,
          margin + 8,
          currentY + 14,
          { width: usableWidth - 110 }
        );

      currentY += 56;
      doc.y = currentY;
      drawLine(doc, margin, rightEdge);

      /* ---------------- TOTALS ---------------- */

      doc.moveDown(0.5);
      const totalsLabelX = rightEdge - 185;
      const totalsValueX = rightEdge - 85;

      doc.font("Helvetica").fontSize(9).fillColor("#333");
      doc.text("Subtotal:", totalsLabelX, doc.y);
      doc.text(`Rs ${data.plan.price.toLocaleString("en-IN")}`, totalsValueX, doc.y, {
        width: 75,
        align: "right",
      });

      let total = data.plan.price;

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
      
      if (data.payment.transactionId) {
        doc.text(
          `Transaction ID: ${data.payment.transactionId}`,
          margin,
          paymentY + 12,
          { width: 300 }
        );
      }

      if (data.subscription.stripeSubscriptionId) {
        doc.text(
          `Subscription ID: ${data.subscription.stripeSubscriptionId}`,
          margin,
          doc.y + 2,
          { width: 300 }
        );
      }

      /* ---------------- FOOTER ---------------- */

      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888");
      doc.text(
        "Thank you for subscribing to our platform!",
        margin,
        pageWidth - 80,
        {
          align: "center",
          width: usableWidth,
        }
      );

      doc.fontSize(8);
      doc.text(
        "For support or billing inquiries, please contact us at " + data.business.email,
        margin,
        pageWidth - 60,
        {
          align: "center",
          width: usableWidth,
        }
      );

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

module.exports = { generateProviderSubscriptionInvoicePDF };