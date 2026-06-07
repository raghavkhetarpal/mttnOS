import { Prisma, ApplicantStatus, PositionCategory } from "@prisma/client";

export type ApplicantWithApplications = Prisma.ApplicantGetPayload<{
  include: {
    applications: {
      include: {
        position: true;
      };
    };
    scores: true;
    notes: {
      include: {
        user: {
          select: { name: true; email: true };
        };
      };
    };
  };
}>;

export type ApplicantDetail = Prisma.ApplicantGetPayload<{
  include: {
    applications: {
      include: {
        position: true;
      };
    };
    scores: true;
    notes: {
      include: {
        user: {
          select: { name: true; email: true };
        };
      };
    };
    interviews: {
      include: {
        positions: {
          include: { position: true }
        };
      };
    };
    boardSlots: {
      include: {
        position: true;
        formation: true;
      };
    };
  };
}>;

export type BoardFormationWithSlots = Prisma.BoardFormationGetPayload<{
  include: {
    slots: {
      include: {
        position: true;
        applicant: true;
      };
    };
  };
}>;

export interface ApplicantFilters {
  status?: ApplicantStatus;
  college?: string;
  role?: string;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export interface KPIData {
  totalApplicants: number;
  ebApplicants: number;
  mbApplicants: number;
  bothApplicants: number;
  shortlisted: number;
  willContinue: number;
  avgScore: number;
  reviewed: number;
}

export interface RoleDistribution {
  role: string;
  count: number;
  category: PositionCategory;
}

export interface FunnelStage {
  label: string;
  count: number;
  color: string;
}

export interface TimelinePoint {
  date: string;
  count: number;
}

export interface HeatmapData {
  colleges: string[];
  roles: string[];
  data: Record<string, Record<string, number>>;
}
