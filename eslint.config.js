import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig([
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},

	{
		files: ['**/*.ts', '**/*.js'],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['*.js', 'knip.config.ts', 'playwright.config.ts']
				}
			}
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'warn'
		}
	},

	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'warn'
		}
	},

	{
		plugins: { 'import-x': importX },
		rules: {
			// `import { Foo }` => `import type { Foo }`
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'separate-type-imports' }
			],

			// `import { type Foo }` => `import type { Foo }`
			'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level']
		}
	}
]);
