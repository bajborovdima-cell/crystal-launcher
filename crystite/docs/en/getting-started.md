# Crystite Mod Loader Documentation

## Getting Started

### What is Crystite?

Crystite is a mod loader for Minecraft: Java Edition. It allows you to load mods that modify the game using:
- **Mixin** — bytecode transformation to modify Minecraft classes at runtime
- **Event System** — subscribe to game events (server start, tick, etc.)
- **Registry API** — register blocks, items, and other content
- **Configuration API** — save and load mod settings

### Installation

1. **Download Crystite** — build from source or download the latest release
2. **Create a `mods/` folder** in your Minecraft directory
3. **Launch with Crystite:**
   ```bash
   java -javaagent:crystite-loader.jar -jar minecraft-server.jar
   ```
   Or for the client:
   ```bash
   java -javaagent:crystite-loader.jar -cp minecraft-client.jar net.minecraft.client.main.Main
   ```

### Verifying Installation

When Crystite loads successfully, you will see:
```
Crystite Mod Loader 1.0.0 initializing...
Crystite Mod Loader initialized with 0 mod(s)
```

### Creating a Mods Folder

Place your `.jar` mod files in the `mods/` directory next to your Minecraft jar.

---

## Your First Mod

### Prerequisites

- Java 17+ (Java 25+ for Minecraft 26.1.2)
- Gradle or Maven
- Basic knowledge of Java

### Project Setup

Create a new Gradle project:

**build.gradle.kts:**
```kotlin
plugins {
    id("java")
}

repositories {
    mavenCentral()
    maven("https://maven.fabricmc.net")
}

dependencies {
    implementation("io.github.crystite:crystite-api:1.0.0")
}
```

### Create `crystite.mod.json`

Place this file in `src/main/resources/`:

```json
{
    "id": "example-mod",
    "version": "1.0.0",
    "name": "Example Mod",
    "description": "My first Crystite mod",
    "authors": ["YourName"],
    "entrypoints": {
        "main": "com.example.ExampleMod"
    },
    "license": "MIT"
}
```

### Create the Mod Class

```java
package com.example;

import io.github.crystite.api.Entrypoint;
import io.github.crystite.api.ModInitializer;
import io.github.crystite.event.EventBus;
import io.github.crystite.event.ServerStartingEvent;
import io.github.crystite.event.Subscribe;

@Entrypoint
public class ExampleMod implements ModInitializer {

    @Override
    public void onInitialize(EventBus eventBus) {
        System.out.println("Hello from Example Mod!");
        eventBus.register(this);
    }

    @Subscribe
    public void onServerStart(ServerStartingEvent event) {
        System.out.println("Server is starting! - Example Mod");
    }
}
```

### Building Your Mod

```bash
./gradlew build
```

Your mod will be in `build/libs/example-mod-1.0.0.jar`. Place it in the `mods/` folder.

### Testing Your Mod

Start Minecraft with Crystite and check the console for:
```
Hello from Example Mod!
Server is starting! - Example Mod
```

---

## Mixin Guide

### What are Mixins?

Mixins allow you to inject code into Minecraft's existing classes without modifying the original source files. Crystite uses the SpongePowered Mixin framework.

### Mixin Configuration

Create a mixin config file in `src/main/resources/` (e.g., `example-mod.mixin.json`):

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

Register it in `crystite.mod.json`:
```json
{
    "id": "example-mod",
    "mixins": ["example-mod.mixin.json"]
}
```

### Creating a Mixin

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

### Common Mixin Annotations

| Annotation | Purpose |
|------------|---------|
| `@Inject` | Inject code at a specific point in a method |
| `@Overwrite` | Completely replace a method |
| `@Redirect` | Redirect a method call to your own method |
| `@Accessor` | Access private fields |
| `@ModifyArg` | Modify an argument passed to a method |
| `@ModifyVariable` | Modify a local variable |

### Example: Overwrite

```java
@Mixin(TitleScreen.class)
public class TitleScreenMixin {

    @Overwrite
    public void init() {
        System.out.println("Custom title screen!");
    }
}
```

### Example: Accessor

```java
@Mixin(MinecraftServer.class)
public interface ServerAccessor {

    @Accessor("tickCount")
    int getTickCount();
}
```

### Debugging Mixins

Add this JVM argument to see mixin application logs:
```bash
-Dmixin.debug=true -Dmixin.dumpTargetOnFailure=true
```

---

## Event System

### Overview

Crystite's event system allows mods to react to game events. Events are posted by the game and mods can subscribe to them using the `@Subscribe` annotation.

### Available Events

| Event | Description |
|-------|-------------|
| `ServerStartingEvent` | Fired when the server starts loading |
| `ServerStartedEvent` | Fired after the server has fully started |
| `ServerStoppingEvent` | Fired when the server begins stopping |
| `ClientStartingEvent` | Fired when the client starts |
| `PlayerJoinEvent` | Fired when a player joins the server |
| `PlayerLeaveEvent` | Fired when a player leaves |

### Subscribing to Events

```java
import io.github.crystite.event.*;
import io.github.crystite.event.EventBus;

public class MyEvents {
    private int playerCount = 0;

    @Subscribe
    public void onPlayerJoin(PlayerJoinEvent event) {
        playerCount++;
        System.out.println("Player joined! Total: " + playerCount);
    }

    @Subscribe(priority = EventPriority.HIGH)
    public void onServerStart(ServerStartingEvent event) {
        System.out.println("Server starting... (HIGH priority)");
    }
}
```

### Event Priority

Events are processed in order of priority:
1. `HIGHEST`
2. `HIGH`
3. `NORMAL` (default)
4. `LOW`
5. `LOWEST`

### Creating Custom Events

```java
public class CustomEvent extends Event {
    private final String message;

    public CustomEvent(String message) {
        this.message = message;
    }

    public String getMessage() { return message; }
}
```

Post it:
```java
EventBus bus = CrystiteModLoader.getInstance().getEventBus();
bus.post(new CustomEvent("Hello!"));
```

### Cancelable Events

```java
public class CancellableEvent extends Event {
    @Override
    public boolean isCancelable() { return true; }
}
```

---

## Registry API

### Overview

The Registry API allows mods to register content such as blocks, items, and other objects in a centralized registry.

### Creating a Registry

```java
Registry<String> items = new Registry<>("items");
items.register("my_mod:sword", "Diamond Sword");
items.register("my_mod:pickaxe", "Netherite Pickaxe");
items.freeze(); // Prevent further registration
```

### Using Registries

```java
Registry<String> items = CrystiteAPI.getRegistry("items");
if (items.contains("my_mod:sword")) {
    String sword = items.get("my_mod:sword");
    System.out.println("Found: " + sword);
}
```

### Registry Naming Convention

Use the format `mod_id:entry_name` for unique identifiers:
- `minecraft:stone`
- `example_mod:diamond_sword`

---

## Configuration

### Overview

Crystite provides a simple configuration API for mods to save and load settings using `.properties` files.

### Basic Usage

```java
package com.example;

import io.github.crystite.api.config.ConfigAPI;
import java.util.Properties;

public class ConfigExample {
    private final ConfigAPI config;
    private int maxPlayers;

    public ConfigExample(String modId) {
        this.config = new ConfigAPI(modId);
        loadConfig();
    }

    private void loadConfig() {
        Properties props = config.load("settings");
        this.maxPlayers = Integer.parseInt(props.getProperty("maxPlayers", "10"));
    }

    public void saveConfig() {
        Properties props = new Properties();
        props.setProperty("maxPlayers", String.valueOf(maxPlayers));
        config.save("settings", props);
    }
}
```

### Config Directory Structure

Config files are stored in:
```
config/
  └── your_mod_id/
      └── settings.properties
```

---

## Commands

### Overview

Crystite provides a command registration API that integrates with Minecraft's Brigadier command system.

### Registering a Command

```java
package com.example;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.server.command.ServerCommandSource;
import static net.minecraft.server.command.CommandManager.*;

public class MyCommands {

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
        dispatcher.register(
            literal("greet")
                .executes(context -> {
                    System.out.println("Hello from custom command!");
                    return 1;
                })
        );
    }
}
```

### Command with Arguments

```java
dispatcher.register(
    literal("teleport")
        .then(argument("target", EntityArgumentType.player())
            .executes(context -> {
                ServerCommandSource source = context.getSource();
                ServerPlayerEntity player = EntityArgumentType.getPlayer(context, "target");
                source.sendMessage(Text.literal("Teleporting..."));
                return 1;
            })
        )
);
```

---

## Dependencies

### Overview

Crystite supports mod dependencies. You can specify required mods in `crystite.mod.json`.

### Declaring Dependencies

```json
{
    "id": "my-mod",
    "depends": {
        "core-library": "1.0.0",
        "another-mod": "2.0.0"
    }
}
```

### Dependency Resolution

Crystite resolves dependencies using topological sorting:
1. All mods are scanned from the `mods/` folder
2. Dependencies are analyzed
3. Mods are loaded in dependency order (dependencies first)
4. Circular dependencies are detected and reported as errors

### Optional Dependencies

```json
{
    "id": "my-mod",
    "depends": {},
    "suggests": {
        "optional-addon": "1.0.0"
    }
}
```

Note: `suggests` is not yet enforced by the loader — it is for documentation purposes.

---

## Troubleshooting

### Common Issues

#### "Crystite Mod Loader initialized with 0 mod(s)"

- Ensure `mods/` folder exists next to your jar
- Ensure your mod has `crystite.mod.json` at the root of the JAR
- Check the console for error messages about specific mods

#### Mixin errors

```
Mixin apply failed for example.mixin.ExampleMixin
```

- Check that the mixin config JSON is valid
- Ensure the target class name matches the actual Minecraft class
- Enable debug mode: `-Dmixin.debug=true`

#### ClassNotFoundException

- Verify the entrypoint class name in `crystite.mod.json`
- Ensure the class is in the JAR
- Check for package naming errors

#### Mod not loading

- Verify the JAR is not corrupted
- Check `java -jar` compatibility
- Ensure Java version is compatible (Java 17+ for 1.20.1, Java 25+ for 26.1.2)

### Debug Mode

Enable debug output:
```bash
java -Dcrystite.debug=true -javaagent:crystite-loader.jar -jar minecraft.jar
```

### Logs

Crystite logs are stored in:
```
logs/
  └── crystite.log
```

### Getting Help

If you encounter issues:
1. Check the logs in `logs/crystite.log`
2. Enable debug mode
3. Verify your mod's `crystite.mod.json` syntax
4. Ensure all dependencies are installed
