package io.github.crystite.api.config;

import java.io.*;
import java.nio.file.*;
import java.util.Properties;

public class ConfigAPI {
    private final Path configDir;
    private final String modId;

    public ConfigAPI(String modId) {
        this.modId = modId;
        this.configDir = Paths.get("config", modId);
        try {
            Files.createDirectories(configDir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create config directory for " + modId, e);
        }
    }

    public Properties load(String name) {
        Properties props = new Properties();
        Path file = configDir.resolve(name + ".properties");
        if (Files.exists(file)) {
            try (InputStream is = Files.newInputStream(file)) {
                props.load(is);
            } catch (IOException e) {
                System.err.println("Failed to load config " + name + ": " + e.getMessage());
            }
        }
        return props;
    }

    public void save(String name, Properties props) {
        Path file = configDir.resolve(name + ".properties");
        try (OutputStream os = Files.newOutputStream(file)) {
            props.store(os, "Crystite Config: " + modId + "/" + name);
        } catch (IOException e) {
            System.err.println("Failed to save config " + name + ": " + e.getMessage());
        }
    }
}
