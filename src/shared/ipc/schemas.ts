import { z } from 'zod'
import { isValidDateKey } from '../logic/dates'

// Skema dasar yang dipakai ulang oleh kontrak IPC dan service.

export const idSchema = z.number().int().positive()

export const dateKeySchema = z
  .string()
  .refine(isValidDateKey, { message: 'Expected a valid date in YYYY-MM-DD format' })
