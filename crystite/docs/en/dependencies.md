# Dependencies

## Overview

Mods can declare dependencies on other mods in `crystite.mod.json`.

## Declaring Dependencies

```json
{
    "id": "my-mod",
    "version": "1.0.0",
    "depends": {
        "core-library": "1.0.0",
        "another-mod": "2.0.0"
    }
}
```

## How It Works

1. All mods are discovered from `mods/` folder
2. Dependencies are analyzed via DependencyResolver
3. Mods are sorted using topological sort
4. Circular dependencies cause errors
5. Missing dependencies are logged

## Suggested Mods

```json
{
    "depends": {},
    "suggests": {
        "optional-addon": "1.0.0"
    }
}
```

## Version Matching

Currently version matching is exact. Future versions will support semver ranges.
