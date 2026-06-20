package io.github.crystite.api.registry;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class Registry<T> {
    private final String name;
    private final Map<String, T> entries;
    private final Map<String, String> entryMetadata;
    private boolean frozen;

    public Registry(String name) {
        this.name = name;
        this.entries = new LinkedHashMap<>();
        this.entryMetadata = new ConcurrentHashMap<>();
        this.frozen = false;
    }

    public void register(String id, T value) {
        register(id, value, null);
    }

    public void register(String id, T value, String description) {
        if (frozen) {
            throw new IllegalStateException("Registry " + name + " is frozen");
        }
        if (entries.containsKey(id)) {
            throw new IllegalArgumentException("Entry " + id + " already registered in " + name);
        }
        entries.put(id, value);
        if (description != null) {
            entryMetadata.put(id, description);
        }
    }

    public T get(String id) {
        return entries.get(id);
    }

    public boolean contains(String id) {
        return entries.containsKey(id);
    }

    public void freeze() {
        this.frozen = true;
    }

    public boolean isFrozen() { return frozen; }

    public Set<String> getIds() {
        return Collections.unmodifiableSet(entries.keySet());
    }

    public Collection<T> getValues() {
        return Collections.unmodifiableCollection(entries.values());
    }

    public int size() { return entries.size(); }

    public String getName() { return name; }
}
