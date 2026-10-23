import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default defineConfig(
	{
		ignores: [
			'**/node_modules',
			'dist',
			'src/ts/declarations/**',
			'src/ts/**/*.js',
			'src/lib/**',
			'**/bundle.js'
		]
	},
	js.configs.recommended,
	tseslint.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			"prefer-const": ["off"],
			"@typescript-eslint/no-explicit-any": ["off"],
			"indent": ["error", "tab", { "SwitchCase": 1, "flatTernaryExpressions": true }],
			"no-useless-escape": ["off"],
			"semi": ["error", "always"],
			"@typescript-eslint/no-empty-function": ["off"],
			"no-constant-condition": ["error", { "checkLoops": false }],
			"no-cond-assign": ["off"],
			"@typescript-eslint/no-unused-vars": ['warn', { argsIgnorePattern: '^_' }],
			"no-async-promise-executor": ["off"],
			"@typescript-eslint/no-this-alias": ["off"],
			"no-empty": ["error", { "allowEmptyCatch": true }],
			"no-trailing-spaces": ["warn"],
			"no-warning-comments": ["warn", { "terms": ["todo", "fixme", "temp"] }],
			"comma-dangle": ["warn", "never"],
			"eqeqeq": ["error", "always"]
		}
	}
);
