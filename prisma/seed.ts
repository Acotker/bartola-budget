import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "maria@demo.bartola";
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash },
  });

  // Idempotent: rebuild this demo user's plan from scratch each run.
  await prisma.plan.deleteMany({ where: { userId: user.id } });

  const plan = await prisma.plan.create({
    data: {
      userId: user.id,
      poolAmountCents: 6_000_000,
      startDate: "2026-09-01",
      endDate: "2027-08-31",
    },
  });

  const rent = await prisma.programSpend.create({
    data: { planId: plan.id, name: "Rent", isRecurring: true, freq: "monthly", anchorDay: 1, amountPerOccurrenceCents: 150_000 },
  });
  const groceries = await prisma.programSpend.create({
    data: { planId: plan.id, name: "Groceries", isRecurring: true, freq: "weekly", amountPerOccurrenceCents: 15_000 },
  });
  await prisma.programSpend.create({
    data: { planId: plan.id, name: "Trips fund", isRecurring: true, freq: "monthly", anchorDay: 1, amountPerOccurrenceCents: 30_000 },
  });

  await prisma.spendEntry.createMany({
    data: [
      { planId: plan.id, date: "2026-09-01", amountCents: 150_000, type: "program", programSpendId: rent.id },
      { planId: plan.id, date: "2026-09-01", amountCents: 12_000, type: "program", programSpendId: groceries.id, note: "Weekly shop" },
      { planId: plan.id, date: "2026-09-08", amountCents: 15_000, type: "program", programSpendId: groceries.id },
      { planId: plan.id, date: "2026-09-02", amountCents: 650, type: "s2s", note: "Coffee" },
      { planId: plan.id, date: "2026-09-03", amountCents: 1_200, type: "s2s", note: "Lunch" },
      { planId: plan.id, date: "2026-09-05", amountCents: 800, type: "s2s" },
      { planId: plan.id, date: "2026-09-07", amountCents: 450, type: "s2s" },
      { planId: plan.id, date: "2026-09-09", amountCents: 2_200, type: "s2s", note: "Dinner out" },
    ],
  });

  console.log(`Seeded demo user ${email} with plan ${plan.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
