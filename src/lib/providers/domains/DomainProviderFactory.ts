import { DomainProvider } from "./DomainProvider";
import { NameSiloProvider } from "./NameSiloProvider";

let instance: DomainProvider | null = null;

/**
 * Returns the active domain provider. NameSilo is the default and only
 * implementation today; to add another registrar later, implement
 * DomainProvider and switch on a SystemSetting/env var here without
 * touching any calling code.
 */
export function getDomainProvider(): DomainProvider {
  if (!instance) {
    instance = new NameSiloProvider();
  }
  return instance;
}
