import React from 'react';
import { DraftFolderTarget } from './DraftFolderTarget';
import { DraftTargetSelectors, type DraftTargetProps } from './DraftTargetSelectors';
import { MobileDraftTargetTriggers } from './MobileDraftTargetTriggers';

type ComposerDraftTargetsProps = Omit<DraftTargetProps, 'selectedProject'> & {
    selectedProject: DraftTargetProps['selectedProject'] | null;
    isMobile: boolean;
    showSelectors: boolean;
    exiting: boolean;
    presentationClassName: string;
    onOpenPicker: (picker: 'project' | 'branch') => void;
};

export function ComposerDraftTargets({ selectedProject, isMobile, showSelectors, exiting, presentationClassName, onOpenPicker, ...target }: ComposerDraftTargetsProps) {
    return (
        <>
            <DraftFolderTarget />
            {!isMobile && (showSelectors || exiting) && selectedProject ? (
                <div className={presentationClassName}>
                    <DraftTargetSelectors {...target} selectedProject={selectedProject} />
                </div>
            ) : null}
            {isMobile && showSelectors && selectedProject ? (
                <MobileDraftTargetTriggers {...target} selectedProject={selectedProject} onOpenPicker={onOpenPicker} />
            ) : null}
        </>
    );
}
