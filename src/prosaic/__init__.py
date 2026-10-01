"""Canonical prose inspection and distribution, implemented in Python."""
from .core import ArtifactNotFoundError, ParseError, discover, inspect_artifact, parse_artifact
from .config import ConfigError, resolve_config
from .registry import (Registry, StaticRegistrySource, BuiltinRegistrySource, CatalogRegistrySource,
                       UnknownTargetError, REGISTRY_VERSION, builtin_registry, get_target,
                       parse_descriptor, validate_descriptor, register_target, runtime_capability_for)
from .pipeline import run_pipeline, PIPELINE_STAGES, resolve_execution, LossyTransformError

from .tools import discover_tools

__version__ = '0.3.0'


def apply(*args, **kwargs):
    from .lifecycle import apply as operation
    return operation(*args, **kwargs)


def revert(*args, **kwargs):
    from .lifecycle import revert as operation
    return operation(*args, **kwargs)


def resolve_execution_data(*args, **kwargs):
    from .pipeline import resolve_execution_data as operation
    return operation(*args, **kwargs)


def deploy_package(*args, **kwargs):
    from .packages import deploy_package as operation
    return operation(*args, **kwargs)


def revert_package(*args, **kwargs):
    from .packages import revert_package as operation
    return operation(*args, **kwargs)
