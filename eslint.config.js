import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["dist/**", ".vercel/**", "node_modules/**"],
	},
	{
		files: ["**/*.{js,cjs,mjs,ts,tsx,cts,mts}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2022,
			},
		},
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
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
	},
	prettier,
);

