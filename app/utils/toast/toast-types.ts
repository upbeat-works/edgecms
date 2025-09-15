import { z } from 'zod';
import { createId as cuid } from '@paralleldrive/cuid2';

export const ToastSchema = z.object({
	description: z.string(),
	id: z.string().default(() => cuid()),
	title: z.string().optional(),
	type: z.enum(['message', 'success', 'error']).default('message'),
});

export type Toast = z.infer<typeof ToastSchema>;
export type ToastInput = z.input<typeof ToastSchema>;
