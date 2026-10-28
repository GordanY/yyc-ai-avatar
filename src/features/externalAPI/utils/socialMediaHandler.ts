import { sendToClients } from "./apiHelper";

export const handleSocialMediaActions = async (
  message: string,
  socialMedia: string
): Promise<any> => {
  switch (socialMedia) {
    case "twitter":
      return await (await import("../socialMedia/twitterClient")).twitterClientInstance.postTweet(message);
    case "tg":
      return await (await import("../socialMedia/telegramClient")).telegramClientInstance.postMessage(message);
    case "none":
      sendToClients({ type: "normal", data: message });
      return "Broadcasted to clients";
    default:
      throw new Error("No action taken for social media.");
  }
};
