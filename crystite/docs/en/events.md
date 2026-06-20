# Event System

## Overview

Mods subscribe to game events using `@Subscribe`. Events are posted by the game or by other mods.

## Available Events

| Event | When Fired |
|-------|-----------|
| `ServerStartingEvent` | Server begins loading |
| `ServerStartedEvent` | Server fully started |
| `ServerStoppingEvent` | Server begins stopping |
| `ClientStartingEvent` | Client starts |
| `PlayerJoinEvent` | Player joins server |
| `PlayerLeaveEvent` | Player leaves server |

## Subscribing

```java
@Subscribe
public void onServerStart(ServerStartingEvent event) {
    System.out.println("Server is loading!");
}

@Subscribe(priority = EventPriority.HIGH)
public void onPlayerJoin(PlayerJoinEvent event) {
    System.out.println("Player joined: " + event.getPlayerName());
}
```

## Priority Order

1. `HIGHEST`
2. `HIGH`
3. `NORMAL` (default)
4. `LOW`
5. `LOWEST`

## Custom Events

```java
public class MyEvent extends Event {
    private final String data;
    public MyEvent(String data) { this.data = data; }
    public String getData() { return data; }
}

// Post it:
EventBus bus = CrystiteModLoader.getInstance().getEventBus();
bus.post(new MyEvent("hello"));
```

## Cancelable Events

```java
public class MyEvent extends Event {
    @Override
    public boolean isCancelable() { return true; }
}
```
