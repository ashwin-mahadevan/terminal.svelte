import adapter from '@sveltejs/adapter-node';
import type { Config } from '@sveltejs/kit';

const config: Config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: { adapter: adapter() }
};

export default config;
