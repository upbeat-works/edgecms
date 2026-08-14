import { useState, useEffect } from 'react';
import MDEditor from '@uiw/react-md-editor';
import * as commands from '@uiw/react-md-editor/commands';
import { Button } from '~/components/ui/button';
import { useFetcher } from 'react-router';

const markdownCommands = [
	commands.bold,
	commands.italic,
	commands.strikethrough,
	commands.hr,
	commands.group(
		[
			commands.heading1,
			commands.heading2,
			commands.heading3,
			commands.heading4,
			commands.heading5,
			commands.heading6,
		],
		{
			name: 'heading',
			groupName: 'heading',
			buttonProps: { 'aria-label': 'Insert title' },
		},
	),
	commands.divider,
	commands.link,
	commands.quote,
	commands.code,
	commands.image,
	commands.divider,
	commands.unorderedListCommand,
	commands.orderedListCommand,
	commands.checkedListCommand,
	commands.table,
	commands.divider,
	commands.help,
];

interface MarkdownInputProps {
	value: string;
	onChange: (value: string) => void;
	height?: number;
	label?: string;
}

export function MarkdownInput({
	value,
	onChange,
	height = 600,
	label = 'Markdown content',
}: MarkdownInputProps) {
	return (
		<div data-color-mode="light" className="markdown-editor-toolbar-large">
			<MDEditor
				{...markdownEditorDialogOptions}
				value={value}
				onChange={nextValue => onChange(nextValue ?? '')}
				preview="live"
				hideToolbar={false}
				visibleDragbar={false}
				height={height}
				commands={markdownCommands}
				extraCommands={[
					commands.codeLive,
					commands.codeEdit,
					commands.codePreview,
				]}
				textareaProps={{ 'aria-label': label }}
			/>
		</div>
	);
}

interface MarkdownEditorProps {
	filename: string;
	version?: number;
	mediaId: number;
	onSave?: () => void;
}

// UIW otherwise adopts the dialog's temporary body scroll lock when it mounts.
export const markdownEditorDialogOptions = {
	overflow: false,
};

export function MarkdownEditor({
	filename,
	version,
	mediaId,
	onSave,
}: MarkdownEditorProps) {
	const [content, setContent] = useState<string>('');
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const saveFetcher = useFetcher();

	useEffect(() => {
		const fetchContent = async () => {
			try {
				const mediaUrl = version
					? `/edge-cms/public/media/${filename}?version=${version}`
					: `/edge-cms/public/media/${filename}`;

				const response = await fetch(mediaUrl);
				if (response.ok) {
					const text = await response.text();
					setContent(text);
				} else {
					setContent(
						'# Error loading file\n\nCould not load the markdown content.',
					);
				}
			} catch (error) {
				setContent(
					'# Error loading file\n\nAn error occurred while loading the markdown content.',
				);
			} finally {
				setIsLoading(false);
			}
		};

		fetchContent();
	}, [filename, version]);

	useEffect(() => {
		if (saveFetcher.data?.success && saveFetcher.state === 'idle') {
			setIsSaving(false);
			onSave?.();
		}
	}, [saveFetcher.data, saveFetcher.state, onSave]);

	const handleSave = async () => {
		setIsSaving(true);

		const blob = new Blob([content], { type: 'text/markdown' });
		const file = new File([blob], filename, { type: 'text/markdown' });

		const formData = new FormData();
		formData.append('file', file);

		saveFetcher.submit(formData, {
			method: 'post',
			action: `/edge-cms/media/upload?intent=replace&mediaId=${mediaId}`,
			encType: 'multipart/form-data',
		});
	};

	if (isLoading) {
		return (
			<div className="flex h-96 items-center justify-center">
				<div className="text-muted-foreground">Loading markdown content...</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold">Editing: {filename}</h3>
				<Button
					onClick={handleSave}
					disabled={isSaving || saveFetcher.state === 'submitting'}
				>
					{isSaving || saveFetcher.state === 'submitting'
						? 'Saving...'
						: 'Save Changes'}
				</Button>
			</div>

			{saveFetcher.data?.error && (
				<div className="rounded bg-red-50 p-2 text-sm text-red-500">
					Error: {saveFetcher.data.error}
				</div>
			)}
			<MarkdownInput value={content} onChange={setContent} />
		</div>
	);
}
