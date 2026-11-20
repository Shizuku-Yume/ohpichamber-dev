import type { ChatWidth } from '@/stores/ui/types';
import { SETTINGS_WIDTH_NUMBER_CLASS } from '@/components/sections/shared/SettingsSection';
import React from 'react';
import type { OmpSettingsState } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { NumberInput } from '@/components/ui/number-input';
import { SortableTabsStrip, type SortableTabsStripItem } from '@/components/ui/sortable-tabs-strip';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { SettingsSection, SettingsFieldRow, SettingsCheckboxRow, SettingsChipGroup, SettingsControlGroup, SettingsRadioGroup, SettingsRadioOption, SettingsNewBadge, SETTINGS_NUMBER_STEPPER_ROW_CLASS, SETTINGS_NUMBER_UNIT_CLASS, SETTINGS_SPACE_CHECKBOX_CLASS, SETTINGS_SPACE_ROW_CLASS, SETTINGS_WIDTH_SELECT_CLASS } from '@/components/sections/shared/SettingsSection';
import { JevAccessNote } from '@/components/sections/classification/JevAccessNote';
import { useDeviceInfo } from '@/lib/device';
import { useI18n, type I18nKey } from '@/lib/i18n';
import {
  MAX_INPUT_HISTORY_LIMIT,
  MIN_INPUT_HISTORY_LIMIT,
  isInputHistoryLimit,
  type InputHistoryScope,
} from '@/lib/inputHistoryScope';
import { updateDesktopSettings } from '@/lib/persistence';
import { useInputHistoryStore } from '@/stores/useInputHistoryStore';
import { useMessageQueueStore, type FollowUpBehavior } from '@/stores/messageQueueStore';
import { selectSafetyNetAvailable, useRoutingStore } from '@/stores/useRoutingStore';
import { DEFAULT_SELECTION_APPROVAL_TEXT, useUIStore, type LargeTextPasteBehavior } from '@/stores/useUIStore';

import { MessageSearchSettings } from './MessageSearchSettings';
import { chatSettingsTabAnchors, useChatSettingsTabStore, type ChatSettingsTab } from './chatSettingsTabs';

type ChipOption<T extends string> = { id: T; labelKey: I18nKey };

const ACTIVITY_RENDER_MODE_OPTIONS: ChipOption<'collapsed' | 'summary'>[] = [
  { id: 'collapsed', labelKey: 'settings.openchamber.visual.option.activityRenderMode.collapsed.label' },
  { id: 'summary', labelKey: 'settings.openchamber.visual.option.activityRenderMode.summary.label' },
];

const USER_MESSAGE_RENDERING_OPTIONS: ChipOption<'markdown' | 'plain'>[] = [
  { id: 'markdown', labelKey: 'settings.openchamber.visual.option.userMessageRendering.markdown.label' },
  { id: 'plain', labelKey: 'settings.openchamber.visual.option.userMessageRendering.plain.label' },
];

const MERMAID_RENDERING_OPTIONS: ChipOption<'svg' | 'ascii'>[] = [
  { id: 'svg', labelKey: 'settings.openchamber.visual.option.mermaidRendering.svg.label' },
  { id: 'ascii', labelKey: 'settings.openchamber.visual.option.mermaidRendering.ascii.label' },
];

const DIFF_LAYOUT_OPTIONS: ChipOption<'dynamic' | 'inline' | 'side-by-side'>[] = [
  { id: 'dynamic', labelKey: 'settings.openchamber.visual.option.diffLayout.dynamic.label' },
  { id: 'inline', labelKey: 'settings.openchamber.visual.option.diffLayout.inline.label' },
  { id: 'side-by-side', labelKey: 'settings.openchamber.visual.option.diffLayout.sideBySide.label' },
];

const CHAT_WIDTH_OPTIONS: ChipOption<ChatWidth>[] = [
  { id: 'default', labelKey: 'settings.openchamber.visual.option.chatWidth.default.label' },
  { id: 'wider', labelKey: 'settings.openchamber.visual.option.chatWidth.wider.label' },
  { id: 'full', labelKey: 'settings.openchamber.visual.option.chatWidth.full.label' },
];

const FOLLOW_UP_BEHAVIOR_OPTIONS: ChipOption<FollowUpBehavior>[] = [
  { id: 'steer', labelKey: 'settings.openchamber.visual.option.followUpBehavior.steer.label' },
  { id: 'queue', labelKey: 'settings.openchamber.visual.option.followUpBehavior.queue.label' },
];

const QUESTIONS_PLACEMENT_OPTIONS: ChipOption<'popup' | 'chat'>[] = [
  { id: 'popup', labelKey: 'settings.openchamber.visual.option.questionsPlacement.popup.label' },
  { id: 'chat', labelKey: 'settings.openchamber.visual.option.questionsPlacement.chat.label' },
];

const INPUT_HISTORY_SCOPE_OPTIONS: ChipOption<InputHistoryScope>[] = [
  { id: 'global', labelKey: 'settings.openchamber.visual.option.inputHistoryScope.global.label' },
  { id: 'session', labelKey: 'settings.openchamber.visual.option.inputHistoryScope.session.label' },
];

const LARGE_TEXT_PASTE_BEHAVIOR_OPTIONS: ChipOption<LargeTextPasteBehavior>[] = [
  { id: 'ask', labelKey: 'settings.openchamber.visual.option.largeTextPaste.ask.label' },
  { id: 'attach', labelKey: 'settings.openchamber.visual.option.largeTextPaste.attach.label' },
  { id: 'inline', labelKey: 'settings.openchamber.visual.option.largeTextPaste.inline.label' },
  { id: 'inline-double-paste', labelKey: 'settings.openchamber.visual.option.largeTextPaste.inlineDoublePaste.label' },
];

const NESTED_OPTION_CLASS = 'ps-6';

const useChipOptions = <T extends string>(options: ChipOption<T>[]) => {
  const { t } = useI18n();
  return React.useMemo(() => options.map((option) => ({ value: option.id, label: t(option.labelKey) })), [options, t]);
};

const SelectionApprovalField: React.FC = () => {
  const { t } = useI18n();
  const selectionApprovalText = useUIStore((state) => state.selectionApprovalText);
  const setSelectionApprovalText = useUIStore((state) => state.setSelectionApprovalText);

  return (
    <SettingsFieldRow
      label={t('settings.openchamber.visual.field.selectionApprovalText')}
      info={t('settings.openchamber.visual.field.selectionApprovalTextInfo')}
      settingsItem="chat.selection-approval-text"
    >
      <Input
        value={selectionApprovalText}
        placeholder={DEFAULT_SELECTION_APPROVAL_TEXT}
        maxLength={1000}
        onChange={(event) => setSelectionApprovalText(event.target.value)}
        aria-label={t('settings.openchamber.visual.field.selectionApprovalText')}
        className="w-full"
        dir="auto"
      />
    </SettingsFieldRow>
  );
};

const MessagesTab: React.FC = () => {
  const { t } = useI18n();
  const activityRenderMode = useUIStore((state) => state.activityRenderMode);
  const setActivityRenderMode = useUIStore((state) => state.setActivityRenderMode);
  const showReasoningTraces = useUIStore((state) => state.showReasoningTraces);
  const setShowReasoningTraces = useUIStore((state) => state.setShowReasoningTraces);
  const collapsibleThinkingBlocks = useUIStore((state) => state.collapsibleThinkingBlocks);
  const setCollapsibleThinkingBlocks = useUIStore((state) => state.setCollapsibleThinkingBlocks);
  const expandReasoningWhileStreaming = useUIStore((state) => state.expandReasoningWhileStreaming);
  const setExpandReasoningWhileStreaming = useUIStore((state) => state.setExpandReasoningWhileStreaming);
  const showToolFileIcons = useUIStore((state) => state.showToolFileIcons);
  const setShowToolFileIcons = useUIStore((state) => state.setShowToolFileIcons);
  const showTurnChangedFiles = useUIStore((state) => state.showTurnChangedFiles);
  const setShowTurnChangedFiles = useUIStore((state) => state.setShowTurnChangedFiles);
  const streamingAutoFollowEnabled = useUIStore((state) => state.streamingAutoFollowEnabled);
  const setStreamingAutoFollowEnabled = useUIStore((state) => state.setStreamingAutoFollowEnabled);
  const chatWidth = useUIStore((state) => state.chatWidth);
  const setChatWidth = useUIStore((state) => state.setChatWidth);
  const promptNavigatorEnabled = useUIStore((state) => state.promptNavigatorEnabled);
  const setPromptNavigatorEnabled = useUIStore((state) => state.setPromptNavigatorEnabled);
  const collapsibleUserMessages = useUIStore((state) => state.collapsibleUserMessages);
  const setCollapsibleUserMessages = useUIStore((state) => state.setCollapsibleUserMessages);
  const stickyUserHeader = useUIStore((state) => state.stickyUserHeader);
  const setStickyUserHeader = useUIStore((state) => state.setStickyUserHeader);
  const showSplitAssistantMessageActions = useUIStore((state) => state.showSplitAssistantMessageActions);
  const setShowSplitAssistantMessageActions = useUIStore((state) => state.setShowSplitAssistantMessageActions);
  const userMessageRenderingMode = useUIStore((state) => state.userMessageRenderingMode);
  const setUserMessageRenderingMode = useUIStore((state) => state.setUserMessageRenderingMode);
  const mermaidRenderingMode = useUIStore((state) => state.mermaidRenderingMode);
  const setMermaidRenderingMode = useUIStore((state) => state.setMermaidRenderingMode);
  const diffLayoutPreference = useUIStore((state) => state.diffLayoutPreference);
  const setDiffLayoutPreference = useUIStore((state) => state.setDiffLayoutPreference);
  const codeBlockLineWrap = useUIStore((state) => state.codeBlockLineWrap);
  const setCodeBlockLineWrap = useUIStore((state) => state.setCodeBlockLineWrap);
  const tableCellWrap = useUIStore((state) => state.tableCellWrap);
  const setTableCellWrap = useUIStore((state) => state.setTableCellWrap);
  const copyMessagesAsPlainText = useUIStore((state) => state.copyMessagesAsPlainText);
  const setCopyMessagesAsPlainText = useUIStore((state) => state.setCopyMessagesAsPlainText);
  const activityOptions = useChipOptions(ACTIVITY_RENDER_MODE_OPTIONS);
  const userMessageOptions = useChipOptions(USER_MESSAGE_RENDERING_OPTIONS);
  const mermaidOptions = useChipOptions(MERMAID_RENDERING_OPTIONS);
  const diffLayoutOptions = useChipOptions(DIFF_LAYOUT_OPTIONS);
  const chatWidthOptions = useChipOptions(CHAT_WIDTH_OPTIONS);

  const handleActivityRenderModeChange = (mode: 'collapsed' | 'summary') => {
    setActivityRenderMode(mode);
    void updateDesktopSettings({ activityRenderMode: mode, chatRenderMode: 'live' });
  };
  const { form: ompForm, updateSetting: updateOmpSetting, getSectionSettings, loading: ompLoading } = useOmpPageSettings('chat');
  const displaySettings = getSectionSettings('display');
  const thinkingSettings = getSectionSettings('thinking');
  const imageSettings = getSectionSettings('images');

  return (
    <>
      <SettingsSection title={t('settings.layout.chat.section.activity')} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        <SettingsFieldRow label={t('settings.openchamber.visual.section.activityDefault')} settingsItem="chat.activity-default">
          <SettingsChipGroup
            value={activityRenderMode}
            options={activityOptions}
            onChange={handleActivityRenderModeChange}
            aria-label={t('settings.openchamber.visual.section.activityDefaultAria')}
          />
        </SettingsFieldRow>
        <div className={SETTINGS_SPACE_CHECKBOX_CLASS} data-settings-item="chat.reasoning">
          <SettingsCheckboxRow
            checked={showReasoningTraces}
            onChange={setShowReasoningTraces}
            label={t('settings.openchamber.visual.field.showReasoningTraces')}
            ariaLabel={t('settings.openchamber.visual.field.showReasoningTracesAria')}
            settingsItem="chat.reasoning-traces"
          />
          {showReasoningTraces ? (
            <SettingsCheckboxRow
              checked={collapsibleThinkingBlocks}
              onChange={setCollapsibleThinkingBlocks}
              label={t('settings.openchamber.visual.field.collapsibleThinkingBlocks')}
              ariaLabel={t('settings.openchamber.visual.field.collapsibleThinkingBlocksAria')}
              className={NESTED_OPTION_CLASS}
            />
          ) : null}
          {showReasoningTraces && collapsibleThinkingBlocks ? (
            <SettingsCheckboxRow
              checked={expandReasoningWhileStreaming}
              onChange={setExpandReasoningWhileStreaming}
              label={t('settings.openchamber.visual.field.expandReasoningWhileStreaming')}
              ariaLabel={t('settings.openchamber.visual.field.expandReasoningWhileStreamingAria')}
              info={t('settings.openchamber.visual.field.expandReasoningWhileStreamingInfo')}
              className={NESTED_OPTION_CLASS}
            />
          ) : null}
          <SettingsCheckboxRow
            checked={showToolFileIcons}
            onChange={(enabled) => {
              setShowToolFileIcons(enabled);
              void updateDesktopSettings({ showToolFileIcons: enabled });
            }}
            label={t('settings.openchamber.visual.field.showToolFileIcons')}
            ariaLabel={t('settings.openchamber.visual.field.showToolFileIconsAria')}
            settingsItem="chat.tool-file-icons"
          />
          <SettingsCheckboxRow
            checked={showTurnChangedFiles}
            onChange={(enabled) => {
              setShowTurnChangedFiles(enabled);
              void updateDesktopSettings({ showTurnChangedFiles: enabled });
            }}
            label={t('settings.openchamber.visual.field.showTurnChangedFiles')}
            ariaLabel={t('settings.openchamber.visual.field.showTurnChangedFilesAria')}
            settingsItem="chat.changed-files"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.layout.chat.section.reading')}
        settingsItem="chat.message-appearance"
      >
        <SettingsFieldRow
          label={t('settings.openchamber.visual.field.chatWidth')}
          info={t('settings.openchamber.visual.field.chatWidthInfo')}
          settingsItem="chat.width"
        >
          <SettingsChipGroup
            value={chatWidth}
            options={chatWidthOptions}
            onChange={setChatWidth}
            aria-label={t('settings.openchamber.visual.field.chatWidth')}
          />
        </SettingsFieldRow>
        <div className={'space-y-2'}>
          <SettingsCheckboxRow
            checked={streamingAutoFollowEnabled}
            onChange={setStreamingAutoFollowEnabled}
            label={t('settings.openchamber.visual.field.streamingAutoFollow')}
            ariaLabel={t('settings.openchamber.visual.field.streamingAutoFollowAria')}
            info={t('settings.openchamber.visual.field.streamingAutoFollowInfo')}
            settingsItem="chat.streaming-auto-follow"
          />
          <SettingsCheckboxRow
            checked={collapsibleUserMessages}
            onChange={(enabled) => {
              setCollapsibleUserMessages(enabled);
              void updateDesktopSettings({ collapsibleUserMessages: enabled });
            }}
            label={t('settings.openchamber.visual.field.collapsibleUserMessages')}
            ariaLabel={t('settings.openchamber.visual.field.collapsibleUserMessagesAria')}
            settingsItem="chat.collapsible-user-messages"
          />
          <SettingsCheckboxRow
            checked={stickyUserHeader}
            onChange={(enabled) => {
              setStickyUserHeader(enabled);
              void updateDesktopSettings({ stickyUserHeader: enabled });
            }}
            label={t('settings.openchamber.visual.field.stickyUserHeader')}
            ariaLabel={t('settings.openchamber.visual.field.stickyUserHeaderAria')}
            settingsItem="chat.sticky-user-header"
          />
          <SettingsCheckboxRow
            checked={promptNavigatorEnabled}
            onChange={(enabled) => {
              setPromptNavigatorEnabled(enabled);
              void updateDesktopSettings({ promptNavigatorEnabled: enabled });
            }}
            label={t('settings.openchamber.visual.field.promptNavigatorEnabled')}
            ariaLabel={t('settings.openchamber.visual.field.promptNavigatorEnabledAria')}
            settingsItem="chat.prompt-navigator"
          />
          <SettingsCheckboxRow
            checked={showSplitAssistantMessageActions}
            onChange={(enabled) => {
              setShowSplitAssistantMessageActions(enabled);
              void updateDesktopSettings({ showSplitAssistantMessageActions: enabled });
            }}
            label={t('settings.openchamber.visual.field.showSplitAssistantMessageActions')}
            ariaLabel={t('settings.openchamber.visual.field.showSplitAssistantMessageActionsAria')}
            info={t('settings.openchamber.visual.field.showSplitAssistantMessageActionsTooltip')}
            settingsItem="chat.inline-assistant-actions"
          />
          <SelectionApprovalField />
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.layout.chat.section.formatting')} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        <div>
          <SettingsFieldRow label={t('settings.openchamber.visual.section.userMessageRendering')} settingsItem="chat.user-message-rendering">
            <SettingsChipGroup
              value={userMessageRenderingMode === 'markdown' ? 'markdown' : 'plain'}
              options={userMessageOptions}
              onChange={(mode) => {
                setUserMessageRenderingMode(mode);
                void updateDesktopSettings({ userMessageRenderingMode: mode });
              }}
              aria-label={t('settings.openchamber.visual.section.userMessageRenderingAria')}
            />
          </SettingsFieldRow>
          <SettingsFieldRow label={t('settings.openchamber.visual.section.mermaidRendering')} settingsItem="chat.mermaid-rendering">
            <SettingsChipGroup
              value={mermaidRenderingMode}
              options={mermaidOptions}
              onChange={(mode) => {
                setMermaidRenderingMode(mode);
                void updateDesktopSettings({ mermaidRenderingMode: mode });
              }}
              aria-label={t('settings.openchamber.visual.section.mermaidRenderingAria')}
            />
          </SettingsFieldRow>
          <SettingsFieldRow label={t('settings.openchamber.visual.section.diffLayout')} settingsItem="chat.diff-layout">
            <SettingsChipGroup
              value={diffLayoutPreference}
              options={diffLayoutOptions}
              onChange={setDiffLayoutPreference}
              aria-label={t('settings.openchamber.visual.section.diffLayoutAria')}
            />
          </SettingsFieldRow>
        </div>
        <div className={SETTINGS_SPACE_CHECKBOX_CLASS}>
          <SettingsCheckboxRow
            checked={codeBlockLineWrap}
            onChange={setCodeBlockLineWrap}
            label={t('settings.openchamber.visual.field.codeBlockLineWrap')}
            ariaLabel={t('settings.openchamber.visual.field.codeBlockLineWrapAria')}
            settingsItem="chat.code-block-line-wrap"
          />
          <SettingsCheckboxRow
            checked={tableCellWrap}
            onChange={setTableCellWrap}
            label={t('settings.openchamber.visual.field.tableCellWrap')}
            ariaLabel={t('settings.openchamber.visual.field.tableCellWrapAria')}
            info={t('settings.openchamber.visual.field.tableCellWrapInfo')}
            settingsItem="chat.table-cell-wrap"
          />
          <SettingsCheckboxRow
            checked={copyMessagesAsPlainText}
            onChange={setCopyMessagesAsPlainText}
            label={t('settings.openchamber.visual.field.copyMessagesAsPlainText')}
            ariaLabel={t('settings.openchamber.visual.field.copyMessagesAsPlainTextAria')}
            info={t('settings.openchamber.visual.field.copyMessagesAsPlainTextInfo')}
            settingsItem="chat.copy-plain-text"
          />
        </div>
      </SettingsSection>

      {/* Display & Visibility */}
      <SettingsSection
        title={t('settings.chat.section.display.title')}
        description={t('settings.chat.section.display.description')}
        settingsItem="chat.section.display"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {displaySettings.map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
              disabled={ompLoading}
              onChange={(val) => void updateOmpSetting(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Reasoning & Thinking */}
      <SettingsSection
        title={t('settings.chat.section.thinking.title')}
        description={t('settings.chat.section.thinking.description')}
        settingsItem="chat.section.thinking"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {thinkingSettings.map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
              disabled={ompLoading}
              onChange={(val) => void updateOmpSetting(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Image Handling */}
      <SettingsSection
        title={t('settings.chat.section.images.title')}
        description={t('settings.chat.section.images.description')}
        settingsItem="chat.section.images"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {imageSettings.map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
              disabled={ompLoading}
              onChange={(val) => void updateOmpSetting(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      <MessageSearchSettings />
    </>
  );
};

const ComposerTab: React.FC = () => {
  const { form: ompForm, updateSetting: updateOmpSetting, getSectionSettings, loading: ompLoading } = useOmpPageSettings('chat');
  const composerSettings = getSectionSettings('composer');
  const btwSettings = getSectionSettings('btw');
  const { t } = useI18n();
  const { isMobile } = useDeviceInfo();
  const enterToSend = useUIStore((state) => state.enterToSend);
  const setEnterToSend = useUIStore((state) => state.setEnterToSend);
  const enterToSendConfigured = useUIStore((state) => state.enterToSendConfigured);
  const setEnterToSendConfigured = useUIStore((state) => state.setEnterToSendConfigured);
  const mobileReturnKeySends = useUIStore((state) => state.mobileReturnKeySends);
  const setMobileReturnKeySends = useUIStore((state) => state.setMobileReturnKeySends);
  const followUpBehavior = useMessageQueueStore((state) => state.followUpBehavior);
  const setFollowUpBehavior = useMessageQueueStore((state) => state.setFollowUpBehavior);
  const largeTextPasteBehavior = useUIStore((state) => state.largeTextPasteBehavior);
  const setLargeTextPasteBehavior = useUIStore((state) => state.setLargeTextPasteBehavior);
  const allowPromptingSubagentSessions = useUIStore((state) => state.allowPromptingSubagentSessions);
  const setAllowPromptingSubagentSessions = useUIStore((state) => state.setAllowPromptingSubagentSessions);
  const inputSpellcheckEnabled = useUIStore((state) => state.inputSpellcheckEnabled);
  const setInputSpellcheckEnabled = useUIStore((state) => state.setInputSpellcheckEnabled);
  const persistChatDraft = useUIStore((state) => state.persistChatDraft);
  const setPersistChatDraft = useUIStore((state) => state.setPersistChatDraft);
  const inputHistoryScope = useInputHistoryStore((state) => state.scope);
  const inputHistoryLimit = useInputHistoryStore((state) => state.entryLimit);
  const applyInputHistoryScope = useInputHistoryStore((state) => state.applyScope);
  const applyInputHistoryLimit = useInputHistoryStore((state) => state.applyEntryLimit);
  const questionsInChat = useUIStore((state) => state.questionsInChat);
  const setQuestionsInChat = useUIStore((state) => state.setQuestionsInChat);
  const followUpOptions = useChipOptions(FOLLOW_UP_BEHAVIOR_OPTIONS);
  const questionsPlacementOptions = useChipOptions(QUESTIONS_PLACEMENT_OPTIONS);
  const historyScopeOptions = useChipOptions(INPUT_HISTORY_SCOPE_OPTIONS);
  const enterSendSelected = enterToSendConfigured ? enterToSend : !isMobile;

  const handleEnterToSendChange = (enabled: boolean) => {
    setEnterToSend(enabled);
    setEnterToSendConfigured(true);
    void updateDesktopSettings({ enterToSend: enabled, enterToSendConfigured: true });
  };


  const handleInputHistoryLimitChange = (value: number) => {
    const nextLimit = Math.round(value);
    if (!isInputHistoryLimit(nextLimit)) {
      return;
    }
    applyInputHistoryLimit(nextLimit);
    void updateDesktopSettings({ inputHistoryLimit: nextLimit });
  };

  return (
    <>
      <SettingsSection title={t('settings.layout.chat.section.sending')} settingsItem="chat.composer" contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        <div>
          {isMobile ? (
            <SettingsCheckboxRow
              checked={mobileReturnKeySends}
              onChange={(enabled) => {
                setMobileReturnKeySends(enabled);
                void updateDesktopSettings({ mobileReturnKeySends: enabled });
              }}
              label={t('settings.openchamber.visual.field.mobileReturnKeySends')}
              info={t('settings.openchamber.visual.field.mobileReturnKeySendsHint')}
              settingsItem="chat.mobile-return-key-sends"
            />
          ) : (
            <SettingsFieldRow
              label={t('settings.openchamber.visual.field.enterToSend')}
              info={t('settings.openchamber.visual.field.enterToSendHint')}
              settingsItem="chat.enter-to-send"
            >
              <SettingsChipGroup
                value={enterSendSelected ? 'enter' : 'modifier'}
                options={[
                  { value: 'enter', label: t('settings.openchamber.visual.option.enterToSend.enter.label') },
                  { value: 'modifier', label: t('settings.openchamber.visual.option.enterToSend.modifier.label') },
                ]}
                onChange={(value) => handleEnterToSendChange(value === 'enter')}
                aria-label={t('settings.openchamber.visual.field.enterToSend')}
              />
            </SettingsFieldRow>
          )}
          <SettingsFieldRow
            label={t('settings.openchamber.visual.section.followUpBehavior')}
            settingsItem="chat.follow-up-behavior"
          >
            <SettingsChipGroup
              value={followUpBehavior}
              options={followUpOptions}
              onChange={setFollowUpBehavior}
              aria-label={t('settings.openchamber.visual.section.followUpBehaviorAria')}
            />
          </SettingsFieldRow>
          <SettingsFieldRow
            label={t('settings.openchamber.visual.field.questionsPlacement')}
            info={t('settings.openchamber.visual.field.questionsPlacementInfo')}
            settingsItem="chat.questions-placement"
          >
            <SettingsChipGroup
              value={questionsInChat ? 'chat' : 'popup'}
              options={questionsPlacementOptions}
              onChange={(value) => setQuestionsInChat(value === 'chat')}
              aria-label={t('settings.openchamber.visual.field.questionsPlacement')}
            />
          </SettingsFieldRow>
        </div>
        <SettingsControlGroup
          title={t('settings.openchamber.visual.field.largeTextPaste')}
          info={t('settings.openchamber.visual.field.largeTextPasteHint')}
          settingsItem="chat.large-text-paste"
        >
          <SettingsRadioGroup aria-label={t('settings.openchamber.visual.field.largeTextPasteAria')}>
            {LARGE_TEXT_PASTE_BEHAVIOR_OPTIONS.map((option) => (
              <SettingsRadioOption
                key={option.id}
                selected={largeTextPasteBehavior === option.id}
                onSelect={() => setLargeTextPasteBehavior(option.id)}
                label={t(option.labelKey)}
                ariaLabel={t('settings.openchamber.visual.field.largeTextPasteOptionAria', { option: t(option.labelKey) })}
              />
            ))}
          </SettingsRadioGroup>
        </SettingsControlGroup>
        <div className={SETTINGS_SPACE_CHECKBOX_CLASS}>
          <SettingsCheckboxRow
            checked={allowPromptingSubagentSessions}
            onChange={setAllowPromptingSubagentSessions}
            label={t('settings.openchamber.visual.field.allowPromptingSubagentSessions')}
            ariaLabel={t('settings.openchamber.visual.field.allowPromptingSubagentSessionsAria')}
            settingsItem="chat.subagent-read-only-banner"
          />
        </div>
      </SettingsSection>

      {composerSettings.length > 0 || btwSettings.length > 0 ? (
        <SettingsSection
          title={t('settings.chat.section.composerKeywords.title')}
          description={t('settings.chat.section.composerKeywords.description')}
          settingsItem="chat.composer-keywords"
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            {[...composerSettings, ...btwSettings].map((s) => (
              <OmpRowControl
                key={s.id}
                setting={s}
                value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
                disabled={ompLoading}
                onChange={(val) => void updateOmpSetting(s.id, val)}
              />
            ))}
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('settings.layout.chat.section.draftsAndHistory')} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        <div className={SETTINGS_SPACE_CHECKBOX_CLASS}>
          <SettingsCheckboxRow
            checked={persistChatDraft}
            onChange={(enabled) => {
              setPersistChatDraft(enabled);
              void updateDesktopSettings({ persistChatDraft: enabled });
            }}
            label={t('settings.openchamber.visual.field.persistDraftMessages')}
            ariaLabel={t('settings.openchamber.visual.field.persistDraftMessagesAria')}
            settingsItem="chat.persist-drafts"
          />
          {isMobile ? null : (
            <SettingsCheckboxRow
              checked={inputSpellcheckEnabled}
              onChange={(enabled) => {
                setInputSpellcheckEnabled(enabled);
                void updateDesktopSettings({ inputSpellcheckEnabled: enabled });
              }}
              label={t('settings.openchamber.visual.field.enableSpellcheckInTextInputs')}
              ariaLabel={t('settings.openchamber.visual.field.enableSpellcheckInTextInputsAria')}
              settingsItem="chat.spellcheck"
            />
          )}
        </div>
        <div>
          <SettingsFieldRow
            label={t('settings.openchamber.visual.field.inputHistoryScope')}
            info={t('settings.openchamber.visual.field.inputHistoryScopeDescription')}
            settingsItem="chat.input-history-scope"
          >
            <SettingsChipGroup
              value={inputHistoryScope}
              options={historyScopeOptions}
              onChange={(scope) => {
                applyInputHistoryScope(scope);
                void updateDesktopSettings({ inputHistoryScope: scope });
              }}
              aria-label={t('settings.openchamber.visual.section.inputHistoryScopeAria')}
            />
          </SettingsFieldRow>
          <SettingsFieldRow
            label={t('settings.openchamber.visual.field.inputHistoryLimit')}
            description={t('settings.openchamber.visual.field.inputHistoryLimitDescription')}
            settingsItem="chat.input-history-limit"
          >
            <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
              <NumberInput
                value={inputHistoryLimit}
                onValueChange={handleInputHistoryLimitChange}
                min={MIN_INPUT_HISTORY_LIMIT}
                max={MAX_INPUT_HISTORY_LIMIT}
                step={1}
                className={SETTINGS_WIDTH_NUMBER_CLASS}
                deferExternalValueWhileFocused
                aria-label={t('settings.openchamber.visual.field.inputHistoryLimitAria')}
              />
              <span className={SETTINGS_NUMBER_UNIT_CLASS}>
                {t('settings.openchamber.visual.field.inputHistoryLimitUnit')}
              </span>
            </div>
          </SettingsFieldRow>
        </div>
      </SettingsSection>
    </>
  );
};

const AssistanceTab: React.FC = () => {
  const { t } = useI18n();
  const draftStartersVisible = useUIStore((state) => state.draftStartersVisible);
  const setDraftStartersVisible = useUIStore((state) => state.setDraftStartersVisible);
  const sessionRecapEnabled = useUIStore((state) => state.sessionRecapEnabled);
  const setSessionRecapEnabled = useUIStore((state) => state.setSessionRecapEnabled);
  const settingsDirectory = useSettingsDirectory();
  const [ompState, setOmpState] = React.useState<OmpSettingsState | null>(null);
  const ompStateRef = React.useRef<OmpSettingsState | null>(null);
  ompStateRef.current = ompState;

  React.useEffect(() => {
    let active = true;
    const abort = new AbortController();
    void (async () => {
      try {
        if (!settingsDirectory) return;
        const workspace = await canonicalClient.resolveWorkspace(settingsDirectory, { signal: abort.signal });
        const snapshot = await canonicalClient.getOmpSettings(workspace.workspaceId, abort.signal);
        if (!active || abort.signal.aborted) return;
        setOmpState(snapshot);
        const recapSetting = snapshot.settings.find((s) => s.id === 'recap.enabled');
        if (typeof recapSetting?.value === 'boolean') {
          setSessionRecapEnabled(recapSetting.value);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
      abort.abort();
    };
  }, [settingsDirectory, setSessionRecapEnabled]);

  const recapIdleSeconds = React.useMemo(() => {
    const raw = ompState?.settings.find((s) => s.id === 'recap.idleSeconds')?.value;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 240;
  }, [ompState]);

  const handleSessionRecapChange = React.useCallback(async (enabled: boolean) => {
    const current = ompStateRef.current;
    if (!current) return;
    const previous = current.settings.find((s) => s.id === 'recap.enabled')?.value === true;
    setSessionRecapEnabled(enabled);
    try {
      const next = await canonicalClient.updateOmpSettings(current.workspaceId, {
        expectedRevision: current.revision,
        changes: [{ id: 'recap.enabled', value: enabled }],
      });
      setOmpState(next);
      void updateDesktopSettings({ sessionRecapEnabled: enabled });
    } catch (error) {
      if (error instanceof CanonicalApiError && error.problem.status === 409) {
        try {
          const latest = await canonicalClient.getOmpSettings(current.workspaceId);
          const next = await canonicalClient.updateOmpSettings(latest.workspaceId, {
            expectedRevision: latest.revision,
            changes: [{ id: 'recap.enabled', value: enabled }],
          });
          setOmpState(next);
          void updateDesktopSettings({ sessionRecapEnabled: enabled });
          return;
        } catch {
          // fall through to rollback
        }
      }
      setSessionRecapEnabled(previous);
      void updateDesktopSettings({ sessionRecapEnabled: previous });
    }
  }, [setSessionRecapEnabled]);

  const handleRecapIdleSecondsChange = React.useCallback(async (value: number) => {
    const current = ompStateRef.current;
    if (!current) return;
    const seconds = Number(value);
    try {
      const next = await canonicalClient.updateOmpSettings(current.workspaceId, {
        expectedRevision: current.revision,
        changes: [{ id: 'recap.idleSeconds', value: seconds }],
      });
      setOmpState(next);
    } catch (error) {
      if (error instanceof CanonicalApiError && error.problem.status === 409) {
        try {
          const latest = await canonicalClient.getOmpSettings(current.workspaceId);
          const next = await canonicalClient.updateOmpSettings(latest.workspaceId, {
            expectedRevision: latest.revision,
            changes: [{ id: 'recap.idleSeconds', value: seconds }],
          });
          setOmpState(next);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const suggestionGenerator = useUIStore((state) => state.suggestionGenerator);
  const setSuggestionGenerator = useUIStore((state) => state.setSuggestionGenerator);

  const suggestionGeneratorOptions = React.useMemo<Array<{ value: 'session' | 'small' | 'off'; label: string }>>(
    () => [
      { value: 'session', label: t('settings.openchamber.visual.option.suggestionGenerator.session') },
      { value: 'small', label: t('settings.openchamber.visual.option.suggestionGenerator.small') },
      { value: 'off', label: t('settings.openchamber.visual.option.suggestionGenerator.off') },
    ],
    [t],
  );

  const handleSuggestionGeneratorChange = React.useCallback(
    async (value: 'session' | 'small' | 'off') => {
      const previous = suggestionGenerator;
      setSuggestionGenerator(value);
      try {
        if (settingsDirectory) {
          const workspace = await canonicalClient.resolveWorkspace(settingsDirectory);
          const omp = await canonicalClient.getOmpSettings(workspace.workspaceId);
          await canonicalClient.updateOmpSettings(omp.workspaceId, {
            expectedRevision: omp.revision,
            changes: [{ id: 'suggestion.generator', value }],
          });
        }
        await updateDesktopSettings({ suggestionGenerator: value });
      } catch (error) {
        setSuggestionGenerator(previous);
        toast.error(error instanceof Error ? error.message : 'Failed to save suggestion generator setting');
      }
    },
    [suggestionGenerator, setSuggestionGenerator, settingsDirectory],
  );
  const sessionReviewOfferEnabled = useUIStore((state) => state.sessionReviewOfferEnabled);
  const setSessionReviewOfferEnabled = useUIStore((state) => state.setSessionReviewOfferEnabled);
  const jevAvailable = useRoutingStore(selectSafetyNetAvailable);

  return (
    <>
      <SettingsSection
        title={t('settings.openchamber.visual.section.sessionAssistance')}
        settingsItem="chat.session-assistance"
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <SettingsCheckboxRow
          checked={draftStartersVisible}
          onChange={(enabled) => {
            setDraftStartersVisible(enabled);
            void updateDesktopSettings({ draftStartersVisible: enabled });
          }}
          label={t('settings.openchamber.visual.field.draftStartersVisible')}
          ariaLabel={t('settings.openchamber.visual.field.draftStartersVisibleAria')}
          settingsItem="chat.draft-starters-visible"
        />
        <SettingsCheckboxRow
          checked={sessionRecapEnabled}
          onChange={handleSessionRecapChange}
          label={t('settings.openchamber.visual.field.sessionRecap')}
          ariaLabel={t('settings.openchamber.visual.field.sessionRecapAria')}
          settingsItem="chat.session-recap"
        />
        {sessionRecapEnabled ? (
          <div className="ps-6 pb-1">
            <SettingsFieldRow
              label={t('settings.openchamber.visual.field.sessionRecapIdleSeconds')}
              settingsItem="chat.session-recap.idle-seconds"
              info={t('settings.openchamber.visual.field.sessionRecapIdleSecondsInfo')}
            >
              <Select
                value={String(recapIdleSeconds)}
                onValueChange={(val) => {
                  const num = Number(val);
                  if (Number.isFinite(num)) void handleRecapIdleSecondsChange(num);
                }}
              >
                <SelectTrigger
                  className={SETTINGS_WIDTH_SELECT_CLASS}
                  aria-label={t('settings.openchamber.visual.field.sessionRecapIdleSecondsAria')}
                >
                  <SelectValue>
                    {(val) => t('settings.openchamber.visual.field.sessionRecapIdleSecondsOption', { count: Number(val) || 240 })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[60, 120, 240, 300, 600].map((seconds) => (
                    <SelectItem key={seconds} value={String(seconds)}>
                      {t('settings.openchamber.visual.field.sessionRecapIdleSecondsOption', { count: seconds })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsFieldRow>
          </div>
        ) : null}
        <SettingsFieldRow
          label={t('settings.openchamber.visual.field.suggestionGenerator')}
          info={t('settings.openchamber.visual.field.suggestionGeneratorHint')}
          settingsItem="chat.suggestion-generator"
        >
          <SettingsChipGroup
            value={suggestionGenerator}
            options={suggestionGeneratorOptions}
            onChange={handleSuggestionGeneratorChange}
            aria-label={t('settings.openchamber.visual.field.suggestionGeneratorAria')}
          />
        </SettingsFieldRow>
        <SettingsCheckboxRow
          checked={jevAvailable && sessionReviewOfferEnabled}
          onChange={setSessionReviewOfferEnabled}
          disabled={!jevAvailable}
          label={t('settings.openchamber.visual.field.sessionReviewOffer')}
          ariaLabel={t('settings.openchamber.visual.field.sessionReviewOffer')}
          info={t('settings.openchamber.visual.field.sessionReviewOfferInfo')}
          footer={<JevAccessNote />}
          settingsItem="chat.session-review-offer"
        />
      </SettingsSection >

    </>
  );
};

export const ChatSettings: React.FC = () => {
  const { t } = useI18n();
  const tab = useChatSettingsTabStore((state) => state.tab);
  const setTab = useChatSettingsTabStore((state) => state.setTab);
  const tabs = React.useMemo<Array<SortableTabsStripItem & { id: ChatSettingsTab }>>(() => (
    (['messages', 'composer', 'assistance'] as const).map((id) => ({
      id,
      label: t(`settings.layout.chat.tab.${id}`),
      accessory: <SettingsNewBadge items={chatSettingsTabAnchors(id)} />,
    }))
  ), [t]);

  return (
    <>
      <div className="mb-8 flex min-w-0">
        <SortableTabsStrip
          items={tabs}
          activeId={tab}
          onSelect={(id) => {
            const next = tabs.find((item) => item.id === id);
            if (next) setTab(next.id);
          }}
          layoutMode="scrollable"
          intrinsicWidth
          variant="active-pill"
          pillSize="toolbar"
          className="flex-none max-w-full"
        />
      </div>
      {tab === 'messages' ? <MessagesTab /> : null}
      {tab === 'composer' ? <ComposerTab /> : null}
      {tab === 'assistance' ? <AssistanceTab /> : null}
    </>
  );
};
