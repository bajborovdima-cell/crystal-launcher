package io.github.crystite.loader;

import com.google.gson.annotations.SerializedName;

import java.util.*;

public class ModMetadata {
    private String id;
    private String version;
    private String name;
    private String description;
    private List<String> authors;
    private Map<String, String> entrypoints;
    private Map<String, String> depends;
    private List<String> mixins;
    private String license;

    public ModMetadata() {
        this.authors = new ArrayList<>();
        this.entrypoints = new HashMap<>();
        this.depends = new HashMap<>();
        this.mixins = new ArrayList<>();
    }

    public String getId() { return id; }
    public String getVersion() { return version; }
    public String getName() { return name != null ? name : id; }
    public String getDescription() { return description != null ? description : ""; }
    public List<String> getAuthors() { return authors; }
    public Map<String, String> getEntrypoints() { return entrypoints; }
    public Map<String, String> getDepends() { return depends; }
    public List<String> getMixins() { return mixins; }
    public String getLicense() { return license; }
}
