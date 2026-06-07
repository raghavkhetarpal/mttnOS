import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { prisma } from './src/app/db';

async function main() {
  console.log('Applicants:', await prisma.applicant.count());
  console.log('Applications:', await prisma.application.count());
  console.log('Positions:', await prisma.position.count());
}

main().catch(console.error).finally(() => prisma.$disconnect());
