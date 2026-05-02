import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationOutputChannel } from "../../shared/workspace/appPrefs.js";

export interface AutomationNotificationContext {
  automationId: string;
  automationName: string;
  runId: string;
  outputChannel: AutomationOutputChannel;
  sendMessage: (message: string) => Promise<void>;
}

const notificationContext = new AsyncLocalStorage<AutomationNotificationContext>();

export const runWithAutomationNotificationContext = <T>(
  context: AutomationNotificationContext,
  callback: () => Promise<T>,
): Promise<T> => notificationContext.run(context, callback);

export const getAutomationNotificationContext = (): AutomationNotificationContext | undefined =>
  notificationContext.getStore();
