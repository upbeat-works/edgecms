import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export function PropertyDescription({
	description,
}: {
	description: string | null;
}) {
	if (!description) return null;

	return (
		<div className="text-muted-foreground text-xs italic [&_p]:m-0 [&_a]:text-primary [&_a]:underline">
			<Markdown rehypePlugins={[rehypeSanitize]}>{description}</Markdown>
		</div>
	);
}
