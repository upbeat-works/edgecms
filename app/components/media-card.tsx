import { type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';

export interface MediaCardAction {
	label: string;
	onClick: () => void;
	variant?: 'default' | 'destructive';
	separator?: boolean;
}

export interface MediaCardProps {
	preview: ReactNode;
	actions: MediaCardAction[];
	footer?: ReactNode;
	variant?: 'default' | 'gallery';
}

export function MediaCard({
	preview,
	actions,
	footer,
	variant = 'default',
}: MediaCardProps) {
	return (
		<div
			className={cn(
				'group/card relative overflow-hidden',
				variant === 'gallery'
					? 'bg-card rounded-xl shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_rgb(15_23_42/0.04)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgb(14_165_233/0.14)] hover:ring-sky-500/30 dark:ring-white/10'
					: 'space-y-2 rounded-lg border p-4',
			)}
		>
			<div
				className={cn(
					'flex justify-end',
					variant === 'gallery' && 'absolute top-2 right-2 z-20',
				)}
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Open media menu"
							className={cn(
								variant === 'gallery'
									? 'h-8 w-8 rounded-full bg-black/55 text-white opacity-100 shadow-sm backdrop-blur-sm hover:bg-black/75 hover:text-white sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100'
									: 'h-4 w-4 p-0 hover:bg-transparent',
							)}
						>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{actions.map((action, index) => (
							<div key={index}>
								{action.separator && <DropdownMenuSeparator />}
								<DropdownMenuItem
									onSelect={action.onClick}
									className={
										action.variant === 'destructive' ? 'text-destructive' : ''
									}
								>
									{action.label}
								</DropdownMenuItem>
							</div>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			{preview}
			{footer && (
				<div className={cn(variant === 'gallery' && 'px-3 pt-3 pb-3.5')}>
					{footer}
				</div>
			)}
		</div>
	);
}
