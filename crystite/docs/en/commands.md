# Commands

## Overview

Crystite integrates with Minecraft's Brigadier command system.

## Registering a Command

```java
import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.server.command.ServerCommandSource;
import static net.minecraft.server.command.CommandManager.*;

public class MyCommands {

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
        dispatcher.register(
            literal("greet")
                .executes(ctx -> {
                    ctx.getSource().sendMessage(Text.literal("Hello!"));
                    return 1;
                })
        );
    }
}
```

## Arguments

```java
dispatcher.register(
    literal("teleport")
        .then(argument("target", EntityArgumentType.player())
            .executes(ctx -> {
                ServerPlayerEntity player = EntityArgumentType.getPlayer(ctx, "target");
                ctx.getSource().sendMessage(Text.literal("Teleporting " + player.getName()));
                return 1;
            })
        )
);
```

## Register at Startup

```java
@Subscribe
public void onServerStart(ServerStartingEvent event) {
    MyCommands.register(
        CrystiteModLoader.getInstance().getCommandDispatcher()
    );
}
```
