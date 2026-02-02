module.exports = {
	root: true,
	env: {
		browser: true,
		node: true,
		es2022: true,
	},
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
	},
	plugins: ["@typescript-eslint"],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:astro/recommended",
		"prettier",
	],
	rules: {
		curly: ["error", "all"],
		eqeqeq: ["warn", "always"],
		"no-implicit-coercion": "error",
		"prefer-const": "error",
		"@typescript-eslint/consistent-type-imports": [
			"warn",
			{ prefer: "type-imports", disallowTypeAnnotations: false },
		],
		"@typescript-eslint/no-explicit-any": "warn",
		"@typescript-eslint/no-unused-vars": [
			"warn",
			{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
		],
		"@typescript-eslint/ban-ts-comment": "warn",
		"@typescript-eslint/triple-slash-reference": "warn",
	},
	overrides: [
		{
			files: ["**/*.ts", "**/*.tsx"],
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: __dirname,
			},
		},
		{
			files: ["**/*.astro"],
			parser: "astro-eslint-parser",
			parserOptions: {
				parser: "@typescript-eslint/parser",
				extraFileExtensions: [".astro"],
			},
			rules: {
				"no-inner-declarations": "off",
				"no-undef": "off",
			},
		},
		{
			files: ["**/*.svelte"],
			parser: "svelte-eslint-parser",
			parserOptions: {
				parser: "@typescript-eslint/parser",
				project: null,
				svelteConfig: "./svelte.config.js",
				extraFileExtensions: [".svelte"],
			},
			extends: ["plugin:svelte/recommended"],
			rules: {
				"no-undef": "off",
			},
		},
		{
			files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
			parserOptions: {
				project: null,
			},
		},
	],
};
