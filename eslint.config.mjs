// Análisis estático · Manual de Calidad MC-SGA-001, secciones 14.1 a 14.4
// Cada regla indica entre corchetes la disposición del manual que verifica.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const LONGITUD_MAXIMA_FUNCION = 50;
const COMPLEJIDAD_MAXIMA = 10;

export default tseslint.config(
    { ignores: ['dist/', 'coverage/', 'node_modules/', 'db/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            // [RNF-08][14.2] complejidad ciclomática menor o igual a 10 por método
            complexity: ['error', COMPLEJIDAD_MAXIMA],
            // [14.2] funciones y métodos de 50 líneas como máximo
            'max-lines-per-function': [
                'error',
                { max: LONGITUD_MAXIMA_FUNCION, skipBlankLines: true, skipComments: true },
            ],
            // [14.2] prohibición de valores mágicos: usar constantes nombradas
            '@typescript-eslint/no-magic-numbers': [
                'error',
                {
                    ignore: [0, 1, -1],
                    ignoreEnums: true,
                    ignoreReadonlyClassProperties: true,
                    ignoreNumericLiteralTypes: true,
                    ignoreTypeIndexes: true,
                },
            ],
            // [14.1] convenciones de nomenclatura obligatorias
            '@typescript-eslint/naming-convention': [
                'error',
                { selector: 'typeLike', format: ['PascalCase'] },
                { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
                { selector: 'function', format: ['camelCase'] },
                { selector: 'method', format: ['camelCase'] },
                { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
                {
                    selector: 'variable',
                    modifiers: ['const'],
                    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                },
                { selector: 'variable', format: ['camelCase'] },
                { selector: 'classProperty', format: ['camelCase', 'UPPER_CASE'] },
                // Las columnas de la base de datos usan snake_case (14.1)
                { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
            ],
            // [14.3][S-11][RNF-09] prohibida la concatenación para construir SQL
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        'TemplateLiteral[expressions.length>0] > TemplateElement[value.raw=/^\\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\\b/i]',
                    message:
                        'S-11: no interpole valores en SQL; use consultas parametrizadas ($1, $2, ...).',
                },
                {
                    selector:
                        "BinaryExpression[operator='+'] Literal[value=/^\\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\\b/i]",
                    message:
                        'S-11: no concatene cadenas para construir SQL; use consultas parametrizadas.',
                },
            ],
            // [14.3] los errores se registran con el Logger, nunca en consola
            'no-console': 'error',
            eqeqeq: ['error', 'always'],
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
    {
        // Pantallas: JavaScript del navegador, sin compilación
        files: ['publico/**/*.js'],
        languageOptions: { sourceType: 'module', globals: globals.browser },
    },
    {
        // Scripts de apoyo y pruebas de aceptación que se ejecutan con Node
        files: ['**/*.mjs'],
        languageOptions: { globals: globals.node },
    },
    {
        // En las pruebas se admiten literales numéricos y funciones largas de casos
        files: ['**/*.spec.ts'],
        rules: {
            '@typescript-eslint/no-magic-numbers': 'off',
            'max-lines-per-function': 'off',
        },
    },
);
