export interface ChatInputProps {
    onOpenSettings?: () => void;
    scrollToBottom?: () => void;
    scrollToLatest?: () => void;
    active?: boolean;
    draftPresentationExiting?: boolean;
}

export type SubmitOptions = {
    delivery?: 'steer';
    presetText?: string;
};
