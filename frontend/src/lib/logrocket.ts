import { config } from "../config/config";

type LogRocketModule = typeof import("logrocket");

let didInitLogRocket = false;
let logRocketModulePromise: Promise<LogRocketModule | null> | null = null;

const shouldEnableLogRocket = (): boolean =>
  config.observability.logrocket.enabled &&
  config.observability.logrocket.appId.length > 0;

const loadLogRocket = async (): Promise<LogRocketModule | null> => {
  if (!shouldEnableLogRocket()) {
    return null;
  }

  if (!logRocketModulePromise) {
    logRocketModulePromise = import("logrocket")
      .then((LogRocket) => {
        if (!didInitLogRocket) {
          LogRocket.default.init(config.observability.logrocket.appId);
          didInitLogRocket = true;
        }

        return LogRocket;
      })
      .catch((error) => {
        console.error("Failed to initialize LogRocket", error);
        logRocketModulePromise = null;
        return null;
      });
  }

  return logRocketModulePromise;
};

export const initializeLogRocket = (): void => {
  void loadLogRocket();
};
