import { Session, Snapshot, Report } from '../types';
import { ApiError, ResilionApi } from './types';

/** FastAPI client. Endpoint list: docs/API_CONTRACT.md. */
export function createHttpApi(baseUrl: string): ResilionApi {
  const root = baseUrl.replace(/\/$/, '');
  async function call<T>(session: Session | null, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${root}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const j = await res.json();
        msg = j.detail ?? j.message ?? msg;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }
  return {
    mode: 'http',
    login: (userId, role) => call<Session>(null, 'POST', '/api/auth/login', { userId, role }),
    getSnapshot: s => call<Snapshot>(s, 'GET', '/api/snapshot'),
    submitReport: (s, input) => call<Report>(s, 'POST', '/api/reports', input),
    confirmReport: (s, id, newState) => call(s, 'POST', `/api/reports/${id}/confirm`, { newState }),
    rejectReport: (s, id) => call(s, 'POST', `/api/reports/${id}/reject`),
    clearPassage: (s, zoneId) => call(s, 'POST', `/api/zones/${zoneId}/clear-passage`),
    draftAlert: (s, segmentId) => call(s, 'POST', `/api/segments/${segmentId}/alerts`),
    decideApproval: (s, id, approve, closureType) => call(s, 'POST', `/api/approvals/${id}/decision`, { approve, closureType }),
    updateIncident: (s, id, patch) => call(s, 'PATCH', `/api/incidents/${id}`, patch),
    requestReopening: (s, id, to) => call(s, 'POST', `/api/incidents/${id}/reopening`, { to }),
    editAlertText: (s, id, lang, text) => call(s, 'PUT', `/api/alerts/${id}/texts/${lang}`, { text }),
    updateConfig: (s, patch) => call(s, 'PATCH', '/api/config', patch),
    updateZone: (s, id, patch) => call(s, 'PATCH', `/api/zones/${id}`, patch),
    updateSegmentInputs: (s, id, patch) => call(s, 'PATCH', `/api/segments/${id}/inputs`, patch),
    resetSampleData: s => call(s, 'POST', '/api/admin/reset-sample-data')
  };
}
