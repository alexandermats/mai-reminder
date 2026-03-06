import type { Reminder, ReminderInput } from '../types/reminder'
import { ReminderStatus } from '../types/reminder'
import type { IReminderRepository } from '../types/repository'
import { getNextScheduledAt } from './schedulerService'
import { getReminderSeriesBaseId } from '../utils/reminderSeries'

type TriggerTransitionRepository = Pick<IReminderRepository, 'update' | 'create'>

export interface TriggerTransitionResult {
  sentReminder: Reminder
  nextReminder?: Reminder
}

export async function applyTriggeredReminderTransition(
  reminder: Reminder,
  repository: TriggerTransitionRepository,
  nextScheduledAt: Date | undefined = getNextScheduledAt(reminder)
): Promise<TriggerTransitionResult> {
  const sentReminder = await repository.update(reminder.id, { status: ReminderStatus.SENT })

  if (!nextScheduledAt || Number.isNaN(nextScheduledAt.getTime())) {
    return { sentReminder }
  }

  // Normalize to canonical series id so generated reminder IDs never chain from
  // previously generated suffixes like `-missed-*` or `-next-*`.
  const baseId = getReminderSeriesBaseId(reminder.id)

  let nextTimestamp = nextScheduledAt.getTime()
  let deterministicId = `${baseId}-next-${nextTimestamp}`

  // E15-Fix: If the generated ID exactly matches the current reminder's ID
  // (which happens if a user edits an occurrence to trigger such that the next
  // occurrence lines up exactly with the original schedule time suffix),
  // we must perturb the ID slightly to prevent a UNIQUE constraint error,
  // which would completely destroy the recurrence chain and cause error loops.
  while (deterministicId === reminder.id) {
    nextTimestamp += 1
    deterministicId = `${baseId}-next-${nextTimestamp}`
  }

  const nextReminderInput: ReminderInput = {
    id: deterministicId,
    title: reminder.title,
    originalText: reminder.originalText,
    language: reminder.language,
    scheduledAt: nextScheduledAt,
    source: reminder.source,
    parserMode: reminder.parserMode,
    status: ReminderStatus.PENDING,
    recurrenceRule: reminder.recurrenceRule,
    ...(typeof reminder.parseConfidence === 'number'
      ? { parseConfidence: reminder.parseConfidence }
      : {}),
  }

  const nextReminder = await repository.create(nextReminderInput)
  return {
    sentReminder,
    nextReminder,
  }
}
