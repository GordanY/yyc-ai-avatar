import dynamic from "next/dynamic";
import { useState } from "react";

// Microphone capture requires browser APIs.
const DynamicMessageInput = dynamic(() =>
  import("@/components/messageInput"), {
    ssr: false
  }
);

/**
 * Provides text input and voice input
 *
 * Keeps the draft until it is sent, including when a response is stopped.
 */
export const MessageInputContainer = ({
  isChatProcessing,
  isVoiceActive,
}: {
  isChatProcessing: boolean;
  isVoiceActive: boolean;
}) => {
  const [userMessage, setUserMessage] = useState("");

  return (
    <DynamicMessageInput
      userMessage={userMessage}
      setUserMessage={setUserMessage}
      isChatProcessing={isChatProcessing}
      isVoiceActive={isVoiceActive}
      onChangeUserMessage={(e) => setUserMessage(e.target.value)}
    />
  );
};
