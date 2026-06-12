const path = require('path');

/**
 * Webpack overrides for consuming the YieldFabric SDKs FROM SOURCE.
 *
 * Both `@yieldfabric/wallet` and `@yieldfabric/terminal` are installed
 * as `file:` dependencies and compiled from their TypeScript source.
 * How each gets there differs — and the distinction is load-bearing:
 *
 *   - `@yieldfabric/terminal` ships source-only: its package `main`
 *     points at `src/index.ts`, so source consumption is automatic.
 *   - `@yieldfabric/wallet` declares a prebuilt `dist/` entry point
 *     (which may be stale or absent in a fresh checkout). The
 *     `resolve.alias` below FORCES it to `src/` — keep that alias when
 *     restructuring, or webpack silently falls back to whatever
 *     `dist/` happens to contain.
 *
 * Three adjustments make source consumption work inside a Create
 * React App build — the same pattern `yieldfabric-app` and
 * `tncshell/frontend` use:
 *
 *   1. Drop CRA's ModuleScopePlugin (it forbids imports that resolve
 *      outside `src/`, which is exactly what the `file:` SDKs do).
 *   2. Include both SDK `src/` trees in babel-loader so their
 *      TypeScript is transpiled alongside the app's.
 *   3. Alias every dedupe-critical shared dependency (react, zod,
 *      framer-motion, …) to THIS app's single physical copy — without
 *      this, webpack can resolve a second copy from the SDK's own
 *      node_modules and you get the classic duplicate-React hooks
 *      crash at the host↔SDK boundary.
 */
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.plugins = webpackConfig.resolve.plugins.filter(
        (plugin) => plugin.constructor.name !== 'ModuleScopePlugin'
      );

      const babelLoaderRule = webpackConfig.module.rules.find((rule) => rule.oneOf);
      if (babelLoaderRule && babelLoaderRule.oneOf) {
        const jsLoader = babelLoaderRule.oneOf.find(
          (rule) =>
            rule.test &&
            (rule.test.toString().includes('tsx') || rule.test.toString().includes('jsx'))
        );
        if (jsLoader) {
          jsLoader.include = [
            jsLoader.include,
            path.resolve(__dirname, '../../yieldfabric-terminal/src'),
            path.resolve(__dirname, '../../yieldfabric-wallet-sdk/src'),
          ];
        }
      }

      // Imports issued from inside the sibling SDK source trees need a
      // deterministic fallback to find dependencies: webpack walks up
      // from the issuing file's directory and never reaches this app's
      // node_modules on its own.
      if (!webpackConfig.resolve.modules) {
        webpackConfig.resolve.modules = ['node_modules'];
      }
      webpackConfig.resolve.modules.push(
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '../../yieldfabric-terminal/node_modules'),
        path.resolve(__dirname, '../../yieldfabric-wallet-sdk/node_modules')
      );

      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        '@yieldfabric/terminal': path.resolve(__dirname, '../../yieldfabric-terminal/src'),
        '@yieldfabric/wallet': path.resolve(__dirname, '../../yieldfabric-wallet-sdk/src'),
        // One physical copy of everything shared across the boundary.
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion'),
        'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
        'react-markdown': path.resolve(__dirname, 'node_modules/react-markdown'),
        zod: path.resolve(__dirname, 'node_modules/zod'),
        'js-sha3': path.resolve(__dirname, 'node_modules/js-sha3'),
        '@heroicons/react': path.resolve(__dirname, 'node_modules/@heroicons/react'),
      };

      // The SDK sources are authored against a newer TypeScript than
      // CRA 5 bundles. babel-loader transpiles them fine (it strips
      // types without checking); ForkTsCheckerWebpackPlugin would
      // type-check every file webpack touches with the app's bundled
      // TS and fail on version-specific syntax. Type checking is the
      // separate `npm run typecheck` step instead — same split
      // yieldfabric-app uses.
      webpackConfig.plugins = webpackConfig.plugins.filter(
        (p) => p.constructor && p.constructor.name !== 'ForkTsCheckerWebpackPlugin'
      );

      return webpackConfig;
    },
  },
};
