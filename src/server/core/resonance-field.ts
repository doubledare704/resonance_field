import {
  CONTRACT_VERSION,
  DAILY_RESET_HOUR_UTC,
  MAX_ACTIVE_NODES,
  NODE_LIFESPAN_MS,
} from '../../shared/api';

export {
  buildInitialResponse,
  buildSnapshot,
  loadSnapshot,
  refreshStateForNow,
} from './state/snapshot';
export {
  deployNode,
  getArchiveHistory,
  resetDailyState,
  selectTool,
  submitThroughput,
} from './state/actions';
export {
  getEmptyState,
  parseState,
  pruneExpiredNodes,
  toSnapshot,
} from './state/helpers';
export { getRequestSeed } from './state/persistence';

export const apiContracts = {
  contractVersion: CONTRACT_VERSION,
  dailyResetHourUtc: DAILY_RESET_HOUR_UTC,
  maxActiveNodes: MAX_ACTIVE_NODES,
  nodeLifespanMs: NODE_LIFESPAN_MS,
};
