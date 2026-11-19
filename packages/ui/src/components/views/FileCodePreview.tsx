import React from 'react';
import { File } from '@pierre/diffs/react';
import { useFilePreviewDescriptor } from './filePreview';

export function FileCodePreview<LAnnotation = undefined, Caret = undefined>({ file, ...props }: React.ComponentProps<typeof File<LAnnotation, Caret>>) {
  const descriptor = useFilePreviewDescriptor(file);
  return <File<LAnnotation, Caret> {...props} file={descriptor} />;
}
