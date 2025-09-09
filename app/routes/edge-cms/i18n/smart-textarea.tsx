import { useState, useEffect } from 'react';

interface SmartTextareaProps {
	value: string;
	onValueChange: (value: string) => void;
	onSubmit?: (value: string) => void;
	onCancel?: () => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	rows?: number;
	minHeight?: number;
}

export function SmartTextarea({
	value: externalValue,
	onValueChange,
	onSubmit,
	onCancel,
	placeholder = 'Enter text...',
	className = '',
	disabled = false,
	rows = 1,
	minHeight = 40,
}: SmartTextareaProps) {
	const [value, setValue] = useState(externalValue);
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setValue(externalValue);
		setIsDirty(false);
	}, [externalValue]);

	const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
		if (isDirty && onSubmit) {
			onSubmit(value);
		}
		// Reset textarea height
		const textarea = e.target;
		textarea.style.height = 'auto';
		textarea.rows = rows;
	};

	const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
		// Auto-resize on focus
		const textarea = e.target;
		textarea.style.height = 'auto';
		textarea.style.height = Math.max(textarea.scrollHeight, minHeight) + 'px';
	};

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const textarea = e.target;
		const newValue = textarea.value;
		setValue(newValue);
		setIsDirty(true);
		onValueChange(newValue);

		// Auto-resize as user types
		textarea.style.height = 'auto';
		textarea.style.height = Math.max(textarea.scrollHeight, minHeight) + 'px';
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			e.currentTarget.blur();
		} else if (e.key === 'Escape') {
			if (onCancel) {
				onCancel();
			} else {
				setValue(externalValue);
				setIsDirty(false);
			}
			e.currentTarget.blur();
		}
	};

	const baseClassName =
		'cursor-pointer focus:ring-ring focus:bg-background relative w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-1 text-sm focus:z-50 focus:ring-1 focus:cursor-text';
	const combinedClassName = `${baseClassName} ${className}`.trim();

	return (
		<textarea
			value={value}
			onChange={handleInput}
			onFocus={handleFocus}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			rows={rows}
			className={combinedClassName}
			placeholder={placeholder}
			style={{ height: `${minHeight}px`, minHeight: `${minHeight}px` }}
			disabled={disabled}
		/>
	);
}
