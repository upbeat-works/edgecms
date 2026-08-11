import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogStatus,
	DialogTitle,
} from '~/components/ui/dialog';
import { Progress } from '~/components/ui/progress';

const terminalStates = ['terminated', 'errored', 'complete'];
const MIN_VISIBLE_MS = 2000;

export function PublishProgressDialog({
	open,
	onOpenChange,
	publishStatus,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	publishStatus: { status: string } | null;
}) {
	const [minDurationMet, setMinDurationMet] = useState(false);

	useEffect(() => {
		if (!open) {
			setMinDurationMet(false);
			return;
		}
		const timer = setTimeout(() => setMinDurationMet(true), MIN_VISIBLE_MS);
		return () => clearTimeout(timer);
	}, [open]);

	const statusIsTerminal =
		publishStatus != null && terminalStates.includes(publishStatus.status);
	const isTerminal = statusIsTerminal && minDurationMet;
	const displayedStatus = isTerminal ? publishStatus!.status : 'running';

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Publishing draft</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="text-muted-foreground text-sm">
						<span>Status: {displayedStatus}</span>
					</div>
					<Progress
						indeterminate={!isTerminal}
						value={100}
						className="w-full"
					/>
					{isTerminal &&
						(displayedStatus === 'complete' ? (
							<DialogStatus tone="success">
								Draft published successfully
							</DialogStatus>
						) : displayedStatus === 'errored' ? (
							<DialogStatus tone="danger">Publishing failed</DialogStatus>
						) : (
							<DialogStatus tone="warning">
								Publishing {displayedStatus}
							</DialogStatus>
						))}
				</div>
				<DialogFooter>
					{isTerminal ? (
						<Button onClick={() => onOpenChange(false)}>Close</Button>
					) : (
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Hide progress
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
