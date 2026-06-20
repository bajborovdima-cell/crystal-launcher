package io.github.crystite.loader;

import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Path;
import java.util.*;

public class ModContainer {
    private final ModMetadata metadata;
    private final Path path;
    private final URLClassLoader classLoader;
    private final List<Class<?>> entrypointInstances;
    private boolean loaded;

    public ModContainer(ModMetadata metadata, Path path, URLClassLoader classLoader) {
        this.metadata = metadata;
        this.path = path;
        this.classLoader = classLoader;
        this.entrypointInstances = new ArrayList<>();
        this.loaded = false;
    }

    public ModMetadata getMetadata() { return metadata; }
    public Path getPath() { return path; }
    public URLClassLoader getClassLoader() { return classLoader; }
    public List<Class<?>> getEntrypointInstances() { return entrypointInstances; }
    public boolean isLoaded() { return loaded; }
    public void setLoaded(boolean loaded) { this.loaded = loaded; }
}
