import path from 'path';
import fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// ---------------------------------------------------------------------------
// Vendored RingCX UI support (mirrors artifacts/rcx-supervisor/vite.config.ts).
// The vendor tree lives in the rcx-supervisor artifact and needs:
//  1. Angular/common-services stubs (imports not used in standalone rendering)
//  2. Generic JSX type-args stripped (esbuild/babel can't parse them)
//  3. Exclusion from the react-babel plugin (esbuild handles the TSX instead)
// ---------------------------------------------------------------------------
const STUB_RE = /(^|\/)common\/(services|directives)\//;
const WMC = '@ringcentral/web-modules-core';

function stripProtoJsxGenerics(code: string): string {
  const re = /(^|\n)([ \t]*)<([A-Z][A-Za-z0-9_]*)</g;
  let result = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const genericStart = m.index + m[0].length - 1;
    let depth = 0;
    let i = genericStart;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === '<') depth++;
      else if (ch === '>') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    result += code.slice(lastIndex, genericStart);
    lastIndex = i;
    re.lastIndex = i;
  }
  result += code.slice(lastIndex);
  return result;
}

const stubEagAngular = {
  name: 'stub-eag-angular',
  enforce: 'pre' as const,
  resolveId(source: string) {
    if (source === WMC) return '\0wmc-stub';
    if (STUB_RE.test(source) && !source.includes('node_modules')) {
      return '\0eag-stub:' + source;
    }
    return null;
  },
  load(id: string) {
    const clean = id.split('?')[0];
    if (
      clean.includes('/proto/') &&
      clean.endsWith('.tsx') &&
      fs.existsSync(clean)
    ) {
      return stripProtoJsxGenerics(fs.readFileSync(clean, 'utf8'));
    }
    if (id.startsWith('\0eag-stub:')) {
      const names = [
        '$theme','AIFeature','ActivityLog','AgentCprClient','AttributesItem','AttributesItemKind','CANCEL_DUPLICATED_REQUEST_FLAG','ChannelType','ContactsInfo','CreateContactProfileRequestData','DownChevronTransformIcon','ExternalData','ExternalDataAttributes','ExternalDataAttributesItem','FrameTypeMap','GetContactProfileRequestData','HistoryChannelClass','HistoryItemType','IScreenRecordingService','NQI','PlayerController','ScreenRecordingNotificationType','UIStateKey','UIStateService','checkBlock','createContactProfile','cxaoClient','getActivities','getAgentAssistMessageManagerFactory','getAllTags','getContactProfile','getExternalContactProfile','getQueueAvailability','initialize','refreshFrame','updateActivity','updateContactProfile',
      ];
      return (
        `
const mk = () => new Proxy(function(){ return null; }, {
  get: () => mk(),
  apply: () => null,
  construct: () => mk(),
});
` +
        names.map((n) => `export const ${n} = mk();`).join('\n') +
        `\nexport default mk();`
      );
    }
    if (id === '\0wmc-stub') {
      return `const passThrough = (props) => (props && props.children != null ? props.children : null);
module.exports = new Proxy({ __esModule: true, default: passThrough }, { get: (t, k) => (k in t ? t[k] : passThrough) });`;
    }
    return null;
  },
};

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    stubEagAngular,
    react({ exclude: [/[\\/]proto[\\/]/] }),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
      // Vendored RingCX UI core library (lives in the rcx-supervisor artifact).
      '@ringcx/ui': path.resolve(
        import.meta.dirname,
        '..',
        'rcx-supervisor',
        'client/src/proto/vendor/ringcx-ui/index.ts',
      ),
      '@ringcx/shared': path.resolve(
        import.meta.dirname,
        '..',
        'rcx-supervisor',
        'client/src/proto/stubs/ringcx-shared/index.ts',
      ),
      '@ringcx/pii-interceptor': path.resolve(
        import.meta.dirname,
        '..',
        'rcx-supervisor',
        'client/src/proto/stubs/pii-interceptor/index.ts',
      ),
    },
    dedupe: ['react', 'react-dom', 'styled-components'],
  },
  define: {
    'process.env': {},
    'process.env.NODE_ENV': JSON.stringify(
      process.env.NODE_ENV || 'development',
    ),
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'styled-components',
      '@ringcentral/juno',
    ],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
