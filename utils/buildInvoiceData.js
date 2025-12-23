/* ---------------- BOOKING INVOICE DATA PREP FOR PDF ---------------- */
const buildInvoiceData = (invoiceInfo) => {
  const { business, customer, provider, items, payment, invoiceNumber } =
    invoiceInfo;

  return {
    invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
    issuedAt: new Date().toLocaleString("en-IN"),

    business: {
      name: business?.name || "N/A",
      email: business?.email || "N/A",
      phone: business?.phone || "N/A",
    },

    customer: {
      name: customer?.name || "Customer",
      email: customer?.email || "N/A",
      address: customer?.address || "N/A",
    },

    provider: {
      name: provider?.name || "N/A",
    },

    items: (items || []).map((item) => ({
      title: item.title || "Service",
      price: item.price || 0,

      bookingDate: item.bookingDate
        ? new Date(item.bookingDate).toLocaleDateString("en-IN")
        : "N/A",

      slotTime: item.slotTime || "As scheduled",
    })),

    payment: {
      status: payment?.status || "PAID",
      method: payment?.method || "Stripe",
      transactionId: payment?.transactionId || "N/A",
      tax: payment?.tax || 0,
    },

    totalAmount: (items || []).reduce(
      (sum, item) => sum + (item.price || 0),
      0
    ),
  };
};

module.exports = { buildInvoiceData };
