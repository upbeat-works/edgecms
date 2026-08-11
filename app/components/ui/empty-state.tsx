import type { ReactNode } from 'react';

import { cn } from '~/utils/misc';

type EmptyStateProps = {
	title: ReactNode;
	description: ReactNode;
	action?: ReactNode;
	density?: 'default' | 'compact';
	className?: string;
};

function EmptyStateDoodle() {
	return (
		<svg
			viewBox="0 0 420 180"
			aria-hidden="true"
			className="pointer-events-none absolute inset-x-0 top-1/2 h-40 w-full -translate-y-1/2"
			fill="none"
		>
			<path
				d="M38 117c39-69 86 29 134-24 32-36 52-71 104-46 34 16 44 67 105 36"
				stroke="#38bdf8"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray="5 9"
				className="opacity-30"
			/>
			<path
				d="m54 57 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2 5-10Z"
				stroke="#d946ef"
				strokeWidth="2"
				strokeLinejoin="round"
				className="opacity-55"
			/>
			<path
				d="m362 116 3 7 8 1-6 5 2 8-7-4-7 4 1-8-6-5 8-1 4-7Z"
				fill="#fde047"
				stroke="#eab308"
				strokeWidth="1.5"
				strokeLinejoin="round"
				className="opacity-70"
			/>
			<path
				d="M89 139c13 8 26 8 39 0M300 35c11-8 23-8 34 0"
				stroke="#d946ef"
				strokeWidth="2"
				strokeLinecap="round"
				className="opacity-35"
			/>
			<circle cx="343" cy="55" r="4" fill="#38bdf8" className="opacity-50" />
			<circle cx="105" cy="34" r="3" fill="#fde047" className="opacity-80" />
		</svg>
	);
}

export function EmptyState({
	title,
	description,
	action,
	density = 'default',
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				'relative isolate flex flex-col items-center justify-center overflow-hidden px-6 text-center',
				density === 'compact' ? 'min-h-48 py-8' : 'min-h-72 rounded-2xl py-12',
				className,
			)}
		>
			<EmptyStateDoodle />
			<div className="relative z-10 flex max-w-sm flex-col items-center">
				<h2 className="font-semibold tracking-tight text-slate-950">{title}</h2>
				<p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
					{description}
				</p>
				{action ? <div className="mt-5">{action}</div> : null}
			</div>
		</div>
	);
}
