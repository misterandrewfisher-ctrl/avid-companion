import { useEffect, useState } from "react";
import { checkForUpdates, type UpdateStatus } from "../lib/updater";

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ type: "idle" });

  useEffect(() => {
    void checkForUpdates(setStatus);
  }, []);

  return { status, recheck: () => checkForUpdates(setStatus) };
}
