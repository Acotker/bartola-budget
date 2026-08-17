// Runner for the financial-intake backfill. Local use only:
//   npx tsx prisma/backfill.ts
import { backfillAll } from "../src/lib/backfill-intake";
import { prisma } from "../src/lib/db";

backfillAll()
  .then(async (results) => {
    console.log(JSON.stringify(results, null, 2));
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
