# Mixin Guide

## What are Mixins?

Mixins inject code into Minecraft's existing classes at runtime using bytecode transformation. Crystite uses SpongePowered Mixin.

## Mixin Configuration

Create `src/main/resources/example-mod.mixin.json`:

```json
{
    "required": true,
    "package": "com.example.mixin",
    "compatibilityLevel": "JAVA_17",
    "mixins": ["ExampleMixin"],
    "client": [],
    "server": []
}
```

Register in `crystite.mod.json`:
```json
{
    "id": "example-mod",
    "mixins": ["example-mod.mixin.json"]
}
```

## Creating a Mixin

```java
package com.example.mixin;

import net.minecraft.server.MinecraftServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MinecraftServer.class)
public class ExampleMixin {

    @Inject(at = @At("HEAD"), method = "runServer")
    private void onRunServer(CallbackInfo info) {
        System.out.println("Mixin: MinecraftServer.runServer() called!");
    }
}
```

## Annotations

| Annotation | Purpose |
|------------|---------|
| `@Inject` | Inject code at a specific point |
| `@Overwrite` | Completely replace a method |
| `@Redirect` | Redirect a method call |
| `@Accessor` | Access private fields |
| `@ModifyArg` | Modify a method argument |
| `@ModifyVariable` | Modify a local variable |
| `@Shadow` | Access private fields/methods |
| `@Final` | Mark a shadowed field as final |

## @Inject Examples

```java
// Inject at method return
@Inject(at = @At("RETURN"), method = "tick")

// Inject at a specific instruction
@Inject(at = @At(value = "INVOKE", target = "net/minecraft/..."), method = "run")

// Inject with cancellable
@Inject(at = @At("HEAD"), method = "someMethod", cancellable = true)
```

## @Accessor Example

```java
@Mixin(MinecraftServer.class)
public interface ServerAccessor {

    @Accessor("tickCount")
    int getTickCount();
}
```

## Debugging

```bash
-Dmixin.debug=true -Dmixin.dumpTargetOnFailure=true
```
