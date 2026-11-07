const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([expo, { ignores: ['prompts/', 'node_modules/', '.expo/', 'dist/'] }]);
