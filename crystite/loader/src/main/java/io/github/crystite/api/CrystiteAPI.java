package io.github.crystite.api;

import io.github.crystite.event.EventBus;
import io.github.crystite.loader.CrystiteModLoader;
import io.github.crystite.loader.ModContainer;
import io.github.crystite.api.config.ConfigAPI;
import io.github.crystite.api.registry.Registry;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class CrystiteAPI {
    private static final CrystiteAPI INSTANCE = new CrystiteAPI();
    private final Map<String, Registry<?>> registries;

    private CrystiteAPI() {
        this.registries = new ConcurrentHashMap<>();
    }

    public static CrystiteAPI getInstance() { return INSTANCE; }

    public EventBus getEventBus() {
        return CrystiteModLoader.getInstance().getEventBus();
    }

    public List<ModContainer> getLoadedMods() {
        return CrystiteModLoader.getInstance().getMods();
    }

    @SuppressWarnings("unchecked")
    public <T> Registry<T> getOrCreateRegistry(String name) {
        return (Registry<T>) registries.computeIfAbsent(name, k -> new Registry<T>(name));
    }

    @SuppressWarnings("unchecked")
    public <T> Registry<T> getRegistry(String name) {
        return (Registry<T>) registries.get(name);
    }

    public ConfigAPI createConfig(String modId) {
        return new ConfigAPI(modId);
    }

    public String getCrystiteVersion() {
        return CrystiteModLoader.getInstance().getLaunchAdapter().getCrystiteVersion();
    }

    public String getMinecraftVersion() {
        return CrystiteModLoader.getInstance().getLaunchAdapter().getMinecraftVersion();
    }
}
