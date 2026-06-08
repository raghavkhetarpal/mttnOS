"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getApplicants, updateApplicantStatus, addReviewerNote,
  getPositions, updatePositionSlotCount, togglePositionActive,
  getDefaultBoardFormation, assignToBoardSlot, removeFromBoardSlot,
  scheduleInterview, updateInterviewDetails, updateInterviewStatus, submitInterviewEvaluation, deleteInterview
} from "./actions";
import { ApplicantStatus } from "@prisma/client";

const STATUSES = ['APPLIED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'SELECTED', 'WAITLISTED', 'REJECTED'];
const STATUS_LABELS: Record<string, string> = { 'APPLIED': 'Applied', 'INTERVIEW_SCHEDULED': 'Interview Scheduled', 'INTERVIEWED': 'Interviewed', 'SELECTED': 'Selected', 'WAITLISTED': 'Waitlisted', 'REJECTED': 'Rejected' };
const STATUS_CLASS: Record<string, string> = { 'APPLIED': 's-applied', 'INTERVIEW_SCHEDULED': 's-interview', 'INTERVIEWED': 's-interview', 'SELECTED': 's-selected', 'WAITLISTED': 's-waitlisted', 'REJECTED': 's-rejected' };
const COLORS = ['#7c6af7','#22c55e','#f59e0b','#ef4444','#3b82f6','#14b8a6','#ec4899','#8b5cf6','#06b6d4'];
const AVATAR_COLORS = ['#7c6af7','#22c55e','#f59e0b','#3b82f6','#14b8a6','#ec4899','#f97316'];
const AVAILABLE_INTERVIEWERS = ["Jowan", "Ronit", "Ankith", "Ashika", "Ekansh", "Siea", "Misha", "Sourav", "Raghav", "Mohak Singhal", "Smriti", "Ashwin", "Ishita", "Juwairyah", "Riddhiman"];

function initials(name: string) {
  const p = (name || '').trim().split(' ');
  return (p[0]?.[0] || '') + (p[1]?.[0] || '').toUpperCase();
}
function avatarColor(id: string) {
  let num = 0;
  for (let i = 0; i < id.length; i++) num += id.charCodeAt(i);
  return AVATAR_COLORS[num % AVATAR_COLORS.length];
}

function linkify(text: string | null | undefined): React.ReactNode | null {
  if (!text || !text.trim()) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      const isDrive = part.includes('drive.google.com') || part.includes('docs.google.com');
      const isYT = part.includes('youtube.com') || part.includes('youtu.be');
      const label = isDrive ? '📂 Google Drive' : isYT ? '▶ YouTube' : '🔗 Link';
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all'}}>{label} <i className="ti ti-external-link" style={{fontSize: '11px'}}></i></a>;
    }
    return <span key={i}>{part}</span>;
  });
}
export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: rawApplicants = [], isLoading, isError, error } = useQuery({ queryKey: ['applicants'], queryFn: () => getApplicants() });
  const { data: positions = [], isLoading: isLoadingPos } = useQuery({ queryKey: ['positions'], queryFn: () => getPositions() });
  const { data: boardFormation, isLoading: isLoadingBoard } = useQuery({ queryKey: ['boardFormation'], queryFn: () => getDefaultBoardFormation() });

  const updateStatusMut = useMutation({ mutationFn: (vars: { id: string, status: ApplicantStatus }) => updateApplicantStatus(vars.id, vars.status), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['applicants'] }); showToast('Status updated'); } });
  const addNoteMut = useMutation({ mutationFn: (vars: { id: string, note: string }) => addReviewerNote(vars.id, "admin-id", vars.note), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['applicants'] }); showToast('Note added'); setNoteInput(''); } });
  
  const assignSlotMut = useMutation({ 
    mutationFn: (vars: { applicantId: string, positionId: string, formationId: string }) => assignToBoardSlot(vars.applicantId, vars.positionId, vars.formationId), 
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); queryClient.invalidateQueries({ queryKey: ['boardFormation'] }); } 
  });
  const removeSlotMut = useMutation({ 
    mutationFn: (vars: { applicantId: string, positionId: string, formationId: string }) => removeFromBoardSlot(vars.applicantId, vars.positionId, vars.formationId), 
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); queryClient.invalidateQueries({ queryKey: ['boardFormation'] }); } 
  });
  const updateSlotCountMut = useMutation({ 
    mutationFn: (vars: { id: string, count: number }) => updatePositionSlotCount(vars.id, vars.count), 
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); } 
  });
  const togglePosMut = useMutation({ 
    mutationFn: (vars: { id: string, active: boolean }) => togglePositionActive(vars.id, vars.active), 
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); } 
  });
  
  const scheduleInterviewMut = useMutation({
    mutationFn: (vars: { applicantId: string, scheduledAt: Date, link: string, targetPositions?: string[], interviewers?: string[] }) => scheduleInterview(vars.applicantId, vars.scheduledAt, vars.link, vars.targetPositions, vars.interviewers),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['applicants'] });
      const prev = queryClient.getQueryData(['applicants']);
      queryClient.setQueryData(['applicants'], (old: any) => {
        if (!old) return old;
        return old.map((a: any) => {
          if (a.id === vars.applicantId) {
            return {
              ...a,
              status: 'INTERVIEW_SCHEDULED',
              interviews: [{
                id: 'temp-intv-' + Date.now(),
                applicantId: a.id,
                scheduledAt: vars.scheduledAt.toISOString(),
                link: vars.link,
                targetPositions: vars.targetPositions,
                status: 'SCHEDULED',
                panelists: (vars.interviewers || []).map(name => ({ id: 'temp-pan-' + name, name }))
              }]
            };
          }
          return a;
        });
      });
      return { prev };
    },
    onError: (err, vars, context) => queryClient.setQueryData(['applicants'], context?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['applicants'] }),
    onSuccess: () => { showToast('Interview scheduled'); resetInterviewForm(); }
  });

  const updateInterviewDetailsMut = useMutation({
    mutationFn: (vars: { applicantId: string, interviewId: string, scheduledAt: Date, link: string, targetPositions?: string[], interviewers?: string[] }) => updateInterviewDetails(vars.interviewId, vars.scheduledAt, vars.link, vars.targetPositions, vars.interviewers),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['applicants'] });
      const prev = queryClient.getQueryData(['applicants']);
      queryClient.setQueryData(['applicants'], (old: any) => {
        if (!old) return old;
        return old.map((a: any) => {
          if (a.id === vars.applicantId) {
            return {
              ...a,
              interviews: a.interviews.map((intv: any) => intv.id === vars.interviewId ? {
                ...intv,
                scheduledAt: vars.scheduledAt.toISOString(),
                link: vars.link,
                targetPositions: vars.targetPositions,
                panelists: (vars.interviewers || []).map(name => ({ id: 'temp-pan-' + name, name }))
              } : intv)
            };
          }
          return a;
        });
      });
      return { prev };
    },
    onError: (err, vars, context) => queryClient.setQueryData(['applicants'], context?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['applicants'] }),
    onSuccess: () => { showToast('Interview updated'); resetInterviewForm(); }
  });
  
  const updateInterviewMut = useMutation({
    mutationFn: (vars: { applicantId: string, id: string, status: any }) => updateInterviewStatus(vars.id, vars.status),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['applicants'] });
      const prev = queryClient.getQueryData(['applicants']);
      queryClient.setQueryData(['applicants'], (old: any) => {
        if (!old) return old;
        return old.map((a: any) => {
          if (a.id === vars.applicantId) {
            return {
              ...a,
              interviews: a.interviews.map((intv: any) => intv.id === vars.id ? { ...intv, status: vars.status } : intv)
            };
          }
          return a;
        });
      });
      return { prev };
    },
    onError: (err, vars, context) => queryClient.setQueryData(['applicants'], context?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['applicants'] }),
    onSuccess: () => { showToast('Interview updated'); }
  });

  const deleteInterviewMut = useMutation({
    mutationFn: (vars: { applicantId: string, id: string }) => deleteInterview(vars.id),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['applicants'] });
      const prev = queryClient.getQueryData(['applicants']);
      queryClient.setQueryData(['applicants'], (old: any) => {
        if (!old) return old;
        return old.map((a: any) => {
          if (a.id === vars.applicantId) {
            return {
              ...a,
              interviews: a.interviews.filter((intv: any) => intv.id !== vars.id)
            };
          }
          return a;
        });
      });
      return { prev };
    },
    onError: (err, vars, context) => queryClient.setQueryData(['applicants'], context?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['applicants'] }),
    onSuccess: () => { showToast('Interview deleted'); setConfirmDeleteId(null); }
  });

  const submitEvalMut = useMutation({
    mutationFn: (vars: { applicantId: string, interviewId: string, data: any }) => submitInterviewEvaluation(vars.interviewId, vars.data),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['applicants'] });
      const prev = queryClient.getQueryData(['applicants']);
      queryClient.setQueryData(['applicants'], (old: any) => {
        if (!old) return old;
        return old.map((a: any) => {
          if (a.id === vars.applicantId) {
            const interviews = a.interviews.map((intv: any) => {
               if (intv.id === vars.interviewId) {
                  return { ...intv, remarks: vars.data.notes, recommendation: vars.data.recommendation, status: 'COMPLETED' };
               }
               return intv;
            });
            // Also optimistically map applicant status
            const statusMap: any = { Recommend: 'SELECTED', Waitlist: 'WAITLISTED', Reject: 'REJECTED' };
            const newStatus = statusMap[vars.data.recommendation] || a.status;
            return { ...a, status: newStatus, interviews };
          }
          return a;
        });
      });
      return { prev };
    },
    onError: (err, vars, context) => queryClient.setQueryData(['applicants'], context?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['applicants'] }),
    onSuccess: () => { showToast('Evaluation submitted'); setEvalForm({interviewId: '', name: 'Reviewer', notes: '', recommendation: 'Recommend'}); }
  });

  // State
  const [interviewForm, setInterviewForm] = useState<{date: string, time: string, link: string, targetPositions: string[], interviewers: string[]}>({ date: '', time: '', link: '', targetPositions: [], interviewers: [] });
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [evalForm, setEvalForm] = useState({ interviewId: '', name: 'Reviewer', notes: '', recommendation: 'Recommend' });
  const [activePage, setActivePage] = useState('dashboard');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [searchQ, setSearchQ] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Filters for ATS
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterCollege, setFilterCollege] = useState('All');
  const [filterPosition, setFilterPosition] = useState('All');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [sortKey, setSortKey] = useState('appliedAt');
  const [sortDir, setSortDir] = useState(1);

  // Profile overlay
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [showToastObj, setShowToast] = useState(false);

  // Charts built ref
  const chartsRef = useRef(false);

  const resetInterviewForm = useCallback(() => {
    setInterviewForm({ date: '', time: '', link: '', targetPositions: [], interviewers: [] });
    setEditingInterviewId(null);
  }, []);

  // Clear forms when switching applicant
  useEffect(() => {
    resetInterviewForm();
    setEvalForm(prev => ({ ...prev, interviewId: '', notes: '', recommendation: 'Recommend' }));
    setConfirmDeleteId(null);
  }, [selectedApplicantId, resetInterviewForm]);

  // Lock body scroll when overlay is open
  useEffect(() => {
    if (isSidebarOpen || selectedApplicantId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; }
  }, [isSidebarOpen, selectedApplicantId]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2800);
  };

  // Map backend format to frontend expected format
  const applicants = React.useMemo(() => rawApplicants.map((a: any) => {
    const eb_roles = a.applications.filter((app: any) => app.position.category === 'EXECUTIVE').map((app: any) => app.position.title);
    const mb_roles = a.applications.filter((app: any) => app.position.category !== 'EXECUTIVE').map((app: any) => app.position.title);
    return {
      ...a,
      eb_roles,
      mb_roles,
      score: a.overallScore || Math.floor(55 + Math.random() * 45),
      notes: a.notes || []
    };
  }), [rawApplicants]);

  const allRoles = (a: any) => [...(a.eb_roles || []), ...(a.mb_roles || [])];
  
  const getHierarchyScore = (a: any) => {
    if (!a.applications || a.applications.length === 0) return 99;
    let best = 99;
    a.applications.forEach((app: any) => {
      const code = (app.position?.shortCode || '').toUpperCase();
      let score = 6;
      if (code === 'EIC') score = 1;
      else if (code === 'ME') score = 2;
      else if (code === 'HOHR') score = 3;
      else if (code.startsWith('HO')) score = 4;
      else if (code.startsWith('SH') || code.includes('SUBHEAD')) score = 5;
      if (score < best) best = score;
    });
    return best;
  };

  const getPrimaryDepartment = (a: any) => {
    if (!a.applications || a.applications.length === 0) return 'Unassigned';
    let bestScore = 99;
    let bestDept = 'Unassigned';
    a.applications.forEach((app: any) => {
      const code = (app.position?.shortCode || '').toUpperCase();
      let score = 6;
      if (code === 'EIC') score = 1;
      else if (code === 'ME') score = 2;
      else if (code === 'HOHR') score = 3;
      else if (code.startsWith('HO')) score = 4;
      else if (code.startsWith('SH') || code.includes('SUBHEAD')) score = 5;
      if (score < bestScore) {
        bestScore = score;
        bestDept = app.position?.department || 'Unassigned';
      }
    });
    return bestDept;
  };

  const getRoleTypeGroup = (a: any) => {
    const score = getHierarchyScore(a);
    if (score === 1) return 'Editor in Chief (EiC)';
    if (score === 2) return 'Managing Editor (ME)';
    if (score === 3) return 'Head of HR (HoHR)';
    if (score === 4) return 'Department Heads (EB)';
    if (score === 5) return 'SubHeads (MB)';
    if (score === 6) return 'General Roles';
    return 'Unassigned';
  };
  
  const renderRoleTags = (a: any) => {
    if (!a.applications || a.applications.length === 0) return <span style={{fontSize: '11px', color: 'var(--text3)'}}>No role</span>;
    return (
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {a.applications.map((app: any) => {
          const cat = app.position.category;
          const sc = app.position.shortCode;
          let color = 'var(--text3)', bg = 'var(--bg3)';
          if (cat === 'EXECUTIVE') { color = '#f59e0b'; bg = '#f59e0b20'; } // Amber for Exec
          else if (cat === 'DEPARTMENT_HEAD') { color = '#3b82f6'; bg = '#3b82f620'; } // Blue for EB
          else { color = '#a855f7'; bg = '#a855f720'; } // Purple for MB
          return <span key={app.position.id} title={app.position.title} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', color, background: bg, fontWeight: 600 }}>{sc}</span>;
        })}
      </div>
    );
  };

  const atsList = React.useMemo(() => {
    let list = [...applicants];
    if (filterStatus !== 'All') list = list.filter(a => a.status === filterStatus);
    if (filterCollege !== 'All') list = list.filter(a => a.college === filterCollege);
    
    if (filterPosition !== 'All') {
      list = list.filter(a => {
        const hasTier = (tier: number) => a.applications?.some((app: any) => {
          const code = (app.position?.shortCode || '').toUpperCase();
          let score = 6;
          if (code === 'EIC') score = 1;
          else if (code === 'ME') score = 2;
          else if (code === 'HOHR') score = 3;
          else if (code.startsWith('HO')) score = 4;
          else if (code.startsWith('SH') || code.includes('SUBHEAD')) score = 5;
          return score === tier;
        });

        if (filterPosition === 'EiC') return hasTier(1);
        if (filterPosition === 'ME') return hasTier(2);
        if (filterPosition === 'HR') return hasTier(3);
        if (filterPosition === 'Head') return hasTier(4);
        if (filterPosition === 'SubHead') return hasTier(5);
        return false;
      });
    }

    if (filterDepartment !== 'All') {
      list = list.filter(a => a.applications?.some((app: any) => {
        const d = app.position?.department || '';
        if (filterDepartment === 'Arts & Graphics') return d === 'Arts and Graphics';
        return d === filterDepartment;
      }));
    }

    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter(a => 
        (a.name || '').toLowerCase().includes(q) || 
        (a.email || '').toLowerCase().includes(q) || 
        allRoles(a).join(' ').toLowerCase().includes(q) || 
        (a.whyFit || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortKey === 'hierarchy') {
        const hA = getHierarchyScore(a);
        const hB = getHierarchyScore(b);
        if (hA !== hB) return (hA - hB) * sortDir;
        const nA = a.name || '';
        const nB = b.name || '';
        return nA.localeCompare(nB) * sortDir;
      }
      const va = a[sortKey as keyof typeof a] || '';
      const vb = b[sortKey as keyof typeof b] || '';
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
    return list;
  }, [applicants, filterStatus, filterPosition, filterDepartment, filterCollege, searchQ, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir * -1);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  // Chart Rendering
  useEffect(() => {
    if (!window || typeof (window as any).Chart === 'undefined' || applicants.length === 0) return;
    const Chart = (window as any).Chart;

    if (activePage === 'dashboard') {
      try {
        const roleCount: Record<string, number> = {};
        applicants.forEach(a => allRoles(a).forEach(r => { roleCount[r] = (roleCount[r] || 0) + 1; }));
        const roles = Object.entries(roleCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
        
        let el = document.getElementById('chart-roles');
        if (el && !(el as any)._chartInstance) {
          (el as any)._chartInstance = new Chart(el, {
            type: 'bar',
            data: {
              labels: roles.map(r => r[0].replace('Head of ', 'HoP: ').replace('Subhead of ', 'Sub: ').replace('Editor in Chief', 'EIC').replace('Managing Editor', 'ME').substring(0, 18)),
              datasets: [{ label: 'Apps', data: roles.map(r => r[1]), backgroundColor: COLORS.slice(0, 8), borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#606080', font: { size: 10 } }, grid: { color: '#1c1c28' } }, y: { ticks: { color: '#606080' }, grid: { color: '#1c1c28' } } } }
          });
        }
      } catch(e) {}
    } else if (activePage === 'analytics') {
      try {
        // College
        const cc: Record<string, number> = {};
        applicants.forEach(a => { cc[a.college] = (cc[a.college] || 0) + 1; });
        let elCol = document.getElementById('chart-college');
        if (elCol && !(elCol as any)._chartInstance) {
          (elCol as any)._chartInstance = new Chart(elCol, {
            type: 'doughnut',
            data: { labels: Object.keys(cc), datasets: [{ data: Object.values(cc), backgroundColor: ['#7c6af7', '#22c55e', '#f59e0b', '#3b82f6'], hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#a0a0c0', font: { size: 11 }, boxWidth: 10 } } } }
          });
        }
        
        // Department
        const dc: Record<string, number> = {};
        applicants.forEach(a => a.applications?.forEach((app: any) => { dc[app.position.department] = (dc[app.position.department] || 0) + 1; }));
        let elDept = document.getElementById('chart-dept');
        if (elDept && !(elDept as any)._chartInstance) {
          (elDept as any)._chartInstance = new Chart(elDept, {
            type: 'bar',
            data: { labels: Object.keys(dc), datasets: [{ label: 'Applications', data: Object.values(dc), backgroundColor: COLORS, borderRadius: 4 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1c1c28' } }, y: { grid: { display: false } } } }
          });
        }
        
        // Funnel
        const funnel = { 'Applied': applicants.length, 'Interview Scheduled': applicants.filter(a => ['INTERVIEW_SCHEDULED', 'INTERVIEWED', 'SELECTED', 'WAITLISTED', 'REJECTED'].includes(a.status)).length, 'Interviewed': applicants.filter(a => ['INTERVIEWED', 'SELECTED', 'WAITLISTED', 'REJECTED'].includes(a.status)).length, 'Selected': applicants.filter(a => a.status === 'SELECTED').length };
        let elFunnel = document.getElementById('chart-funnel');
        if (elFunnel && !(elFunnel as any)._chartInstance) {
          (elFunnel as any)._chartInstance = new Chart(elFunnel, {
            type: 'bar',
            data: { labels: Object.keys(funnel), datasets: [{ label: 'Count', data: Object.values(funnel), backgroundColor: '#3b82f6', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#1c1c28' } } } }
          });
        }
        
        // Ratio
        const rc: Record<string, number> = {};
        positions.forEach((p: any) => { if (p.slotCount > 0) rc[p.shortCode] = (applicants.filter(a => a.applications?.some((app: any) => app.positionId === p.id)).length / p.slotCount); });
        let elRatio = document.getElementById('chart-ratio');
        if (elRatio && !(elRatio as any)._chartInstance) {
          const sorted = Object.entries(rc).sort((a,b) => b[1] - a[1]).slice(0, 8);
          (elRatio as any)._chartInstance = new Chart(elRatio, {
            type: 'bar',
            data: { labels: sorted.map(s => s[0]), datasets: [{ label: 'Apps per Slot', data: sorted.map(s => s[1]), backgroundColor: '#ec4899', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#1c1c28' } } } }
          });
        }
      } catch(e) {}
    }
  }, [activePage, applicants, positions]);

  // Drag and drop handlers
  const handleDragStart = (e: any, applicantId: string) => { 
    e.dataTransfer.setData('applicantId', applicantId); 
  };
  
  const handleDrop = (e: any, positionId: string) => {
    e.preventDefault();
    const applicantId = e.dataTransfer.getData('applicantId');
    const pos = positions.find((p: any) => p.id === positionId);
    
    if (applicantId && boardFormation?.id && pos) {
      // Validate slot count
      const filledSlots = pos.boardSlots.filter((bs: any) => bs.formationId === boardFormation.id).length;
      if (filledSlots >= pos.slotCount) {
        showToast("Maximum slots filled for this position!");
        return;
      }
      
      // Assign
      assignSlotMut.mutate({ applicantId, positionId, formationId: boardFormation.id });
    }
  };
  
  const handleDragOver = (e: any) => { 
    e.preventDefault(); 
  };



  const selectedApp = applicants.find(a => a.id === selectedApplicantId);

  // Group positions for Board Formation
  const groupedPositions = React.useMemo(() => {
    const activePositions = positions.filter((p: any) => p.isActive);
    const groups: Record<string, any[]> = {};
    activePositions.forEach((p: any) => {
      if (!groups[p.department]) groups[p.department] = [];
      groups[p.department].push(p);
    });
    return groups;
  }, [positions]);

  const allInterviews = React.useMemo(() => {
    const intvs = applicants.flatMap(a => (a.interviews || []).map((intv: any) => ({ ...intv, applicant: a })));
    intvs.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return intvs;
  }, [applicants]);
  
  const todayInterviews = React.useMemo(() => allInterviews.filter(i => new Date(i.scheduledAt).toDateString() === new Date().toDateString()), [allInterviews]);
  const upcomingInterviews = React.useMemo(() => allInterviews.filter(i => new Date(i.scheduledAt).getTime() > new Date().getTime() && new Date(i.scheduledAt).toDateString() !== new Date().toDateString()), [allInterviews]);
  const completedInterviews = React.useMemo(() => allInterviews.filter(i => i.status === 'COMPLETED'), [allInterviews]);
  const pendingScheduling = React.useMemo(() => applicants.filter(a => a.status === 'APPLIED'), [applicants]);



  if (isLoading || isLoadingPos || isLoadingBoard) return <div className="p-8 text-white">Loading data...</div>;
  if (isError) return <div className="p-8 text-red-500">Error loading data: {String(error)}</div>;

  return (
    <div className="app">
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <button className="sidebar-close" onClick={() => setIsSidebarOpen(false)}><i className="ti ti-x"></i></button>
        <div className="logo">
          <div className="logo-title">MTTN Recruit</div>
          <div className="logo-sub">Board Selection 2026</div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Overview</div>
          <div className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} onClick={() => { setActivePage('dashboard'); setIsSidebarOpen(false); }}><i className="ti ti-layout-dashboard"></i>Dashboard</div>
          <div className={`nav-item ${activePage === 'analytics' ? 'active' : ''}`} onClick={() => { setActivePage('analytics'); setIsSidebarOpen(false); }}><i className="ti ti-chart-bar"></i>Analytics</div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Applicants</div>
          <div className={`nav-item ${activePage === 'ats' ? 'active' : ''}`} onClick={() => { setActivePage('ats'); setIsSidebarOpen(false); }}><i className="ti ti-users"></i>All Applicants <span className="nav-badge">{applicants.length}</span></div>
          <div className={`nav-item ${activePage === 'kanban' ? 'active' : ''}`} onClick={() => { setActivePage('kanban'); setIsSidebarOpen(false); }}><i className="ti ti-layout-columns"></i>Pipeline</div>
          <div className={`nav-item ${activePage === 'interviews' ? 'active' : ''}`} onClick={() => { setActivePage('interviews'); setIsSidebarOpen(false); }}><i className="ti ti-calendar-event"></i>Interviews <span className="nav-badge">{allInterviews.filter(i => i.status === 'SCHEDULED').length}</span></div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Decisions</div>
          <div className={`nav-item ${activePage === 'board' ? 'active' : ''}`} onClick={() => { setActivePage('board'); setIsSidebarOpen(false); }}><i className="ti ti-crown"></i>Board Formation</div>
          <div className={`nav-item ${activePage === 'results' ? 'active' : ''}`} onClick={() => { setActivePage('results'); setIsSidebarOpen(false); }}><i className="ti ti-check"></i>Results <span className="nav-badge">{completedInterviews.length}</span></div>
        </div>
        <div className="nav-group">
          <div className="nav-label">System</div>
          <div className={`nav-item ${activePage === 'settings' ? 'active' : ''}`} onClick={() => { setActivePage('settings'); setIsSidebarOpen(false); }}><i className="ti ti-settings"></i>Admin Settings</div>
        </div>
      </div>

      <div className="main" id="main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setIsSidebarOpen(true)}><i className="ti ti-menu-2"></i></button>
          <div className="page-title">{activePage.charAt(0).toUpperCase() + activePage.slice(1)}</div>
          <div className="topbar-right">
            <div className="search-box">
              <i className="ti ti-search" style={{color: 'var(--text3)', fontSize: '14px'}}></i>
              <input type="text" placeholder="Search applicants..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            </div>
            <div className="avatar" title="Admin">A</div>
          </div>
        </div>

        <div className="content">
          {/* TEMPORARY DEBUG INFO */}
          <div style={{ background: '#3b82f620', color: '#3b82f6', padding: '8px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', display: 'flex', gap: '16px' }}>
            <strong>Debug Data:</strong>
            <span>Applicants: {applicants.length}</span>
            <span>Applications: {applicants.reduce((sum, a) => sum + (a.applications?.length || 0), 0)}</span>
            <span>Positions: {positions.length}</span>
          </div>

          {/* DASHBOARD */}
          <div className={`page ${activePage === 'dashboard' ? 'active' : ''}`}>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-users" style={{color: 'var(--accent2)'}}></i></div>
                <div className="kpi-label">Total Applicants</div>
                <div className="kpi-value">{applicants.length}</div>
                <div className="kpi-delta up">Database synced</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-crown" style={{color: '#f59e0b'}}></i></div>
                <div className="kpi-label">EB Applicants</div>
                <div className="kpi-value">{applicants.filter(a => a.applications?.some((app: any) => app.position?.category === 'EXECUTIVE' || app.position?.category === 'DEPARTMENT_HEAD')).length}</div>
                <div className="kpi-delta up">Leadership & Heads</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-star" style={{color: '#3b82f6'}}></i></div>
                <div className="kpi-label">MB Applicants</div>
                <div className="kpi-value">{applicants.filter(a => a.applications?.some((app: any) => app.position?.category === 'SUBHEAD')).length}</div>
                <div className="kpi-delta up">Subheads</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-microphone" style={{color: '#22c55e'}}></i></div>
                <div className="kpi-label">Interviewed Count</div>
                <div className="kpi-value">{applicants.filter(a => a.status === 'INTERVIEWED' || a.status === 'SELECTED').length}</div>
                <div className="kpi-delta up">Completed</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-clock" style={{color: '#ec4899'}}></i></div>
                <div className="kpi-label">Pending Interview Count</div>
                <div className="kpi-value">{applicants.filter(a => a.status === 'APPLIED' || a.status === 'INTERVIEW_SCHEDULED').length}</div>
                <div className="kpi-delta down">To be evaluated</div>
              </div>
            </div>
            <div className="section-header" style={{marginTop: '24px'}}>
              <div><div className="section-title">Applications by Role</div><div className="section-sub">Detailed breakdown by department and hierarchy</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {Object.entries(groupedPositions)
                .sort(([deptA], [deptB]) => {
                  if (deptA.toLowerCase().includes('leadership') || deptA.toLowerCase().includes('executive')) return -1;
                  if (deptB.toLowerCase().includes('leadership') || deptB.toLowerCase().includes('executive')) return 1;
                  return deptA.localeCompare(deptB);
                })
                .map(([dept, posList]) => (
                <div key={dept} style={{ background: 'var(--bg2)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>{dept}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {posList
                      .sort((a, b) => {
                        const order: Record<string, number> = { 'EXECUTIVE': 1, 'DEPARTMENT_HEAD': 2, 'SUBHEAD': 3 };
                        return (order[a.category] || 9) - (order[b.category] || 9);
                      })
                      .map(p => {
                        const appCount = applicants.filter(a => a.applications?.some((app: any) => app.positionId === p.id)).length;
                        const ratio = p.slotCount > 0 ? (appCount / p.slotCount).toFixed(1) : '0';
                        return (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg1)', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: p.category === 'EXECUTIVE' ? '#f59e0b' : p.category === 'DEPARTMENT_HEAD' ? '#3b82f6' : '#a855f7' }}>{p.shortCode}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text3)' }}>
                              <div title="Applicants"><i className="ti ti-users" style={{marginRight:'4px'}}></i>{appCount}</div>
                              <div title="Slots"><i className="ti ti-chair-director" style={{marginRight:'4px'}}></i>{p.slotCount}</div>
                              <div title="Competition Ratio"><i className="ti ti-percentage" style={{marginRight:'4px'}}></i>{ratio}</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
            <div className="section-header">
              <div><div className="section-title">Recent applicants</div><div className="section-sub">Latest submissions</div></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>College</th><th>Role</th><th>Status</th></tr></thead>
                <tbody>
                  {applicants.slice(0, 6).map(a => (
                    <tr key={a.id} onClick={() => setSelectedApplicantId(a.id)}>
                      <td><div className="name-cell"><div className="avatar-sm" style={{background: avatarColor(a.id)}}>{initials(a.name)}</div><span>{a.name}</span></div></td>
                      <td><span className={`tag tag-${(a.college||'').toLowerCase()}`}>{a.college}</span></td>
                      <td style={{fontSize: '12px', color: 'var(--text3)'}}>{renderRoleTags(a)}</td>
                      <td><span className={`status-badge ${STATUS_CLASS[a.status] || ''}`}>{STATUS_LABELS[a.status] || a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ANALYTICS PAGE */}
          <div className={`page ${activePage === 'analytics' ? 'active' : ''}`}>
            <div className="section-header">
              <div><div className="section-title">Analytics Dashboard</div><div className="section-sub">Recruitment funnel and board insights</div></div>
            </div>
            
            <div className="kpi-grid" style={{ marginBottom: '24px' }}>
              <div className="kpi-card">
                <div className="kpi-label">Interview Conversion Rate</div>
                <div className="kpi-value">
                  {applicants.length ? Math.round((applicants.filter(a => a.status === 'INTERVIEWED' || a.status === 'SELECTED' || a.status === 'WAITLISTED').length / applicants.length) * 100) : 0}%
                </div>
                <div className="kpi-delta up">of total applicants</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Selection Rate</div>
                <div className="kpi-value">
                  {applicants.length ? Math.round((applicants.filter(a => a.status === 'SELECTED').length / applicants.length) * 100) : 0}%
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Vacancy Fulfillment</div>
                <div className="kpi-value">
                  {positions.reduce((sum: number, p: any) => sum + p.slotCount, 0) > 0 ? Math.round((positions.reduce((sum: number, p: any) => sum + p.boardSlots.length, 0) / positions.reduce((sum: number, p: any) => sum + p.slotCount, 0)) * 100) : 0}%
                </div>
                <div className="kpi-delta up">filled slots</div>
              </div>
            </div>

            <div className="charts-row" style={{ flexWrap: 'wrap' }}>
              <div className="chart-card" style={{ minWidth: '45%' }}>
                <div className="chart-title">Applications by Department</div>
                <div className="chart-wrap" style={{ height: '250px' }}><canvas id="chart-dept"></canvas></div>
              </div>
              <div className="chart-card" style={{ minWidth: '45%' }}>
                <div className="chart-title">College Distribution</div>
                <div className="chart-wrap" style={{ height: '250px' }}><canvas id="chart-college"></canvas></div>
              </div>
              <div className="chart-card" style={{ minWidth: '45%' }}>
                <div className="chart-title">Recruitment Funnel</div>
                <div className="chart-wrap" style={{ height: '250px' }}><canvas id="chart-funnel"></canvas></div>
              </div>
              <div className="chart-card" style={{ minWidth: '45%' }}>
                <div className="chart-title">Competition Ratio (Apps per Slot)</div>
                <div className="chart-wrap" style={{ height: '250px' }}><canvas id="chart-ratio"></canvas></div>
              </div>
            </div>
          </div>

          {/* ATS PAGE */}
          <div className={`page ${activePage === 'ats' ? 'active' : ''}`}>
            <div className="section-header">
              <div><div className="section-title">Applicant Tracker</div><div className="section-sub">{atsList.length} of {applicants.length} applicants</div></div>
            </div>
            <div className="filters-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <select className="filter-btn" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="All">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <select className="filter-btn" value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)}>
                <option value="All">Position Hierarchy</option>
                <option value="EiC">EiC</option>
                <option value="ME">ME</option>
                <option value="HR">HoHR</option>
                <option value="Head">Heads</option>
                <option value="SubHead">SubHeads</option>
              </select>
              <select className="filter-btn" value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
                <option value="All">Department</option>
                <option value="Photography">Photography</option>
                <option value="Videography">Videography</option>
                <option value="Arts & Graphics">Arts & Graphics</option>
                <option value="BDPR">BDPR</option>
                <option value="Development">Development</option>
                <option value="Writing">Writing</option>
                <option value="HR">HR</option>
              </select>
              <select className="filter-btn" value={filterCollege} onChange={(e) => setFilterCollege(e.target.value)}>
                <option value="All">All Colleges</option>
                {['MIT','SOC','DOC','TAPMI','WGSHA'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="filter-btn" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                <option value="appliedAt">Sort: Timestamp</option>
                <option value="name">Sort: Name</option>
                <option value="college">Sort: College</option>
                <option value="semester">Sort: Semester</option>
                <option value="hierarchy">Sort: Position Hierarchy</option>
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('name')} style={{cursor:'pointer'}}>Name <i className="ti ti-arrows-sort"></i></th>
                    <th onClick={() => handleSort('college')} style={{cursor:'pointer'}}>College <i className="ti ti-arrows-sort"></i></th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {atsList.map(a => (
                    <tr key={a.id} onClick={() => setSelectedApplicantId(a.id)}>
                      <td>
                        <div className="name-cell">
                          <div className="avatar-sm" style={{background: avatarColor(a.id)}}>{initials(a.name)}</div>
                          <div>
                            <div className="td-name">{a.name}</div>
                            <div className="td-meta">{a.email} {a.phone ? `· ${a.phone}` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`tag tag-${(a.college||'').toLowerCase()}`}>{a.college}</span></td>
                      <td style={{fontSize: '12px', color: 'var(--text3)'}}>{renderRoleTags(a)}</td>
                      <td><span className={`status-badge ${STATUS_CLASS[a.status as keyof typeof STATUS_CLASS] || ''}`}>{STATUS_LABELS[a.status as keyof typeof STATUS_LABELS] || a.status}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <select className="status-select" value={a.status} onChange={(e) => updateStatusMut.mutate({ id: a.id, status: e.target.value as ApplicantStatus })}>
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s as keyof typeof STATUS_LABELS]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* KANBAN PAGE */}
          <div className={`page ${activePage === 'kanban' ? 'active' : ''}`}>
            <div className="section-header">
              <div><div className="section-title">Pipeline View</div><div className="section-sub">Organized by status</div></div>
            </div>
            <div className="kanban">
              {STATUSES.map(s => {
                const cards = applicants.filter(a => a.status === s);
                return (
                  <div key={s} className="kanban-col">
                    <div className="kanban-header">{STATUS_LABELS[s]} <span className="kanban-count">{cards.length}</span></div>
                    {cards.map(a => (
                      <div key={a.id} className="kanban-card" onClick={() => setSelectedApplicantId(a.id)}>
                        <div className="kanban-name"><div className="avatar-sm" style={{background: avatarColor(a.id), width: '22px', height: '22px', fontSize: '9px'}}>{initials(a.name)}</div>{a.name}</div>
                        <div className="kanban-role">{renderRoleTags(a)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* INTERVIEWS PAGE */}
          <div className={`page ${activePage === 'interviews' ? 'active' : ''}`}>
            <div className="section-header">
              <div><div className="section-title">Interview Dashboard</div><div className="section-sub">Manage scheduling and panel workload</div></div>
            </div>
            
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-calendar-star" style={{color: '#f59e0b'}}></i></div>
                <div className="kpi-label">Today's Interviews</div>
                <div className="kpi-value">{todayInterviews.length}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-calendar-forward" style={{color: '#3b82f6'}}></i></div>
                <div className="kpi-label">Upcoming</div>
                <div className="kpi-value">{upcomingInterviews.length}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-calendar-x" style={{color: '#ef4444'}}></i></div>
                <div className="kpi-label">Pending Scheduling</div>
                <div className="kpi-value">{pendingScheduling.length}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon"><i className="ti ti-checkbox" style={{color: '#10b981'}}></i></div>
                <div className="kpi-label">Completed</div>
                <div className="kpi-value">{completedInterviews.length}</div>
              </div>
            </div>

            <div className="section-header" style={{marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                <div className="section-title">{calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
              </div>
              <div style={{display: 'flex', gap: '8px'}}>
                <button className="btn btn-outline" style={{padding: '6px 10px'}} onClick={() => { const d = new Date(calendarDate); d.setMonth(d.getMonth() - 1); setCalendarDate(d); }}><i className="ti ti-chevron-left"></i></button>
                <button className="btn btn-outline" style={{padding: '6px 10px'}} onClick={() => setCalendarDate(new Date())}>Today</button>
                <button className="btn btn-outline" style={{padding: '6px 10px'}} onClick={() => { const d = new Date(calendarDate); d.setMonth(d.getMonth() + 1); setCalendarDate(d); }}><i className="ti ti-chevron-right"></i></button>
              </div>
            </div>

            <div className="calendar-wrap">
              <div className="calendar-header">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="calendar-header-cell">{day}</div>)}
              </div>
              <div className="calendar-grid">
                {(() => {
                  const year = calendarDate.getFullYear();
                  const month = calendarDate.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const today = new Date();
                  
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) {
                    cells.push(<div key={`empty-${i}`} className="calendar-cell" style={{opacity: 0.5}}></div>);
                  }
                  for (let i = 1; i <= daysInMonth; i++) {
                    const date = new Date(year, month, i);
                    const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
                    const dayEvents = allInterviews.filter((intv: any) => {
                      const idate = new Date(intv.scheduledAt);
                      return idate.getDate() === i && idate.getMonth() === month && idate.getFullYear() === year;
                    });
                    
                    cells.push(
                      <div key={`day-${i}`} className={`calendar-cell ${isToday ? 'today' : ''}`}>
                        <div className="calendar-date">{i}</div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                          {dayEvents.sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).map((intv: any) => (
                            <div key={intv.id} className={`calendar-event status-${intv.status}`} onClick={() => setSelectedApplicantId(intv.applicantId)}>
                              <div className="calendar-event-time">{new Date(intv.scheduledAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                              <div className="calendar-event-title">{intv.applicant.name}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const remaining = 42 - cells.length; // 6 rows * 7 days
                  for (let i = 0; i < remaining; i++) {
                    cells.push(<div key={`empty-end-${i}`} className="calendar-cell" style={{opacity: 0.5}}></div>);
                  }
                  return cells;
                })()}
              </div>
            </div>
          </div>

          {/* BOARD FORMATION PAGE */}
          <div className={`page ${activePage === 'board' ? 'active' : ''}`}>
            <div className="section-header">
              <div><div className="section-title">Board Formation ({boardFormation?.name})</div><div className="section-sub">Drag and drop candidates to assign to slots</div></div>
            </div>
            <div className="board-wrapper">
              
              {/* Draggable candidates list */}
              <div className="board-candidates">
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text3)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Candidates (Interviewed/Selected)</div>
                {applicants.filter(a => a.status === 'INTERVIEWED' || a.status === 'SELECTED').map(a => (
                  <div 
                    key={a.id} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, a.id)}
                    style={{ background: 'var(--bg1)', padding: '12px', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border)', cursor: 'grab' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="avatar-sm" style={{background: avatarColor(a.id), width: '24px', height: '24px', fontSize: '10px'}}>{initials(a.name)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{a.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{renderRoleTags(a)}</div>
                      </div>
                    </div>
                    {/* Touch-friendly assignment fallback */}
                    <div className="board-assign-mobile" style={{ marginTop: '10px' }}>
                      <select 
                        className="status-select" 
                        style={{ width: '100%', fontSize: '11px', padding: '6px' }}
                        value=""
                        onChange={(e) => {
                           if(e.target.value && boardFormation?.id) {
                             const pos = positions.find((p: any) => p.id === e.target.value);
                             const filledSlots = pos?.boardSlots?.filter((bs: any) => bs.formationId === boardFormation.id).length || 0;
                             if (pos && filledSlots >= pos.slotCount) {
                               showToast("Maximum slots filled for this position!");
                               e.target.value = "";
                               return;
                             }
                             assignSlotMut.mutate({ applicantId: a.id, positionId: e.target.value, formationId: boardFormation.id });
                             e.target.value = "";
                           }
                        }}
                      >
                        <option value="">+ Quick Assign...</option>
                        {positions.filter((p:any) => p.isActive).map((p:any) => (
                          <option key={p.id} value={p.id}>{p.department} - {p.shortCode}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Droppable Slots by Department */}
              <div className="board-slots-area">
                <div className="kanban" style={{ padding: 0 }}>
                  {Object.entries(groupedPositions).map(([dept, posList]) => (
                    <div key={dept} className="kanban-col" style={{ minWidth: '280px' }}>
                      <div className="kanban-header">{dept}</div>
                      {posList.map((p: any) => {
                        const slots = p.boardSlots.filter((bs: any) => bs.formationId === boardFormation?.id);
                        return (
                          <div 
                            key={p.id} 
                            onDrop={(e) => handleDrop(e, p.id)}
                            onDragOver={handleDragOver}
                            style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', marginBottom: '12px', border: slots.length >= p.slotCount ? '1px solid var(--accent2)' : '1px dashed var(--border)' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>{p.shortCode}</div>
                              <div style={{ fontSize: '11px', color: slots.length >= p.slotCount ? 'var(--accent2)' : 'var(--text3)' }}>{slots.length} / {p.slotCount} filled</div>
                            </div>
                            
                            {/* Render occupied slots */}
                            {slots.map((bs: any) => {
                              const app = bs.applicant;
                              return (
                                <div key={bs.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg1)', padding: '8px', borderRadius: '6px', marginBottom: '6px', border: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className="avatar-sm" style={{background: avatarColor(app.id), width: '20px', height: '20px', fontSize: '9px'}}>{initials(app.name)}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text)' }}>{app.name}</div>
                                  </div>
                                  <i className="ti ti-x" style={{ cursor: 'pointer', fontSize: '14px', color: 'var(--text3)' }} onClick={() => boardFormation && removeSlotMut.mutate({ applicantId: app.id, positionId: p.id, formationId: boardFormation.id })}></i>
                                </div>
                              );
                            })}
                            
                            {/* Empty slot placeholders */}
                            {Array.from({ length: Math.max(0, p.slotCount - slots.length) }).map((_, i) => (
                              <div key={i} style={{ height: '38px', background: 'var(--bg1)', opacity: 0.5, borderRadius: '6px', marginBottom: '6px', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Drop here</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* RESULTS PAGE */}
          <div className={`page ${activePage === 'results' ? 'active' : ''}`}>
            <div className="section-header">
              <div><div className="section-title">Interview Results</div><div className="section-sub">Completed interviews and panel recommendations</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {completedInterviews.length === 0 ? (
                <div style={{ padding: '24px', color: 'var(--text3)', textAlign: 'center', width: '100%', gridColumn: '1 / -1', background: 'var(--bg2)', borderRadius: '12px' }}>No completed interviews yet.</div>
              ) : (
                completedInterviews.map((intv: any) => {
                  const applicant = intv.applicant;
                  let recBadge = null;
                  if (intv.recommendation) {
                    const finalRec = intv.recommendation;
                    recBadge = <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: finalRec === 'Recommend' ? '#4ade8020' : finalRec === 'Reject' ? '#f8717120' : '#fbbf2420', color: finalRec === 'Recommend' ? '#4ade80' : finalRec === 'Reject' ? '#f87171' : '#fbbf24' }}>{finalRec}</span>;
                  }

                  const targetPositions = intv.positions?.map((p: any) => p.position?.shortCode) || [];

                  return (
                    <div key={intv.id} style={{ background: 'var(--bg2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={() => setSelectedApplicantId(applicant.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{applicant.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>{new Date(intv.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
                        </div>
                        {recBadge || <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'var(--bg4)', color: 'var(--text3)' }}>Completed</span>}
                      </div>
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {targetPositions.length > 0 ? targetPositions.map((p: string) => (
                          <span key={p} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg3)', color: 'var(--text3)', fontWeight: 600 }}>{p}</span>
                        )) : renderRoleTags(applicant)}
                      </div>

                      {intv.panelists && intv.panelists.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text3)', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                          <i className="ti ti-users"></i> {intv.panelists.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ADMIN SETTINGS PAGE */}
          <div className={`page ${activePage === 'settings' ? 'active' : ''}`}>
            <div className="section-header">
              <div><div className="section-title">Admin Settings</div><div className="section-sub">Configure global canonical positions & slots</div></div>
            </div>
            
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Position Title</th>
                    <th>Level</th>
                    <th>Slots</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p: any) => (
                    <tr key={p.id}>
                      <td><span className="tag tag-eb">{p.department}</span></td>
                      <td><div><div style={{fontWeight: 500, color: 'var(--text)'}}>{p.title}</div><div style={{fontSize: '11px', color: 'var(--text3)'}}>{p.shortCode}</div></div></td>
                      <td style={{fontSize: '12px', color: 'var(--text3)'}}>{p.level}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={() => updateSlotCountMut.mutate({ id: p.id, count: Math.max(0, p.slotCount - 1) })}>-</button>
                          <span style={{ minWidth: '20px', textAlign: 'center' }}>{p.slotCount}</span>
                          <button className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={() => updateSlotCountMut.mutate({ id: p.id, count: p.slotCount + 1 })}>+</button>
                        </div>
                      </td>
                      <td>
                        <input 
                          type="checkbox" 
                          checked={p.isActive} 
                          onChange={(e) => togglePosMut.mutate({ id: p.id, active: e.target.checked })}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent1)' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>

      {/* PROFILE PANEL */}
      <div className={`profile-overlay ${selectedApplicantId ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setSelectedApplicantId(null); }}>
        <div className="profile-panel">
          {selectedApp && (
            <>
              <div className="pp-header">
                <div className="pp-avatar" style={{background: avatarColor(selectedApp.id)}}>{initials(selectedApp.name)}</div>
                <div><div className="pp-name">{selectedApp.name}</div><div className="pp-meta">{selectedApp.email} · {selectedApp.college}</div></div>
                <button className="pp-close" onClick={() => setSelectedApplicantId(null)}><i className="ti ti-x"></i></button>
              </div>
              <div className="pp-body">
                <div className="action-row">
                  <button className="btn btn-green" onClick={() => document.getElementById('interview-section')?.scrollIntoView({ behavior: 'smooth' })}><i className="ti ti-calendar"></i> Manage Interview</button>
                  <select className="status-select" value={selectedApp.status} onChange={(e) => updateStatusMut.mutate({ id: selectedApp.id, status: e.target.value as ApplicantStatus })}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="pp-section">
                  <div className="pp-section-title">Applied Positions</div>
                  {(() => {
                    const apps = selectedApp.applications || [];
                    const pending = apps.filter((a: any) => a.status === 'APPLIED' || a.status === 'INTERVIEW_SCHEDULED');
                    const interviewed = apps.filter((a: any) => a.status === 'INTERVIEWED');
                    const recommended = apps.filter((a: any) => a.status === 'SELECTED');
                    const waitlisted = apps.filter((a: any) => a.status === 'WAITLISTED');
                    const rejected = apps.filter((a: any) => a.status === 'REJECTED');

                    return (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px'}}>
                        {recommended.length > 0 && <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}><span style={{fontSize: '11px', color: 'var(--text3)', width: '90px'}}>Recommended</span> <div style={{display: 'flex', gap: '4px'}}>{recommended.map((a: any) => <span key={a.id} className="tag tag-eb" style={{background: '#4ade8020', color: '#4ade80'}}>{a.position.shortCode}</span>)}</div></div>}
                        {waitlisted.length > 0 && <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}><span style={{fontSize: '11px', color: 'var(--text3)', width: '90px'}}>Waitlisted</span> <div style={{display: 'flex', gap: '4px'}}>{waitlisted.map((a: any) => <span key={a.id} className="tag tag-eb" style={{background: '#fbbf2420', color: '#fbbf24'}}>{a.position.shortCode}</span>)}</div></div>}
                        {rejected.length > 0 && <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}><span style={{fontSize: '11px', color: 'var(--text3)', width: '90px'}}>Rejected</span> <div style={{display: 'flex', gap: '4px'}}>{rejected.map((a: any) => <span key={a.id} className="tag tag-eb" style={{background: '#f8717120', color: '#f87171'}}>{a.position.shortCode}</span>)}</div></div>}
                        {interviewed.length > 0 && <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}><span style={{fontSize: '11px', color: 'var(--text3)', width: '90px'}}>Interviewed</span> <div style={{display: 'flex', gap: '4px'}}>{interviewed.map((a: any) => <span key={a.id} className="tag tag-eb" style={{background: 'var(--bg3)', color: 'var(--text3)'}}>{a.position.shortCode}</span>)}</div></div>}
                        {pending.length > 0 && <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}><span style={{fontSize: '11px', color: 'var(--text3)', width: '90px'}}>Pending</span> <div style={{display: 'flex', gap: '4px'}}>{pending.map((a: any) => <span key={a.id} className="tag tag-eb">{a.position.shortCode}</span>)}</div></div>}
                      </div>
                    );
                  })()}
                </div>
                <div className="pp-section">
                  <div className="pp-section-title">Application Responses</div>
                  <div className="pp-response"><div className="pp-response-label">Why do you think you're the best fit for the post?</div><div style={{whiteSpace: 'pre-wrap'}}>{linkify(selectedApp.whyFit) || <span style={{color: 'var(--text3)', fontStyle: 'italic'}}>No response provided</span>}</div></div>
                  <div className="pp-response"><div className="pp-response-label">Plan of Action</div><div style={{whiteSpace: 'pre-wrap'}}>{linkify(selectedApp.planOfAction) || <span style={{color: 'var(--text3)', fontStyle: 'italic'}}>No response provided</span>}</div></div>
                  <div className="pp-response"><div className="pp-response-label">Past work &amp; contributions to the organisation</div><div style={{whiteSpace: 'pre-wrap'}}>{linkify(selectedApp.pastWork) || <span style={{color: 'var(--text3)', fontStyle: 'italic'}}>No response provided</span>}</div></div>
                </div>
                <div className="pp-section">
                  <div className="pp-section-title" style={{color: '#f59e0b'}}>⚡ Governance &amp; Committee Insights</div>
                  <div className="pp-response" style={{borderLeft: '3px solid #f59e0b'}}><div className="pp-response-label">If not you, who else would be equally suitable?</div><div style={{whiteSpace: 'pre-wrap'}}>{linkify(selectedApp.alternatives) || <span style={{color: 'var(--text3)', fontStyle: 'italic'}}>No response provided</span>}</div></div>
                  <div className="pp-response" style={{borderLeft: '3px solid #3b82f6'}}><div className="pp-response-label">Ideal Executive Board</div><div style={{whiteSpace: 'pre-wrap'}}>{linkify(selectedApp.idealBoard) || <span style={{color: 'var(--text3)', fontStyle: 'italic'}}>No response provided</span>}</div></div>
                  <div className="pp-response" style={{borderLeft: '3px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><div><div className="pp-response-label">Would continue being part of MTTN if not selected?</div></div><span style={{padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 600, background: selectedApp.continueIfNot ? '#10b98120' : '#ef444420', color: selectedApp.continueIfNot ? '#4ade80' : '#f87171'}}>{selectedApp.continueIfNot ? '✓ Yes' : '✗ No'}</span></div>
                </div>
                <div className="pp-section" id="interview-section">
                  <div className="pp-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Interview History</span>
                    {editingInterviewId === null && <button className="btn btn-outline" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={() => { resetInterviewForm(); setEditingInterviewId('NEW'); }}><i className="ti ti-plus"></i> New</button>}
                  </div>
                  {(() => {
                    const isBusy = scheduleInterviewMut.isPending || updateInterviewDetailsMut.isPending || deleteInterviewMut.isPending;
                    const interviews = selectedApp.interviews || [];
                    const isCreatingNew = editingInterviewId === 'NEW';
                    
                    return (<>
                      {interviews.length === 0 && !isCreatingNew && (
                        <div style={{ color: 'var(--text3)', fontSize: '12px', fontStyle: 'italic', marginBottom: '12px' }}>No interviews scheduled.</div>
                      )}

                      {interviews.map((existingIntv: any) => {
                        const isEditing = editingInterviewId === existingIntv.id;
                        if (isEditing) return null; // Handled below by the form

                        let recBadge = null;
                        if (existingIntv.status === 'COMPLETED' && existingIntv.recommendation) {
                          const finalRec = existingIntv.recommendation;
                          recBadge = <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: finalRec === 'Recommend' ? '#4ade8020' : finalRec === 'Reject' ? '#f8717120' : '#fbbf2420', color: finalRec === 'Recommend' ? '#4ade80' : finalRec === 'Reject' ? '#f87171' : '#fbbf24' }}>{finalRec}</span>;
                        }
                        
                        const targetPositions = existingIntv.positions?.map((p: any) => p.position?.shortCode).join(', ') || '';

                        return (
                          <div key={existingIntv.id} style={{background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '10px'}}>
                            <div style={{fontSize: '12px', color: 'var(--text3)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                              <div>
                                <div>{new Date(existingIntv.scheduledAt).toLocaleString()}</div>
                                {targetPositions && <div style={{marginTop: '4px', color: 'var(--text3)'}}>Positions: {targetPositions}</div>}
                                {existingIntv.link && <div style={{marginTop: '4px'}}><a href={existingIntv.link} target="_blank" style={{color: 'var(--primary)'}}><i className="ti ti-link"></i> {existingIntv.link}</a></div>}
                                {existingIntv.panelists && existingIntv.panelists.length > 0 && <div style={{marginTop: '4px', color: 'var(--text3)', fontSize: '11px'}}>Panel: {existingIntv.panelists.join(', ')}</div>}
                              </div>
                              <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                {recBadge}
                                <span style={{fontWeight: 600, color: existingIntv.status === 'SCHEDULED' ? '#fbbf24' : existingIntv.status === 'COMPLETED' ? '#4ade80' : '#f87171'}}>{existingIntv.status}</span>
                              </div>
                            </div>

                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px'}}>
                              <button className="btn btn-outline" style={{fontSize: '11px', padding: '4px 8px'}} disabled={isBusy} onClick={() => updateInterviewMut.mutate({ applicantId: selectedApp.id, id: existingIntv.id, status: 'COMPLETED' })}>{updateInterviewMut.isPending ? '...' : 'Mark Completed'}</button>
                              <button className="btn btn-outline" style={{fontSize: '11px', padding: '4px 8px'}} disabled={isBusy} onClick={() => updateInterviewMut.mutate({ applicantId: selectedApp.id, id: existingIntv.id, status: 'MISSED' })}>Mark Missed</button>
                              <button className="btn btn-outline" style={{fontSize: '11px', padding: '4px 8px'}} disabled={isBusy} onClick={() => setEvalForm({...evalForm, interviewId: evalForm.interviewId === existingIntv.id ? '' : existingIntv.id})}>Evaluate</button>
                              <button className="btn btn-outline" style={{fontSize: '11px', padding: '4px 8px', color: '#60a5fa', borderColor: '#1e3a8a'}} disabled={isBusy} onClick={() => {
                                const d = new Date(existingIntv.scheduledAt);
                                setInterviewForm({ date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, time: '', link: existingIntv.link || '', targetPositions: existingIntv.positions?.map((p: any) => p.position?.shortCode) || [], interviewers: existingIntv.panelists || [] });
                                setEditingInterviewId(existingIntv.id);
                              }}><i className="ti ti-edit"></i> Edit</button>
                              {confirmDeleteId === existingIntv.id ? (
                                <><button className="btn btn-red" style={{fontSize: '11px', padding: '4px 8px'}} disabled={deleteInterviewMut.isPending} onClick={() => deleteInterviewMut.mutate({ applicantId: selectedApp.id, id: existingIntv.id })}>{deleteInterviewMut.isPending ? 'Deleting...' : 'Confirm Delete'}</button><button className="btn btn-outline" style={{fontSize: '11px', padding: '4px 8px'}} onClick={() => setConfirmDeleteId(null)}>Cancel</button></>
                              ) : (
                                <button className="btn btn-outline" style={{fontSize: '11px', padding: '4px 8px', color: '#fca5a5', borderColor: '#7f1d1d'}} onClick={() => setConfirmDeleteId(existingIntv.id)}><i className="ti ti-trash"></i></button>
                              )}
                            </div>

                            {existingIntv.remarks && (
                              <div style={{marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px'}}>
                                <div style={{fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginBottom: '4px'}}>Collective Decision & Remarks</div>
                                <div style={{fontSize: '12px', background: 'var(--bg1)', padding: '8px', borderRadius: '4px', marginBottom: '4px'}}>
                                  <div style={{color:'var(--text)', whiteSpace: 'pre-wrap'}}>{existingIntv.remarks}</div>
                                </div>
                              </div>
                            )}

                            {evalForm.interviewId === existingIntv.id && (
                              <div style={{marginTop: '10px', background: 'var(--bg1)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)'}}>
                                <div style={{fontSize: '12px', fontWeight: 600, marginBottom: '8px'}}>Finalize Interview Outcome</div>
                                <select className="note-input" style={{marginBottom: '6px'}} value={evalForm.recommendation} onChange={e => setEvalForm({...evalForm, recommendation: e.target.value})}>
                                  <option value="Recommend">Recommend</option>
                                  <option value="Waitlist">Waitlist</option>
                                  <option value="Reject">Reject</option>
                                </select>
                                <textarea className="note-input" placeholder="Shared remarks / comments..." style={{marginBottom: '8px', minHeight: '60px'}} value={evalForm.notes} onChange={e => setEvalForm({...evalForm, notes: e.target.value})}></textarea>
                                <button className="btn btn-green" style={{width: '100%', justifyContent: 'center'}} disabled={submitEvalMut.isPending} onClick={() => submitEvalMut.mutate({ applicantId: selectedApp.id, interviewId: existingIntv.id, data: evalForm })}>{submitEvalMut.isPending ? 'Submitting...' : 'Submit Decision'}</button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {editingInterviewId !== null && (
                        <div style={{background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: `1px solid ${!isCreatingNew ? '#3b82f6' : 'var(--border)'}` }}>
                          {!isCreatingNew && <div style={{fontSize: '11px', color: '#60a5fa', marginBottom: '8px', fontWeight: 600}}>✏️ Editing interview — modify details below</div>}
                          {isCreatingNew && <div style={{fontSize: '11px', color: 'var(--text)', marginBottom: '8px', fontWeight: 600}}>🗓️ Schedule New Interview</div>}
                          <input type="datetime-local" className="note-input" style={{marginBottom: '8px'}} value={interviewForm.date} onChange={e => setInterviewForm({...interviewForm, date: e.target.value})} />
                          <input type="text" className="note-input" placeholder="Meeting Link (optional)" value={interviewForm.link} onChange={e => setInterviewForm({...interviewForm, link: e.target.value})} style={{marginBottom: '12px'}} />
                          <div style={{marginBottom: '12px'}}>
                            <div style={{fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Target Positions</div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px'}}>
                              {interviewForm.targetPositions.map(p => (<div key={p} style={{background: 'var(--bg4)', color: 'var(--text)', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px'}}>{p} <i className="ti ti-x" style={{cursor: 'pointer'}} onClick={() => setInterviewForm({...interviewForm, targetPositions: interviewForm.targetPositions.filter(x => x !== p)})}></i></div>))}
                            </div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                              {selectedApp.applications?.map((app: any) => app.position.shortCode).filter((p: string) => !interviewForm.targetPositions.includes(p)).map((p: string) => (<div key={p} style={{background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer'}} onClick={() => setInterviewForm({...interviewForm, targetPositions: [...interviewForm.targetPositions, p]})}>+ {p}</div>))}
                            </div>
                          </div>
                          <div style={{marginBottom: '16px'}}>
                            <div style={{fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Interviewers</div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px'}}>
                              {interviewForm.interviewers.map(i => (<div key={i} style={{background: 'var(--accent2)', color: '#fff', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px'}}>{i} <i className="ti ti-x" style={{cursor: 'pointer'}} onClick={() => setInterviewForm({...interviewForm, interviewers: interviewForm.interviewers.filter(x => x !== i)})}></i></div>))}
                            </div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto'}}>
                              {AVAILABLE_INTERVIEWERS.filter(i => !interviewForm.interviewers.includes(i)).map(i => (<div key={i} style={{background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer'}} onClick={() => setInterviewForm({...interviewForm, interviewers: [...interviewForm.interviewers, i]})}>+ {i}</div>))}
                            </div>
                          </div>
                          <div style={{display: 'flex', gap: '8px'}}>
                            <button className="btn btn-green" style={{flex: 1, justifyContent: 'center'}} disabled={!interviewForm.date || isBusy} onClick={() => {
                              if (!isCreatingNew && editingInterviewId) {
                                updateInterviewDetailsMut.mutate({ applicantId: selectedApp.id, interviewId: editingInterviewId, scheduledAt: new Date(interviewForm.date), link: interviewForm.link, targetPositions: interviewForm.targetPositions, interviewers: interviewForm.interviewers });
                              } else {
                                scheduleInterviewMut.mutate({ applicantId: selectedApp.id, scheduledAt: new Date(interviewForm.date), link: interviewForm.link, targetPositions: interviewForm.targetPositions, interviewers: interviewForm.interviewers });
                              }
                            }}>{isBusy ? '⏳ Saving...' : !isCreatingNew ? 'Update Interview' : 'Schedule Interview'}</button>
                            <button className="btn btn-outline" style={{padding: '6px 14px'}} onClick={() => { resetInterviewForm(); setEditingInterviewId(null); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </>);
                  })()}
                </div>
                <div className="pp-section">
                  <div className="pp-section-title">Reviewer notes</div>
                  {selectedApp.notes.map((n: any) => <div key={n.id} className="note-item">{n.content}</div>)}
                  <textarea className="note-input" placeholder="Add a note..." value={noteInput} onChange={e => setNoteInput(e.target.value)}></textarea>
                  <button className="btn btn-outline" style={{marginTop: '6px', fontSize: '12px'}} onClick={() => addNoteMut.mutate({ id: selectedApp.id, note: noteInput })}><i className="ti ti-plus"></i> Add note</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={`toast ${showToastObj ? 'show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
