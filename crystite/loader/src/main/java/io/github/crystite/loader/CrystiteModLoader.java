package io.github.crystite.loader;

import io.github.crystite.api.Entrypoint;
import io.github.crystite.api.ModInitializer;
import io.github.crystite.event.EventBus;
import io.github.crystite.launcher.LaunchAdapter;
import io.github.crystite.mixin.CrystiteClassTransformer;

import java.lang.reflect.Method;
import java.util.Map;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class CrystiteModLoader {
    private static final CrystiteModLoader INSTANCE = new CrystiteModLoader();

    private final EventBus eventBus;
    private final CrystiteClassTransformer classTransformer;
    private ModDiscoverer discoverer;
    private DependencyResolver resolver;
    private List<ModContainer> mods;
    private LaunchAdapter launchAdapter;

    private CrystiteModLoader() {
        this.eventBus = new EventBus();
        this.classTransformer = new CrystiteClassTransformer();
    }

    public static CrystiteModLoader getInstance() { return INSTANCE; }

    public void initialize(LaunchAdapter adapter) {
        this.launchAdapter = adapter;

        Path modsDir = Paths.get("mods");
        discoverer = new ModDiscoverer(modsDir);
        mods = discoverer.discoverMods();

        resolver = new DependencyResolver(mods);
        List<ModContainer> loadOrder = resolver.resolveLoadOrder();

        for (ModContainer mod : loadOrder) {
            loadMod(mod);
        }

        System.out.println("Crystite Mod Loader initialized with " + mods.size() + " mod(s)");
    }

    private void loadMod(ModContainer mod) {
        try {
            for (Map.Entry<String, String> entry : mod.getMetadata().getEntrypoints().entrySet()) {
                String entrypointType = entry.getKey();
                String className = entry.getValue();

                Class<?> clazz = Class.forName(className, true, mod.getClassLoader());
                Object instance = clazz.getDeclaredConstructor().newInstance();

                if (instance instanceof ModInitializer) {
                    ((ModInitializer) instance).onInitialize(eventBus);
                }

                if (clazz.isAnnotationPresent(Entrypoint.class)) {
                    for (Method method : clazz.getDeclaredMethods()) {
                        if (method.isAnnotationPresent(Entrypoint.Init.class)) {
                            method.invoke(instance, eventBus);
                        }
                    }
                }

                mod.getEntrypointInstances().add(clazz);
            }

            for (String mixinConfig : mod.getMetadata().getMixins()) {
                classTransformer.registerMixinConfig(mixinConfig, mod.getClassLoader());
            }

            mod.setLoaded(true);
        } catch (Exception e) {
            System.err.println("Failed to load mod " + mod.getMetadata().getId() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    public EventBus getEventBus() { return eventBus; }
    public CrystiteClassTransformer getClassTransformer() { return classTransformer; }
    public List<ModContainer> getMods() { return mods; }
    public LaunchAdapter getLaunchAdapter() { return launchAdapter; }
}
