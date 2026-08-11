import type { ReactNode } from 'react';

import { cn } from '~/utils/misc';

type WorkspacePageHeaderProps = {
	eyebrow: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	density?: 'default' | 'compact';
	className?: string;
};

export function WorkspacePageHeader({
	eyebrow,
	title,
	description,
	actions,
	density = 'default',
	className,
}: WorkspacePageHeaderProps) {
	return (
		<header
			className={cn(
				'flex flex-col sm:flex-row sm:items-end sm:justify-between',
				density === 'compact' ? 'mb-4 gap-3' : 'mb-9 gap-5',
				className,
			)}
		>
			<div>
				<p
					className={cn(
						'flex items-center gap-2 font-semibold tracking-[0.18em] text-sky-600 uppercase',
						density === 'compact' ? 'mb-1 text-[11px]' : 'mb-2 text-xs',
					)}
				>
					<span className="size-1.5 rounded-full bg-fuchsia-500" />
					{eyebrow}
				</p>
				<h1
					className={cn(
						'font-bold tracking-[-0.035em] text-slate-950',
						density === 'compact' ? 'text-2xl' : 'text-3xl sm:text-4xl',
					)}
				>
					{title}
				</h1>
				{description ? (
					<p className="text-muted-foreground mt-2 max-w-xl text-sm">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div
					className={cn(
						'flex flex-wrap items-center self-start sm:self-auto',
						density === 'compact' ? 'gap-1' : 'gap-2',
					)}
				>
					{actions}
				</div>
			) : null}
		</header>
	);
}

export function WorkspaceToolbar({
	children,
	className,
	label = 'Page controls',
}: {
	children: ReactNode;
	className?: string;
	label?: string;
}) {
	return (
		<div
			role="toolbar"
			aria-label={label}
			className={cn(
				'mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200',
				className,
			)}
		>
			{children}
		</div>
	);
}

export function FloatingSelectionBar({
	children,
	count,
	itemLabel,
}: {
	children: ReactNode;
	count: number;
	itemLabel: string;
}) {
	if (count === 0) return null;

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
			<div
				role="toolbar"
				aria-label="Selection actions"
				className="pointer-events-auto flex items-center gap-3 rounded-full bg-slate-950 px-4 py-2 text-white shadow-[0_18px_50px_rgb(15_23_42/0.3)] ring-1 ring-white/15"
			>
				<span className="border-r border-white/15 pr-3 text-sm font-medium tabular-nums">
					{count} {count === 1 ? itemLabel : `${itemLabel}s`} selected
				</span>
				{children}
			</div>
		</div>
	);
}
