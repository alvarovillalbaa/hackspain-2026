export type SlackSource = "env" | "settings";

export type SlackStatus = {
  connected: boolean;
  source: SlackSource | null;
};
