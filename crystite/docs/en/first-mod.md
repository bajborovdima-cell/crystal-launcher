# Your First Mod

## Prerequisites

- Java 17+ (Java 25+ for Minecraft 26.1.2)
- Gradle or Maven
- Basic knowledge of Java

## Project Setup

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

## Create `crystite.mod.json`

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

## Create the Mod Class

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

## Building

```bash
./gradlew build
```

Place `build/libs/example-mod-1.0.0.jar` in the `mods/` folder.

## Adding a Mixin

See the [Mixin Guide](mixin-guide.md).

## Adding Events

See the [Event System](events.md).

## Adding Registries

See the [Registry API](registry.md).
