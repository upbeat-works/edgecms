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
			'fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px]',
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
				'fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgb(15_23_42/0.28)] ring-1 ring-white/60',
				size === 'sm' && 'sm:max-w-md',
				size === 'md' && 'sm:max-w-lg',
				size === 'lg' && 'sm:max-w-2xl',
				size === 'media' && 'max-h-[95vh] sm:max-w-[95vw]',
				className,
			)}
			{...props}
		>
			{children}
			{dismissible && (
				<DialogPrimitive.Close className="absolute top-4 right-4 rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none">
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
			'flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end',
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
