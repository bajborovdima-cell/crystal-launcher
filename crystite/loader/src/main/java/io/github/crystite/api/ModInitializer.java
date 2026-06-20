package io.github.crystite.api;

import io.github.crystite.event.EventBus;

@FunctionalInterface
public interface ModInitializer {
    void onInitialize(EventBus eventBus);
}
