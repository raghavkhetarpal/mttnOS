import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function normalizeCollegeString(raw: string): string {
  if (!raw) return "MIT";
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (s.includes("mic")) return "MIC";
  if (s.includes("msce")) return "MSCE";
  if (s.includes("misha")) return "MISHA";
  if (s.includes("mit")) return "MIT";
  return "MIT";
}

async function main() {
  const applicants = await prisma.applicant.findMany();
  for (const a of applicants) {
    const normalized = normalizeCollegeString(a.college);
    if (normalized !== a.college) {
      await prisma.applicant.update({
        where: { id: a.id },
        data: { college: normalized }
      });
      console.log(`Updated ${a.college} -> ${normalized}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
