import type { AutomationService } from "./automation.service.js";

let automationService: AutomationService | null = null;

export const registerAutomationService = (service: AutomationService): void => {
  automationService = service;
};

export const getAutomationService = (): AutomationService => {
  if (!automationService) {
    throw new Error("Automation service is not initialized");
  }

  return automationService;
};
