const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  errorFormat: "minimal",
});

// Handle Prisma client errors gracefully
prisma.$on("error", (e) => {
  console.error("Prisma Client Error:", e.message);
});

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
