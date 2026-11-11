const { dict: en } = await import('./src/lib/i18n/messages/en.ts');
const { dict: uk } = await import('./src/lib/i18n/messages/uk.ts');
const { ompSettingsI18n } = await import('./src/lib/i18n/messages/omp-settings.i18n.ts');
const enKeys = Object.keys(en);
const missing = enKeys.filter((k) => !(k in uk));
const inModule = missing.filter((k) => k in ompSettingsI18n.en);
console.log('missing', missing.length, 'in omp module', inModule.length);
console.log('not in module:', missing.filter((k) => !(k in ompSettingsI18n.en)).slice(0, 10));
const enMod = Object.keys(ompSettingsI18n.en);
for (const loc of Object.keys(ompSettingsI18n)) {
  if (loc === 'en') continue;
  const d: Record<string,string> = (ompSettingsI18n as any)[loc];
  console.log(loc, 'en-keys', enMod.length, 'has', enMod.filter(k=>k in d).length);
}
