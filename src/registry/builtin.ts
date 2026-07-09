import { Registry, RegistrySource } from './registry';
import { RegistryVersion, REGISTRY_VERSION } from './version';
import { TargetDescriptor } from './descriptor';
import { ALL_DESCRIPTORS } from './adapters';

/** The built-in registry source backed by the bundled adapter descriptors. */
export class BuiltinRegistrySource implements RegistrySource {
  descriptors(): TargetDescriptor[] {
    return ALL_DESCRIPTORS;
  }
  version(): RegistryVersion {
    return REGISTRY_VERSION;
  }
}

/** Construct the default registry over the built-in descriptor set. */
export function builtinRegistry(): Registry {
  return new Registry(new BuiltinRegistrySource());
}
