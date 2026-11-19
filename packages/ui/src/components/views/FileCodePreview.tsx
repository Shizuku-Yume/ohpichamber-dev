import React from 'react';
import { File } from '@pierre/diffs/react';

export function FileCodePreview<LAnnotation = undefined, Caret = undefined>({ file: { name, contents, lang, header, cacheKey }, ...props }: React.ComponentProps<typeof File<LAnnotation, Caret>>) {
  // Pierre compares the prepared layout and rendered file by object identity.
  const file = React.useMemo(() => ({ name, contents, lang, header, cacheKey }), [name, contents, lang, header, cacheKey]);
  return <File<LAnnotation, Caret> {...props} file={file} />;
}
