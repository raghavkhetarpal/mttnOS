import { PrismaClient, PositionCategory, PositionLevel, ApplicantStatus } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as xlsx from "xlsx";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CANONICAL_POSITIONS = [
  // Executive Leadership
  { title: "Editor in Chief", shortCode: "EiC", department: "Executive", level: PositionLevel.LEADERSHIP, category: PositionCategory.EXECUTIVE, slotCount: 1 },
  { title: "Managing Editor", shortCode: "ME", department: "Executive", level: PositionLevel.LEADERSHIP, category: PositionCategory.EXECUTIVE, slotCount: 1 },
  { title: "Head of Human Resources", shortCode: "HoHR", department: "HR", level: PositionLevel.LEADERSHIP, category: PositionCategory.EXECUTIVE, slotCount: 1 },
  
  // Department Heads
  { title: "Head of Photography", shortCode: "HoP", department: "Photography", level: PositionLevel.HEAD, category: PositionCategory.DEPARTMENT_HEAD, slotCount: 2 },
  { title: "Head of Videography", shortCode: "HoV", department: "Videography", level: PositionLevel.HEAD, category: PositionCategory.DEPARTMENT_HEAD, slotCount: 2 },
  { title: "Head of Arts and Graphics", shortCode: "HoAnG", department: "Arts and Graphics", level: PositionLevel.HEAD, category: PositionCategory.DEPARTMENT_HEAD, slotCount: 2 },
  { title: "Head of Business Development and Public Relations", shortCode: "HoBDPR", department: "BDPR", level: PositionLevel.HEAD, category: PositionCategory.DEPARTMENT_HEAD, slotCount: 2 },
  { title: "Head of Web and App Development", shortCode: "HoDev", department: "Development", level: PositionLevel.HEAD, category: PositionCategory.DEPARTMENT_HEAD, slotCount: 2 },
  { title: "Head of Writing", shortCode: "HoW", department: "Writing", level: PositionLevel.HEAD, category: PositionCategory.DEPARTMENT_HEAD, slotCount: 2 },
  
  // Subheads
  { title: "Subhead of Photography", shortCode: "SHoP", department: "Photography", level: PositionLevel.SUBHEAD, category: PositionCategory.SUBHEAD, slotCount: 2 },
  { title: "Subhead of Videography", shortCode: "SHoV", department: "Videography", level: PositionLevel.SUBHEAD, category: PositionCategory.SUBHEAD, slotCount: 2 },
  { title: "Subhead of Arts and Graphics", shortCode: "SHoAnG", department: "Arts and Graphics", level: PositionLevel.SUBHEAD, category: PositionCategory.SUBHEAD, slotCount: 2 },
  { title: "Subhead of Business Development and Public Relations", shortCode: "SHoBDPR", department: "BDPR", level: PositionLevel.SUBHEAD, category: PositionCategory.SUBHEAD, slotCount: 2 },
  { title: "Subhead of Web and App Development", shortCode: "SHoDev", department: "Development", level: PositionLevel.SUBHEAD, category: PositionCategory.SUBHEAD, slotCount: 2 },
  { title: "Subhead of Writing", shortCode: "SHoW", department: "Writing", level: PositionLevel.SUBHEAD, category: PositionCategory.SUBHEAD, slotCount: 2 },
];

function normalizeRoleString(raw: string): string | null {
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // EIC
  if (s.includes('editorinchief') || s === 'eic') return "Editor in Chief";
  if (s.includes('managingeditor') || s === 'me') return "Managing Editor";
  if (s.includes('headofhr') || s.includes('humanresources') || s === 'hohr') return "Head of Human Resources";
  
  // Heads
  if ((s.includes('head') && !s.includes('sub')) || s.startsWith('ho')) {
    if (s.includes('photo') || s === 'hop') return "Head of Photography";
    if (s.includes('video') || s === 'hov') return "Head of Videography";
    if (s.includes('art') || s.includes('graphic') || s === 'hoang') return "Head of Arts and Graphics";
    if (s.includes('bd') || s.includes('pr') || s.includes('business') || s === 'hobdpr') return "Head of Business Development and Public Relations";
    if (s.includes('web') || s.includes('app') || s.includes('dev') || s === 'hodev') return "Head of Web and App Development";
    if (s.includes('writ') || s === 'how') return "Head of Writing";
  }
  
  // Subheads
  if (s.includes('subhead') || s.startsWith('sho')) {
    if (s.includes('photo') || s === 'shop') return "Subhead of Photography";
    if (s.includes('video') || s === 'shov') return "Subhead of Videography";
    if (s.includes('art') || s.includes('graphic') || s === 'shoang') return "Subhead of Arts and Graphics";
    if (s.includes('bd') || s.includes('pr') || s.includes('business') || s === 'shobdpr') return "Subhead of Business Development and Public Relations";
    if (s.includes('web') || s.includes('app') || s.includes('dev') || s === 'shodev') return "Subhead of Web and App Development";
    if (s.includes('writ') || s === 'show') return "Subhead of Writing";
  }
  
  return null;
}

function normalizeCollegeString(raw: string): string {
  if (!raw) return "MIT";
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (s.includes("mic")) return "MIC";
  if (s.includes("msce")) return "MSCE";
  if (s.includes("misha")) return "MISHA";
  if (s.includes("mit")) return "MIT";
  return "MIT";
}

// Convert "Head of X, Head of Y" string into an array of canonical shortcodes/titles
function extractCanonicalRoles(roleStr: string): string[] {
  if (!roleStr) return [];
  const roles = roleStr.split(/[,\/&]/).map(r => r.trim()).filter(Boolean);
  const matched = new Set<string>();
  
  for (const r of roles) {
    const canonical = normalizeRoleString(r);
    if (canonical) matched.add(canonical);
  }
  
  // Fallback: If no commas but we still didn't match, maybe they wrote "Head of Photo and Video"
  if (matched.size === 0 && roleStr) {
     const s = roleStr.toLowerCase();
     // Test some multiple inclusions manually
     if (s.includes('photo')) matched.add(s.includes('sub') ? "Subhead of Photography" : "Head of Photography");
     if (s.includes('video')) matched.add(s.includes('sub') ? "Subhead of Videography" : "Head of Videography");
  }
  
  return Array.from(matched);
}

function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}

async function main() {
  const filePath = path.join(process.cwd(), "..", "logos", "data.xlsx");
  console.log(`Reading Excel file from ${filePath}`);
  
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName]);
  
  console.log(`Parsed ${data.length} rows.`);

  // Pass 1: Upsert all CANONICAL positions
  console.log("Seeding canonical positions...");
  const positionMap = new Map<string, string>(); // canonical title -> positionId
  
  for (const pos of CANONICAL_POSITIONS) {
    const p = await prisma.position.upsert({
      where: { title: pos.title },
      update: { 
        shortCode: pos.shortCode,
        department: pos.department,
        level: pos.level,
        category: pos.category,
        slotCount: pos.slotCount
      },
      create: pos
    });
    positionMap.set(p.title, p.id);
  }

  // Pass 2: Upsert applicants
  for (const row of data) {
    const email = row["Email Address"]?.trim();
    if (!email) continue;
    
    const name = row["Name"]?.trim() || "Unknown";
    const college = normalizeCollegeString(row["College"]);
    const semester = row["Semester"]?.trim() || "Unknown";
    const whyFit = row["Why do you think you’re the best fit for the post?"] || "";
    const planOfAction = row["If you are applying for any Executive Board (EB) or Managing Board (MB) position, please answer the following:\nWhat would be your Plan of Action if selected for the post(s) you’ve applied for?\nYou may either:\nWrite your answer in the space provided below, or\nUpload a video (e.g., via Google Drive or YouTube link)\n->If using Google Drive: Ensure the link is viewable by “Anyone with the link.”\n-> If using YouTube: The video should be set to Unlisted or Public (not Private)."] || "";
    const pastWork = row["Describe in detail all your past work and contribution to the organisation:"] || "";
    const alternatives = row["If not you, who else would be equally suitable for the position(s) you are applying for?"] || "";
    const idealBoard = row["What would be your ideal Executive Board? (Along with you in the position of your choice) "] || "";
    const continueRaw = row["Would you continue being a part of MTTN if you are not selected in the Board?"];
    const continueIfNot = continueRaw?.trim().toLowerCase() === "yes";
    const timestampSerial = row["Timestamp"];
    
    const appliedAt = typeof timestampSerial === "number" ? excelDateToJSDate(timestampSerial) : new Date();

    const ebRoles = extractCanonicalRoles(row["Executive Board: You can apply for any number of positions, irrespective of your department."] || "");
    const mbRoles = extractCanonicalRoles(row["Managing Board"] || "");
    
    const allRoles = new Set([...ebRoles, ...mbRoles]);

    const overallScore = Math.floor(55 + Math.random() * 45);

    const applicant = await prisma.applicant.upsert({
      where: { email },
      update: {
        name, college, semester, whyFit, planOfAction, pastWork,
        alternatives, idealBoard, continueIfNot, appliedAt, phone: "+919999999999"
      },
      create: {
        email, name, college, semester, whyFit, planOfAction, pastWork,
        alternatives, idealBoard, continueIfNot, appliedAt, overallScore,
        status: ApplicantStatus.APPLIED, phone: "+919999999999"
      }
    });

    for (const roleTitle of Array.from(allRoles)) {
      const positionId = positionMap.get(roleTitle);
      if (positionId) {
        await prisma.application.upsert({
          where: {
            applicantId_positionId: {
              applicantId: applicant.id,
              positionId: positionId
            }
          },
          update: {},
          create: {
            applicantId: applicant.id,
            positionId: positionId,
            status: ApplicantStatus.APPLIED
          }
        });
      } else {
         console.warn(`Unmapped canonical role derived? ${roleTitle}`);
      }
    }
  }

  console.log("Import completed successfully.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
