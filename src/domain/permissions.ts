import { ApprovalStatus, Role } from '../types';

/** PRD v1.0 §8 Roles and Permissions (FR-33). Enforced by the backend; mirrored in the UI. */
export type Action =
  | 'view_corridor'
  | 'submit_report'
  | 'review_report'
  | 'approve_closure'
  | 'approve_alert'
  | 'update_clearance'
  | 'clear_passage'
  | 'configure'
  | 'view_records';

const MATRIX: Record<Action, Role[]> = {
  view_corridor: ['officer', 'second_approver', 'road_engineer', 'patrol', 'admin'],
  submit_report: ['officer', 'second_approver', 'road_engineer', 'patrol', 'public_reporter'],
  review_report: ['officer', 'second_approver'],
  approve_closure: ['officer', 'second_approver'],
  approve_alert: ['officer', 'second_approver'],
  update_clearance: ['officer', 'second_approver', 'road_engineer'],
  clear_passage: ['officer'],
  configure: ['admin'],
  view_records: ['officer', 'second_approver', 'road_engineer', 'admin']
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

/** Second approver may approve only once a request has escalated ("Yes (on escalation)"). */
export function canDecideApproval(role: Role, status: ApprovalStatus): boolean {
  if (status !== 'pending' && status !== 'escalated') return false;
  if (role === 'officer') return true;
  if (role === 'second_approver') return status === 'escalated';
  return false;
}

export const ROLE_LABEL: Record<Role, string> = {
  officer: 'Control-room officer',
  second_approver: 'Second approver',
  road_engineer: 'Road engineer',
  patrol: 'Highway patrol',
  public_reporter: 'Public reporter',
  admin: 'Administrator'
};

export class PermissionError extends Error {
  constructor(role: Role, action: string) {
    super(`Not permitted: ${ROLE_LABEL[role]} cannot ${action.replace(/_/g, ' ')}`);
    this.name = 'PermissionError';
  }
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) throw new PermissionError(role, action);
}
