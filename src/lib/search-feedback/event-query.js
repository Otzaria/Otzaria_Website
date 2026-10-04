import SearchFeedbackEvent from '../../models/SearchFeedbackEvent.js';
import { committedEvents } from './ingestion.js';

export const EVENT_CURSOR_BATCH_SIZE = 16;

/** An equality prefix followed by the complete ordering never needs a blocking SORT. */
export function eventOrderIndex(filter) {
  if (typeof filter.keyId === 'string' || typeof filter.keyId?.$eq === 'string') return { keyId: 1, receivedAt: 1, _id: 1 };
  if (typeof filter['context.engine.modelFamilyId'] === 'string') {
    if (Object.hasOwn(filter, 'context.engine.modelQuantization')) {
      return { 'context.engine.modelFamilyId': 1, 'context.engine.modelQuantization': 1, receivedAt: 1, _id: 1 };
    }
    return { 'context.engine.modelFamilyId': 1, receivedAt: 1, _id: 1 };
  }
  if (typeof filter.type === 'string') return { type: 1, receivedAt: 1, _id: 1 };
  if (Object.hasOwn(filter, 'context.engine.modelQuantization')) {
    return { 'context.engine.modelQuantization': 1, receivedAt: 1, _id: 1 };
  }
  return { receivedAt: 1, _id: 1 };
}

export async function orderedEvents(filter, { selection, batchSize = EVENT_CURSOR_BATCH_SIZE } = {}) {
  // Wait for Mongoose's index creation before accepting an export. The explicit
  // hint fails safely if an index is missing instead of falling back to a SORT.
  await SearchFeedbackEvent.init();
  return SearchFeedbackEvent.find({ ...filter, ...committedEvents() })
    .sort({ receivedAt: 1, _id: 1 })
    .hint(eventOrderIndex(filter))
    .select(selection)
    .lean()
    .cursor({ batchSize });
}
