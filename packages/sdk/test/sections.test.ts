import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
	addSection,
	listSections,
	removeSection,
	renameSection,
} from '../src/commands/sections.js';
import { projectDir } from './helpers.js';

const sections = new Set(['Homepage']);
const requests: { method: string; body?: unknown }[] = [];
const server = setupServer(
	http.get('*/api/sections', ({ request }) => {
		requests.push({ method: request.method });
		return HttpResponse.json({
			sections: [...sections].sort().map(name => ({ name })),
		});
	}),
	http.post('*/api/sections', async ({ request }) => {
		const body = (await request.json()) as { name: string };
		requests.push({ method: request.method, body });
		sections.add(body.name);
		return HttpResponse.json({ name: body.name }, { status: 201 });
	}),
	http.patch('*/api/sections', async ({ request }) => {
		const body = (await request.json()) as { name: string; newName: string };
		requests.push({ method: request.method, body });
		sections.delete(body.name);
		sections.add(body.newName);
		return HttpResponse.json({ name: body.newName });
	}),
	http.delete('*/api/sections', async ({ request }) => {
		const body = (await request.json()) as { name: string; dryRun: boolean };
		requests.push({ method: request.method, body });
		if (!body.dryRun) sections.delete(body.name);
		return HttpResponse.json({
			name: body.name,
			dryRun: body.dryRun,
			deleted: !body.dryRun,
		});
	}),
);

beforeEach(() => {
	sections.clear();
	sections.add('Homepage');
	requests.length = 0;
	server.listen({ onUnhandledRequest: 'error' });
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	server.close();
	vi.restoreAllMocks();
});

describe('section CLI commands', () => {
	it('lists and mutates sections through the public HTTP boundary', async () => {
		const { config } = await projectDir();

		await listSections(config);
		await addSection(config, 'Marketing');
		await renameSection(config, 'Marketing', 'Campaigns');

		expect(requests).toEqual([
			{ method: 'GET' },
			{ method: 'POST', body: { name: 'Marketing' } },
			{
				method: 'PATCH',
				body: { name: 'Marketing', newName: 'Campaigns' },
			},
		]);
		expect(sections).toEqual(new Set(['Homepage', 'Campaigns']));
		expect(console.log).toHaveBeenCalledWith('  Homepage');
		expect(console.log).toHaveBeenCalledWith('Created section "Marketing".');
		expect(console.log).toHaveBeenCalledWith(
			'Renamed section "Marketing" to "Campaigns".',
		);
	});

	it('previews deletion unless --yes explicitly confirms it', async () => {
		const { config } = await projectDir();

		await removeSection(config, 'Homepage');
		expect(requests).toEqual([
			{ method: 'DELETE', body: { name: 'Homepage', dryRun: true } },
		]);
		expect(sections.has('Homepage')).toBe(true);
		expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--yes'));

		await removeSection(config, 'Homepage', { yes: true });
		expect(requests.at(-1)).toEqual({
			method: 'DELETE',
			body: { name: 'Homepage', dryRun: false },
		});
		expect(sections.has('Homepage')).toBe(false);
	});
});
