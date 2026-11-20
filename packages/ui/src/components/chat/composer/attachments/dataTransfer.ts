
/** Data type marking a drag that started in OpenChamber's own file tree. */
export const INTERNAL_FILE_PATH_TYPE = 'application/x-openchamber-file-path';

const FILE_BEARING_TYPES = [
    'files',
    INTERNAL_FILE_PATH_TYPE,
];

/**
 * Whether this drag carries files at all, used to decide if the composer
 * should show its drop target. Checked on dragenter/dragover, where payloads
 * are often unreadable, so declared file types identify the drag before drop.
 */
export function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined): boolean {
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;

    if (dataTransfer.types) {
        const lowerTypes = Array.from(dataTransfer.types).map((type) => type.toLowerCase());
        if (FILE_BEARING_TYPES.some((type) => lowerTypes.includes(type))) return true;
    }

    return false;
}

export function collectDroppedFiles(dataTransfer: DataTransfer | null | undefined): File[] {
    if (!dataTransfer) return [];

    const directFiles = Array.from(dataTransfer.files || []);
    if (directFiles.length > 0) return directFiles;

    return Array.from(dataTransfer.items || [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
}
