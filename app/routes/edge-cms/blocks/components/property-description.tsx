import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export function PropertyDescription({
	description,
}: {
	description: string | null;
}) {
	if (!description) return null;

	return (
		<div className="text-muted-foreground [&_a]:text-primary text-xs italic [&_a]:underline [&_p]:m-0">
			<Markdown rehypePlugins={[rehypeSanitize]}>{description}</Markdown>
		</div>
	);
}
