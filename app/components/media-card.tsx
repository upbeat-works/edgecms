import { type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '~/components/ui/button';
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
}

export function MediaCard({ preview, actions, footer }: MediaCardProps) {
	return (
		<div className="space-y-2 rounded-lg border p-4">
			<div className="flex justify-end">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Open media menu"
							className="h-4 w-4 p-0 hover:bg-transparent"
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
			{footer && <div>{footer}</div>}
		</div>
	);
}
