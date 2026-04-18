import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create sample customers
  const customers = await Promise.all([
    prisma.customerMaster.upsert({
      where: { customerCode: "CUST-001" },
      update: {},
      create: {
        customerCode: "CUST-001",
        customerName: "Sample Customer A",
        notificationRuleSet: "FULL",
        contactEmail: "contact-a@example.com",
        contactName: "Customer A Contact",
      },
    }),
    prisma.customerMaster.upsert({
      where: { customerCode: "CUST-002" },
      update: {},
      create: {
        customerCode: "CUST-002",
        customerName: "Sample Customer B",
        notificationRuleSet: "EOL_HIGH_RISK",
        contactEmail: "contact-b@example.com",
        contactName: "Customer B Contact",
      },
    }),
  ]);

  console.log(`Created ${customers.length} customers`);

  // Create a sample PCN event
  const event = await prisma.pcnEventMaster.upsert({
    where: { pcnNumber: "SEED-PCN-001" },
    update: {},
    create: {
      notificationSource: "MANUAL_UPLOAD",
      receivedDate: new Date(),
      vendorName: "Texas Instruments",
      pcnNumber: "SEED-PCN-001",
      pcnTitle: "Sample PCN - Package Change QFN to BGA",
      pcnType: "PCN",
      status: "PENDING",
    },
  });

  console.log(`Created sample PCN event: ${event.id}`);
  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
