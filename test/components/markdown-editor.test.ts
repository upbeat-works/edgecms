import { describe, expect, it } from 'vitest';
import { markdownEditorDialogOptions } from '~/components/markdown-editor';

describe('markdown editor dialog integration', () => {
	it('leaves page scroll ownership to the containing dialog', () => {
		expect(markdownEditorDialogOptions.overflow).toBe(false);
	});
});
