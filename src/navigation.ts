import { AlertOctagon, ClipboardList, FileCheck2, FileText, GitBranch, Map, Settings2, LucideIcon } from 'lucide-react';
import { Role } from './types';
import { can } from './domain/permissions';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  allowed: (role: Role) => boolean;
}

/** Pages visible per PRD §8 role. */
export const NAV: NavItem[] = [
  { path: '/corridor', label: 'Corridor', icon: Map, allowed: r => can(r, 'view_corridor') },
  { path: '/reports', label: 'Reports', icon: FileText, allowed: r => can(r, 'submit_report') || can(r, 'review_report') },
  { path: '/decisions', label: 'Decisions', icon: GitBranch, allowed: r => can(r, 'view_corridor') },
  { path: '/approvals', label: 'Approvals', icon: FileCheck2, allowed: r => can(r, 'approve_closure') },
  { path: '/incidents', label: 'Incidents', icon: AlertOctagon, allowed: r => can(r, 'update_clearance') || can(r, 'view_records') },
  { path: '/records', label: 'Records', icon: ClipboardList, allowed: r => can(r, 'view_records') },
  { path: '/configuration', label: 'Configuration', icon: Settings2, allowed: r => can(r, 'configure') }
];

export const homeFor = (role: Role) => NAV.find(n => n.allowed(role))?.path ?? '/reports';
