import { parseAst, type Plugin, type Rollup } from 'vite';


const LOCALE_DICTIONARY = /[\\/]i18n[\\/]messages[\\/]([A-Za-z]{2}(?:-[A-Za-z]{2})?)(?:\.settings)?\.ts$/;
const FEATURE_FILE = /[\\/]i18n[\\/]messages[\\/][^\\/]+\.i18n\.ts$/;
const QUERY = '?i18n-locale=';

type Program = Rollup.ProgramNode;
type Span = { start: number; end: number };

const exportedObject = (program: Program) => {
  const exported = program.body.filter((node) => node.type === 'ExportNamedDeclaration');
  if (exported.length !== 1 || exported[0].type !== 'ExportNamedDeclaration') return null;
  const declaration = exported[0].declaration;
  if (declaration?.type !== 'VariableDeclaration' || declaration.declarations.length !== 1) return null;
  const init = declaration.declarations[0].init;
  return init?.type === 'ObjectExpression' ? init : null;
};

type ObjectExpression = NonNullable<ReturnType<typeof exportedObject>>;
type Member = ObjectExpression['properties'][number];

// SAFETY: Rollup's parser sets `start` and `end` on every node; its types
// declare them on the program only.
const spanOf = (node: Member | ObjectExpression): Span => node as (Member | ObjectExpression) & Span;

const memberName = (member: Member): string | null => {
  if (member.type !== 'Property' || member.computed) return null;
  if (member.key.type === 'Identifier') return member.key.name;
  return member.key.type === 'Literal' ? String(member.key.value) : null;
};

export const dictionaryLocale = (importer: string): string | null => LOCALE_DICTIONARY.exec(importer)?.[1] ?? null;

export const localeSliceId = (featureId: string, locale: string): string | null => (
  FEATURE_FILE.test(featureId) ? `${featureId}${QUERY}${locale}` : null
);

export const sliceLocale = (
  code: string,
  id: string,
): { code: string; missingLocale: boolean } | null => {
  const queryAt = id.indexOf(QUERY);
  if (queryAt < 0) return null;
  const locale = id.slice(queryAt + QUERY.length);
  const object = exportedObject(parseAst(code));
  if (!object) return null;
  const kept: string[] = [];
  let missingLocale = true;
  for (const member of object.properties) {
    const name = memberName(member);
    if (name === null) return null;
    if (name === locale) {
      missingLocale = false;
      const { start, end } = spanOf(member);
      kept.push(code.slice(start, end));
    }
  }
  const { start, end } = spanOf(object);
  return {
    code: `${code.slice(0, start)}{${kept.join(',')}}${code.slice(end)}`,
    missingLocale,
  };
};

export const localeSlicesPlugins = (): Plugin[] => [
  {
    name: 'openchamber-i18n-locale-slices:resolve',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.includes('.i18n')) return null;
      // Locale dictionaries (<locale>.ts / <locale>.settings.ts) slice every
      // aggregate they import down to their own locale. Aggregates that pull
      // other aggregates (providers → native-providers/omp-provider-config)
      // propagate the slice through the importer's query, so nested spread
      // keys resolve against equally sliced objects.
      const queryAt = importer.indexOf(QUERY);
      const locale = queryAt >= 0 ? importer.slice(queryAt + QUERY.length) : dictionaryLocale(importer);
      if (!locale) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const id = localeSliceId(resolved.id.split('?')[0], locale);
      return id ? { ...resolved, id } : null;
    },
  },
  {
    name: 'openchamber-i18n-locale-slices:slice',
    enforce: 'post',
    transform(code, id) {
      if (!id.includes(QUERY)) return null;
      const sliced = sliceLocale(code, id);
      if (sliced === null) {
        // A sliced import that does not match the single-exported-object
        // shape means upstream added an aggregate form this transform does
        // not understand. Shipping it whole would silently bundle every
        // locale back into the eager graph, so the build must stop here.
        this.error(`i18n locale slicing could not parse ${id.split('?')[0]}: expected exactly one exported object literal with locale keys`);
      }
      // A locale the aggregate does not carry (m4-lane-d has no `en`) slices
      // to an empty object, which is exactly what spreading the original
      // undefined key produced.
      return { code: sliced.code, map: null };
    },
  },
];
