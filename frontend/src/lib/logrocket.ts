import { ENABLE_LOGROCKET, LOGROCKET_APP_ID } from "../config/runtime";

type LogRocketModule = typeof import("logrocket");

let didInitLogRocket = false;
let logRocketModulePromise: Promise<LogRocketModule | null> | null = null;

const shouldEnableLogRocket = (): boolean =>
  ENABLE_LOGROCKET && LOGROCKET_APP_ID.length > 0;

const loadLogRocket = async (): Promise<LogRocketModule | null> => {
  if (!shouldEnableLogRocket()) {
    return null;
  }

  if (!logRocketModulePromise) {
    logRocketModulePromise = import("logrocket")
      .then((LogRocket) => {
        if (!didInitLogRocket) {
          LogRocket.default.init(LOGROCKET_APP_ID);
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
