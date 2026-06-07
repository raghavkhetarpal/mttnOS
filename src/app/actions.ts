"use server";

import { ApplicantStatus } from "@prisma/client";
import { prisma } from "./db";
import { revalidatePath } from "next/cache";

export async function getApplicants() {
  return prisma.applicant.findMany({
    include: {
      applications: {
        include: { position: true }
      },
      notes: true,
      scores: true,
      interviews: {
        include: { positions: { include: { position: true } } },
        orderBy: { scheduledAt: 'desc' }
      }
    },
    orderBy: { appliedAt: 'desc' }
  });
}

export async function updateApplicantStatus(applicantId: string, status: ApplicantStatus) {
  const res = await prisma.applicant.update({
    where: { id: applicantId },
    data: { status }
  });
  revalidatePath('/');
  return res;
}

export async function addReviewerNote(applicantId: string, authorId: string, content: string) {
  const res = await prisma.reviewerNote.create({
    data: { content, applicantId, userId: authorId }
  });
  revalidatePath('/');
  return res;
}

export async function getPositions() {
  return prisma.position.findMany({
    orderBy: { createdAt: 'asc' },
    include: { boardSlots: { include: { applicant: true } } }
  });
}

export async function updatePositionSlotCount(id: string, slotCount: number) {
  const res = await prisma.position.update({ where: { id }, data: { slotCount } });
  revalidatePath('/');
  return res;
}

export async function togglePositionActive(id: string, isActive: boolean) {
  const res = await prisma.position.update({ where: { id }, data: { isActive } });
  revalidatePath('/');
  return res;
}

export async function getDefaultBoardFormation() {
  let active = await prisma.boardFormation.findFirst({ where: { isActive: true }, include: { slots: true } });
  if (!active) {
    active = await prisma.boardFormation.create({
      data: { name: "MTTN Board", isActive: true },
      include: { slots: true }
    });
  }
  return active;
}

export async function assignToBoardSlot(applicantId: string, positionId: string, formationId: string) {
  const res = await prisma.boardSlot.create({
    data: { applicantId, positionId, formationId }
  });
  revalidatePath('/');
  return res;
}

export async function removeFromBoardSlot(applicantId: string, positionId: string, formationId: string) {
  const slot = await prisma.boardSlot.findFirst({
    where: { applicantId, positionId, formationId }
  });
  if (slot) {
    const res = await prisma.boardSlot.delete({ where: { id: slot.id } });
    revalidatePath('/');
    return res;
  }
}

// --- Interview CRUD ---

/**
 * Schedules or replaces the interview for an applicant.
 * Enforces ONE interview per applicant by deleting any existing ones first.
 */
export async function scheduleInterview(
  applicantId: string,
  scheduledAt: Date,
  link: string,
  targetPositions?: string[],
  interviewers?: string[]
) {
  const intv = await prisma.interview.create({
    data: {
      applicantId,
      scheduledAt,
      link: link || null,
      status: 'SCHEDULED',
      panelists: interviewers || []
    }
  });

  if (targetPositions && targetPositions.length > 0) {
    const positions = await prisma.position.findMany({
      where: { shortCode: { in: targetPositions } }
    });
    
    if (positions.length > 0) {
      await prisma.interviewPosition.createMany({
        data: positions.map(p => ({
          interviewId: intv.id,
          positionId: p.id
        }))
      });
    }
  }

  // Also update applicant status to INTERVIEW_SCHEDULED
  await prisma.applicant.update({
    where: { id: applicantId },
    data: { status: 'INTERVIEW_SCHEDULED' }
  });

  revalidatePath('/');
  return intv;
}

/**
 * Updates an existing interview's details (date, link, positions, interviewers).
 */
export async function updateInterviewDetails(
  interviewId: string,
  scheduledAt: Date,
  link: string,
  targetPositions?: string[],
  interviewers?: string[]
) {
  const intv = await prisma.interview.update({
    where: { id: interviewId },
    data: {
      scheduledAt,
      link: link || null,
      status: 'SCHEDULED',
      panelists: interviewers || []
    }
  });

  await prisma.interviewPosition.deleteMany({ where: { interviewId } });
  
  if (targetPositions && targetPositions.length > 0) {
    const positions = await prisma.position.findMany({
      where: { shortCode: { in: targetPositions } }
    });
    
    if (positions.length > 0) {
      await prisma.interviewPosition.createMany({
        data: positions.map(p => ({
          interviewId: intv.id,
          positionId: p.id
        }))
      });
    }
  }

  revalidatePath('/');
  return intv;
}

export async function updateInterviewStatus(id: string, status: 'SCHEDULED' | 'COMPLETED' | 'MISSED' | 'RESCHEDULED') {
  const res = await prisma.interview.update({
    where: { id },
    data: { status },
    include: { applicant: true }
  });

  if (status === 'COMPLETED' && res.applicant.status === 'INTERVIEW_SCHEDULED') {
    await prisma.applicant.update({
      where: { id: res.applicantId },
      data: { status: 'INTERVIEWED' }
    });
  }

  revalidatePath('/');
  return res;
}

export async function deleteInterview(id: string) {
  await prisma.interviewPosition.deleteMany({ where: { interviewId: id } });
  const res = await prisma.interview.delete({ where: { id } });
  revalidatePath('/');
  return res;
}

export async function submitInterviewEvaluation(interviewId: string, data: any) {
  const { notes, recommendation, targetPositions } = data;
  
  // 1. Update the interview with shared remarks and final recommendation
  const res = await prisma.interview.update({
    where: { id: interviewId },
    data: {
      remarks: notes,
      recommendation: recommendation,
      status: 'COMPLETED' // ensuring it's marked completed
    },
    include: { positions: { include: { position: true } } }
  });

  // 2. Map recommendation to Application status
  const statusMap: any = { Recommend: 'SELECTED', Waitlist: 'WAITLISTED', Reject: 'REJECTED' };
  const targetStatus = statusMap[recommendation];
  
  if (targetStatus && res.positions && res.positions.length > 0) {
    // 3. Update outcome per position and update Application status
    for (const ip of res.positions) {
      await prisma.interviewPosition.update({
        where: { id: ip.id },
        data: { outcome: recommendation, evaluatedAt: new Date() }
      });
      
      // Update the specific application status
      await prisma.application.updateMany({
        where: {
          applicantId: res.applicantId,
          positionId: ip.positionId
        },
        data: { status: targetStatus }
      });
    }
  }
  
  // 4. Fallback updating applicant status overall if we want to show global pipeline movement
  if (targetStatus) {
    await prisma.applicant.update({
      where: { id: res.applicantId },
      data: { status: targetStatus }
    });
  }

  revalidatePath('/');
  return res;
}
