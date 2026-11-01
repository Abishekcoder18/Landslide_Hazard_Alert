import test from 'node:test';
import assert from 'node:assert/strict';
import { can, canDecideApproval, assertCan } from './permissions';

test('AC-23: patrol cannot approve a closure', () => {
  assert.equal(can('patrol', 'approve_closure'), false);
  assert.throws(() => assertCan('patrol', 'approve_closure'), /Not permitted/);
  assert.equal(canDecideApproval('patrol', 'pending'), false);
});

test('PRD §8 matrix spot checks', () => {
  assert.equal(can('officer', 'approve_closure'), true);
  assert.equal(can('road_engineer', 'approve_alert'), false);
  assert.equal(can('road_engineer', 'update_clearance'), true);
  assert.equal(can('public_reporter', 'submit_report'), true);
  assert.equal(can('public_reporter', 'view_corridor'), false);
  assert.equal(can('admin', 'submit_report'), false);
  assert.equal(can('admin', 'configure'), true);
  assert.equal(can('officer', 'configure'), false);
});

test('Second approver decides only on escalation', () => {
  assert.equal(canDecideApproval('second_approver', 'pending'), false);
  assert.equal(canDecideApproval('second_approver', 'escalated'), true);
  assert.equal(canDecideApproval('officer', 'escalated'), true);
  assert.equal(canDecideApproval('officer', 'approved'), false);
});
