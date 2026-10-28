import { useState } from 'react';
import { BasicPage, FormRow, NotUsingAlert } from './common';
import { SecretTextInput } from '@/components/secretTextInput';
import { TextInput } from '@/components/textInput';
import { config, updateConfig } from '@/utils/config';

export function ClaudeSettingsPage({ setSettingsUpdated }: { setSettingsUpdated: (updated: boolean) => void }) {
  const [key, setKey] = useState(() => typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem('amica_claude_key') || '');
  const [model, setModel] = useState(config('claude_model'));
  return <BasicPage title="Claude Settings" description={<>Connect directly to Anthropic. Your key stays in this browser tab session and is sent through this local server to Anthropic when you chat. Claude provides text; select a separate voice engine under Text-to-Speech.</>}>
    {config('chatbot_backend') !== 'claude' && <NotUsingAlert>Select Claude under Chatbot Backend to use these settings.</NotUsingAlert>}
    <div className="max-w-lg space-y-6 py-4">
      <FormRow label="Anthropic API Key"><SecretTextInput value={key} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
        setKey(event.target.value);
        sessionStorage.setItem('amica_claude_key', event.target.value);
      }} /></FormRow>
      <FormRow label="Claude Model ID"><TextInput value={model} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
        setModel(event.target.value);
        updateConfig('claude_model', event.target.value);
        setSettingsUpdated(true);
      }} /></FormRow>
      <p className="text-sm text-gray-600">Use a model available to your Anthropic API account. The key is retained across reloads in this tab; closing the tab clears its session storage.</p>
    </div>
  </BasicPage>;
}
