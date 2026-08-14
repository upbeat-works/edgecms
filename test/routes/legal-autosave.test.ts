import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	LEGAL_DRAFT_AUTOSAVE_DELAY_MS,
	scheduleLegalDraftAutosave,
} from '~/routes/edge-cms/legal/legal.$id';

describe('legal draft autosave', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('saves only the latest text after the writer pauses', () => {
		const save = vi.fn();
		const cancelFirstSave = scheduleLegalDraftAutosave({
			markdown: '# Priv',
			savedMarkdown: '',
			save,
		});

		vi.advanceTimersByTime(LEGAL_DRAFT_AUTOSAVE_DELAY_MS - 100);
		expect(save).not.toHaveBeenCalled();
		cancelFirstSave();

		const cancelLatestSave = scheduleLegalDraftAutosave({
			markdown: '# Privacy policy',
			savedMarkdown: '',
			save,
		});
		vi.advanceTimersByTime(LEGAL_DRAFT_AUTOSAVE_DELAY_MS - 1);
		expect(save).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);

		expect(save).toHaveBeenCalledOnce();
		expect(save).toHaveBeenCalledWith('# Privacy policy');
		cancelLatestSave();
	});

	it('does not save text that already matches the stored draft', () => {
		const save = vi.fn();
		const cancelSave = scheduleLegalDraftAutosave({
			markdown: '# Privacy policy',
			savedMarkdown: '# Privacy policy',
			save,
		});

		vi.advanceTimersByTime(LEGAL_DRAFT_AUTOSAVE_DELAY_MS);

		expect(save).not.toHaveBeenCalled();
		cancelSave();
	});
});
