const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

// --- Simple Faker Replacement ---
const firstNames = [
  "James",
  "Mary",
  "John",
  "Patricia",
  "Robert",
  "Jennifer",
  "Michael",
  "Linda",
  "William",
  "Elizabeth",
  "David",
  "Barbara",
  "Richard",
  "Susan",
  "Joseph",
  "Jessica",
  "Thomas",
  "Sarah",
  "Charles",
  "Karen",
  "Christopher",
  "Nancy",
  "Daniel",
  "Lisa",
  "Matthew",
  "Margaret",
];
const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
];
const cities = [
  "New York",
  "Los Angeles",
  "Chicago",
  "Houston",
  "Phoenix",
  "Philadelphia",
  "San Antonio",
  "San Diego",
  "Dallas",
  "San Jose",
];
const businessPrefixes = [
  "Reliable",
  "Speedy",
  "Elite",
  "Pro",
  "Master",
  "Local",
  "Trusted",
  "Expert",
  "Premier",
  "Best",
];
const businessSuffixes = [
  "Services",
  "Solutions",
  "Pros",
  "Group",
  "Works",
  "Fixers",
  "Care",
  "Maintenance",
  "Techs",
  "Crew",
];
const serviceAdjectives = [
  "Deep",
  "Quick",
  "Full",
  "Express",
  "Premium",
  "Basic",
  "Emergency",
  "Standard",
  "Eco-friendly",
  "Luxury",
];

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomDate = (start, end) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

// --- Seed Logic ---

async function main() {
  console.log("🌱 Starting Seeding Process...");

  // 1. CLEANUP (Optional - Uncomment to wipe DB)
  // await clearDatabase();

  // 2. CREATE ADMIN
  const adminEmail = "admin@servicehub.com";
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  let adminUser;

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    adminUser = await prisma.user.create({
      data: {
        name: "Super Admin",
        email: adminEmail,
        password: hashedPassword,
        mobile: "1234567890",
        role: "admin",
      },
    });
    console.log("✅ Admin created");
  } else {
    adminUser = existingAdmin;
    console.log("ℹ️ Admin already exists");
  }

  // 3. CREATE CATEGORIES
  const categories = [
    "Home Cleaning",
    "Plumbing",
    "Electrical",
    "Gardening",
    "Pest Control",
    "Carpentry",
  ];
  const createdCategories = [];

  for (const catName of categories) {
    // Check exist
    const existing = await prisma.businesscategory.findFirst({
      where: { name: catName },
    });
    if (!existing) {
      const cat = await prisma.businesscategory.create({
        data: {
          name: catName,
          description: `${catName} services for your home`,
          createdBy: adminUser.id,
        },
      });
      createdCategories.push(cat);
    } else {
      createdCategories.push(existing);
    }
  }
  console.log(`✅ ${createdCategories.length} Categories ready`);

  // 4. CREATE PLANS
  const plans = [
    {
      name: "Free",
      price: 0,
      interval: "month",
      stripePriceId: "price_free_mock",
    },
    {
      name: "Pro",
      price: 499,
      interval: "month",
      stripePriceId: "price_pro_mock",
    },
    {
      name: "Premium",
      price: 999,
      interval: "month",
      stripePriceId: "price_premium_mock",
    },
  ];

  const createdPlans = [];
  for (const p of plans) {
    const existing = await prisma.providerSubscriptionPlan.findFirst({
      where: { name: p.name },
    });
    if (!existing) {
      const plan = await prisma.providerSubscriptionPlan.create({
        data: {
          name: p.name,
          price: p.price,
          interval: p.interval,
          stripePriceId: p.stripePriceId,
        },
      });
      createdPlans.push(plan);
    } else {
      createdPlans.push(existing);
    }
  }
  console.log(`✅ ${createdPlans.length} Plans ready`);

  // 5. CREATE PROVIDERS
  const providersToCreate = 15;
  const providers = [];

  for (let i = 0; i < providersToCreate; i++) {
    const fName = getRandomElement(firstNames);
    const lName = getRandomElement(lastNames);
    const email = `provider${i}_${Date.now()}@example.com`;
    const password = await bcrypt.hash("123456", 10);

    const user = await prisma.user.create({
      data: {
        name: `${fName} ${lName}`,
        email: email,
        mobile: `98${getRandomInt(10000000, 99999999)}`,
        password: password,
        role: "provider",
        createdAt: getRandomDate(new Date(2025, 0, 1), new Date()), // Past date
      },
    });
    providers.push(user);

    // Create Business Profile
    const cat = getRandomElement(createdCategories);
    const profile = await prisma.businessProfile.create({
      data: {
        userId: user.id,
        businessName: `${getRandomElement(businessPrefixes)} ${
          cat.name
        } ${getRandomElement(businessSuffixes)}`,
        businessCategoryId: cat.id,
        contactEmail: email,
        phoneNumber: user.mobile,
        isApproved: Math.random() > 0.2, // 80% approved
        isActive: true,
      },
    });

    // Determine Seed Services
    if (profile.isApproved) {
      const numServices = getRandomInt(1, 5);
      for (let j = 0; j < numServices; j++) {
        await prisma.service.create({
          data: {
            name: `${getRandomElement(serviceAdjectives)} ${cat.name}`,
            description: "Professional service ensuring quality results.",
            durationInMinutes: getRandomInt(30, 120),
            price: getRandomInt(500, 5000),
            businessProfileId: profile.id,
            businessCategoryId: cat.id,
            totalBookingAllow: getRandomInt(5, 20),
            images: [
              "https://res.cloudinary.com/demo/image/upload/v1652345767/docs/demo_image2.jpg",
            ],
          },
        });
      }
    }

    // Assign Subscription (Random)
    if (Math.random() > 0.3) {
      const plan = getRandomElement(createdPlans);
      // Skip free sometimes
      if (plan.price > 0 || Math.random() > 0.5) {
        await prisma.providerSubscription.create({
          data: {
            userId: user.id,
            planId: plan.id,
            stripeCustomerId: `cus_mock_${user.id}`,
            stripeSubscriptionId: `sub_mock_${user.id}`,
            status: "active",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(
              new Date().setMonth(new Date().getMonth() + 1)
            ),
            createdAt: getRandomDate(new Date(2025, 0, 1), new Date()),
          },
        });
      }
    }
  }
  console.log(`✅ ${providers.length} Providers Created`);

  // 6. CREATE CUSTOMERS
  const customersToCreate = 20;
  const customers = [];
  for (let i = 0; i < customersToCreate; i++) {
    const fName = getRandomElement(firstNames);
    const lName = getRandomElement(lastNames);
    const email = `customer${i}_${Date.now()}@example.com`;
    const password = await bcrypt.hash("123456", 10);

    const user = await prisma.user.create({
      data: {
        name: `${fName} ${lName}`,
        email: email,
        mobile: `99${getRandomInt(10000000, 99999999)}`,
        password: password,
        role: "customer",
        createdAt: getRandomDate(new Date(2025, 0, 1), new Date()),
      },
    });

    // Address
    await prisma.address.create({
      data: {
        userId: user.id,
        street: `${getRandomInt(1, 999)} Main St`,
        city: getRandomElement(cities),
        state: "State",
        postalCode: `${getRandomInt(10000, 99999)}`,
        country: "USA",
        type: "HOME",
      },
    });

    customers.push(user);
  }
  console.log(`✅ ${customers.length} Customers Created`);

  // 7. CREATE BOOKINGS (Historical Data)
  const allServices = await prisma.service.findMany({
    include: { businessProfile: true },
  });
  const bookingCount = 80;

  if (allServices.length > 0 && customers.length > 0) {
    for (let i = 0; i < bookingCount; i++) {
      const service = getRandomElement(allServices);
      const customer = getRandomElement(customers);
      const customerAddress = await prisma.address.findFirst({
        where: { userId: customer.id },
      }); // simplifying

      // Distribute dates over last 6 months
      const bookingDate = getRandomDate(
        new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        new Date()
      );
      const status =
        Math.random() > 0.3
          ? "COMPLETED"
          : Math.random() > 0.5
          ? "PENDING"
          : "CANCELLED";

      const booking = await prisma.booking.create({
        data: {
          userId: customer.id,
          serviceId: service.id,
          businessProfileId: service.businessProfileId,
          bookingStatus: status,
          paymentStatus: status === "COMPLETED" ? "PAID" : "PENDING",
          totalAmount: service.price,
          date: bookingDate.toISOString().split("T")[0],
          addressId: customerAddress.id,
          createdAt: bookingDate,
          updatedAt: bookingDate,
        },
      });

      // Create Payment record for completed
      if (status === "COMPLETED") {
        await prisma.customerPayment.create({
          data: {
            userId: customer.id,
            addressId: customerAddress.id,
            status: "PAID",
            amount: service.price,
            bookingIds: booking.id,
            createdAt: bookingDate,
          },
        });

        // Feedback
        if (Math.random() > 0.4) {
          try {
            await prisma.feedback.create({
              data: {
                rating: getRandomInt(3, 5),
                comment: "Great service!",
                userId: customer.id,
                serviceId: service.id,
                bookingId: booking.id,
                servicename: service.name,
                username: customer.name,
                createdAt: bookingDate,
              },
            });
          } catch (e) {
            // Ignore unique constraint violations (P2002) which might occur if serviceId is unique
            if (e.code !== "P2002")
              console.warn("Failed to create feedback:", e.message);
          }
        }
      }
    }
    console.log(`✅ ${bookingCount} Bookings Created with history`);
  }

  console.log("🏁 Seeding Finalized!");
}

async function clearDatabase() {
  console.log("⚠️ Cleaning Database...");
  await prisma.feedback.deleteMany();
  await prisma.customerPayment.deleteMany();
  await prisma.cancellation.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.slot.deleteMany();
  await prisma.service.deleteMany();
  await prisma.providerSubscription.deleteMany();
  await prisma.businessProfile.deleteMany();
  await prisma.address.deleteMany();
  // Keep admin if needed, but here we might want to clean users too excluding admin?
  // For safety, let's just delete non-admins
  await prisma.user.deleteMany({ where: { role: { not: "admin" } } });
  console.log("Database Cleaned.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
