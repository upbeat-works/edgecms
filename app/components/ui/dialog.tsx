import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '~/utils/misc';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			'fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-[2px]',
			className,
		)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
		dismissible?: boolean;
		size?: 'sm' | 'md' | 'lg' | 'media';
	}
>(({ className, children, dismissible = true, size = 'md', ...props }, ref) => (
	<DialogPortal>
		<DialogOverlay />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				'fixed right-0 bottom-0 left-0 z-[100] grid max-h-[calc(100dvh-0.75rem)] w-full gap-5 overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-slate-200 bg-white px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-24px_80px_rgb(15_23_42/0.24)] ring-1 ring-white/60 outline-none sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:p-6 sm:shadow-[0_24px_80px_rgb(15_23_42/0.28)]',
				size === 'sm' && 'sm:max-w-md',
				size === 'md' && 'sm:max-w-lg',
				size === 'lg' && 'sm:max-w-2xl',
				size === 'media' && 'max-h-[95vh] sm:max-w-[95vw]',
				className,
			)}
			{...props}
		>
			{size !== 'media' ? (
				<div
					aria-hidden="true"
					className="absolute top-2.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300 sm:hidden"
				/>
			) : null}
			{children}
			{dismissible && (
				<DialogPrimitive.Close className="absolute top-4 right-4 rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none sm:top-4">
					<X className="h-4 w-4" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			)}
		</DialogPrimitive.Content>
	</DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn('flex flex-col space-y-1.5 pr-8 text-left', className)}
		{...props}
	/>
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			'flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto',
			className,
		)}
		{...props}
	/>
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			'text-xl leading-tight font-semibold tracking-tight',
			className,
		)}
		{...props}
	/>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('text-muted-foreground text-sm', className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

function DialogStatus({
	children,
	tone,
}: {
	children: React.ReactNode;
	tone: 'success' | 'danger' | 'warning';
}) {
	return (
		<div
			role="status"
			className={cn(
				'rounded-lg px-3 py-2.5 text-sm font-medium ring-1',
				tone === 'success' && 'bg-emerald-50 text-emerald-800 ring-emerald-200',
				tone === 'danger' && 'bg-red-50 text-red-800 ring-red-200',
				tone === 'warning' && 'bg-yellow-50 text-yellow-900 ring-yellow-200',
			)}
		>
			{children}
		</div>
	);
}

function DialogError({ children }: { children: React.ReactNode }) {
	return (
		<p
			role="alert"
			className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800 ring-1 ring-red-200"
		>
			{children}
		</p>
	);
}

export {
	Dialog,
	DialogPortal,
	DialogOverlay,
	DialogClose,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
	DialogStatus,
	DialogError,
};
