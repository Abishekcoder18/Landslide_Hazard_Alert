import { ResilionApi } from '../types';
import { MockServer } from './server';

/** Browser-only implementation of ResilionApi on sample data. State resets on page reload. */
export function createMockApi(server = new MockServer()): ResilionApi {
  const wait = <T>(fn: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  return {
    mode: 'mock',
    login: (userId, role) => wait(() => server.login(userId, role)),
    getSnapshot: () => wait(() => server.snapshot()),
    submitReport: (s, input) => wait(() => server.submitReport(s, input)),
    confirmReport: (s, id, state) => wait(() => server.confirmReport(s, id, state)),
    rejectReport: (s, id) => wait(() => server.rejectReport(s, id)),
    clearPassage: (s, zoneId) => wait(() => server.clearPassage(s, zoneId)),
    draftAlert: (s, segmentId) => wait(() => server.draftAlert(s, segmentId)),
    decideApproval: (s, id, approve, type) => wait(() => server.decideApproval(s, id, approve, type)),
    updateIncident: (s, id, patch) => wait(() => server.updateIncident(s, id, patch)),
    requestReopening: (s, id, to) => wait(() => server.requestReopening(s, id, to)),
    editAlertText: (s, id, lang, text) => wait(() => server.editAlertText(s, id, lang, text)),
    updateConfig: (s, patch) => wait(() => server.updateConfig(s, patch)),
    updateZone: (s, id, patch) => wait(() => server.updateZone(s, id, patch)),
    updateSegmentInputs: (s, id, patch) => wait(() => server.updateSegmentInputs(s, id, patch)),
    resetSampleData: s => wait(() => server.resetSampleData(s))
  };
}
