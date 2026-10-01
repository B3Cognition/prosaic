"""Strict configuration and file/CLI precedence, matching Prosaic 0.1."""
from __future__ import annotations

import os
from pathlib import Path

from .compat import js_string, load_yaml, yaml_error_message

ARTIFACT_TYPES = ['rule', 'skill', 'subagent', 'command']
CONFIG_FILENAMES = ['prosaic.config.yaml', 'prosaic.config.yml', '.prosaic.yaml']


class ConfigError(ValueError):
    pass


def _type_name(value):
    if isinstance(value, float):
        import math
        if math.isnan(value):
            return 'nan'
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, str):
        return 'string'
    if isinstance(value, (int, float)):
        return 'number'
    if isinstance(value, list):
        return 'array'
    return 'object'


def parse_config(raw, label):
    issues = []
    unknown = []
    if not isinstance(raw, dict):
        issues.append(f'(root): Expected object, received {_type_name(raw)}')
    else:
        allowed = {'source', 'targets', 'artifactTypes', 'lossyPolicy', 'backupRetention', 'packages'}
        if 'source' in raw:
            value = raw['source']
            if not isinstance(value, str):
                issues.append(f'source: Expected string, received {_type_name(value)}')
            elif not value:
                issues.append('source: String must contain at least 1 character(s)')
        if 'targets' in raw:
            value = raw['targets']
            if value != 'all' and not isinstance(value, list):
                issues.append('targets: Invalid input')
            elif isinstance(value, list):
                for index, target in enumerate(value):
                    if not isinstance(target, str):
                        issues.append('targets: Invalid input')
                        break
                    if not target:
                        issues.append(f'targets.{index}: String must contain at least 1 character(s)')
        if 'artifactTypes' in raw:
            value = raw['artifactTypes']
            if not isinstance(value, list):
                issues.append(f'artifactTypes: Expected array, received {_type_name(value)}')
            else:
                for index, kind in enumerate(value):
                    if kind not in ARTIFACT_TYPES:
                        reason = f"Invalid enum value. Expected 'rule' | 'skill' | 'subagent' | 'command', received '{kind}'" if isinstance(kind, str) else f"Expected 'rule' | 'skill' | 'subagent' | 'command', received {_type_name(kind)}"
                        issues.append(f'artifactTypes.{index}: {reason}')
        if 'lossyPolicy' in raw and raw['lossyPolicy'] not in ('warn', 'error'):
            value = raw['lossyPolicy']
            reason = f"Invalid enum value. Expected 'warn' | 'error', received '{value}'" if isinstance(value, str) else f"Expected 'warn' | 'error', received {_type_name(value)}"
            issues.append(f'lossyPolicy: {reason}')
        if 'backupRetention' in raw:
            value = raw['backupRetention']
            if type(value) not in (int, float):
                issues.append(f'backupRetention: Expected number, received {_type_name(value)}')
            elif isinstance(value, float) and not value.is_integer():
                issues.append('backupRetention: Expected integer, received float')
            elif value < 0:
                issues.append('backupRetention: Number must be greater than or equal to 0')
        if 'packages' in raw:
            packages = raw['packages']
            if not isinstance(packages, list):
                issues.append(f'packages: Expected array, received {_type_name(packages)}')
            else:
                seen = set()
                for index, package in enumerate(packages):
                    if not isinstance(package, dict):
                        issues.append(f'packages.{index}: Expected object, received {_type_name(package)}')
                        continue
                    unknown += [key for key in package if key not in {'id', 'sourceRoot', 'destinationRoot'}]
                    for field in ['id', 'sourceRoot', 'destinationRoot']:
                        if field not in package:
                            issues.append(f'packages.{index}.{field}: Required')
                        elif not isinstance(package[field], str):
                            issues.append(f'packages.{index}.{field}: Expected string, received {_type_name(package[field])}')
                        elif not package[field]:
                            issues.append(f'packages.{index}.{field}: String must contain at least 1 character(s)')
                    identifier = package.get('id')
                    if isinstance(identifier, str):
                        if identifier in seen:
                            issues.append(f'packages.{index}.id: duplicate package id: "{identifier}"')
                        seen.add(identifier)
        unknown += [key for key in raw if key not in allowed]
    if unknown or issues:
        parts = ([f"unknown key(s): {', '.join(unknown)}"] if unknown else []) + (['; '.join(issues)] if issues else [])
        raise ConfigError(f"Rejected configuration from {label}: {'; '.join(parts)}")
    return raw


def load_config_file(directory):
    for name in CONFIG_FILENAMES:
        path = Path(directory) / name
        if not path.exists():
            continue
        try:
            raw = path.read_bytes().decode('utf-8', errors='replace')
        except OSError as error:
            from .filesystem import node_os_error
            raise ConfigError(node_os_error(error, 'read' if error.errno == 21 else 'open', path if error.errno != 21 else None)) from error
        try:
            loaded = load_yaml(raw)
        except Exception as error:
            raise ConfigError(f'Configuration {path} is not valid YAML: {yaml_error_message(error, raw)}') from error
        return {'label': str(path), 'config': parse_config({} if loaded is None else loaded, str(path))}
    return None


def resolve_config(project_root, cli=None, global_dir=None):
    root = Path(os.path.abspath(project_root))
    sources = []
    if global_dir:
        source = load_config_file(global_dir)
        if source:
            sources.append(source)
    for directory in [*reversed(root.parents), root]:
        source = load_config_file(directory)
        if source:
            sources.append(source)
    merged = {}
    for source in sources:
        merged.update(source['config'])
    cli = cli or {}
    for key in ['source', 'targets', 'artifactTypes', 'lossyPolicy']:
        if key not in cli:
            continue
        value = cli[key]
        if key == 'targets' and value == ['all']:
            value = 'all'
        if key == 'artifactTypes':
            for kind in value:
                if kind not in ARTIFACT_TYPES:
                    raise ValueError(f'unknown artifact type "{kind}"')
        merged[key] = value
    defaults = {'source': '.prosaic', 'targets': 'all', 'artifactTypes': ARTIFACT_TYPES.copy(),
                'lossyPolicy': 'warn', 'backupRetention': 3, 'packages': []}
    defaults.update(merged)
    defaults['backupRetention'] = int(defaults['backupRetention'])
    return defaults
