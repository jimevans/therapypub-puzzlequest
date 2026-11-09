// TEMPORARY, to be removed before merging: the stress run with Firefox's
// service workers off, as a control.
import { config as base } from "../wdio.conf.js";

export const config: WebdriverIO.Config = {
  ...base,
  capabilities: (base.capabilities as WebdriverIO.Capabilities[]).map(
    (capability) => ({
      ...capability,
      "moz:firefoxOptions": {
        ...capability["moz:firefoxOptions"],
        prefs: {
          ...capability["moz:firefoxOptions"]?.prefs,
          "dom.serviceWorkers.enabled": false,
        },
      },
    })
  ),
};
