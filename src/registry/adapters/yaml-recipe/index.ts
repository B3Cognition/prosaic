import { TargetDescriptor } from '../../descriptor';
import { adapter } from '../build';

/**
 * YAML recipe-format cluster (T-046). Targets whose contract requires YAML
 * serialization (e.g. Goose recipes). The canonical YAML wrapper keeps key
 * ordering and quoting deterministic (NFR-009). The body maps into `instructions`.
 */
export const yamlRecipeCluster: TargetDescriptor[] = [
  adapter({
    id: 'goose',
    label: 'Goose',
    dir: '.goose/recipes',
    format: 'yaml',
    extension: '.yaml',
    bodyField: 'instructions',
    argumentToken: '{{args}}',
    caps: { rule: true, command: true },
    inject: { version: '1.0.0' },
  }),
];
