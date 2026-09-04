import { AIProvider } from "./AIProvider";
import { AnthropicAIProvider } from "./AnthropicAIProvider";

let instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!instance) {
    instance = new AnthropicAIProvider();
  }
  return instance;
}
