package io.github.crystite.loader;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.*;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.*;
import java.util.*;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

public class ModDiscoverer {
    private static final Gson GSON = new GsonBuilder().setLenient().create();
    private static final String MOD_METADATA_FILE = "crystite.mod.json";

    private final Path modsDirectory;
    private final List<ModContainer> mods;

    public ModDiscoverer(Path modsDirectory) {
        this.modsDirectory = modsDirectory;
        this.mods = new ArrayList<>();
    }

    public List<ModContainer> discoverMods() {
        mods.clear();
        if (!Files.exists(modsDirectory)) {
            modsDirectory.toFile().mkdirs();
            return mods;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(modsDirectory, "*.jar")) {
            for (Path jarPath : stream) {
                ModContainer mod = loadMod(jarPath);
                if (mod != null) {
                    mods.add(mod);
                }
            }
        } catch (IOException e) {
            System.err.println("Failed to scan mods directory: " + e.getMessage());
        }

        return mods;
    }

    private ModContainer loadMod(Path jarPath) {
        try {
            JarFile jarFile = new JarFile(jarPath.toFile());
            JarEntry metadataEntry = jarFile.getJarEntry(MOD_METADATA_FILE);

            if (metadataEntry == null) {
                System.err.println("Skipping " + jarPath + ": no " + MOD_METADATA_FILE);
                jarFile.close();
                return null;
            }

            ModMetadata metadata;
            try (InputStream is = jarFile.getInputStream(metadataEntry)) {
                metadata = GSON.fromJson(new InputStreamReader(is), ModMetadata.class);
            }

            if (metadata.getId() == null || metadata.getId().isEmpty()) {
                System.err.println("Skipping " + jarPath + ": mod id is missing");
                jarFile.close();
                return null;
            }

            URLClassLoader classLoader = new URLClassLoader(
                new URL[]{jarPath.toUri().toURL()},
                getClass().getClassLoader()
            );

            jarFile.close();
            return new ModContainer(metadata, jarPath, classLoader);

        } catch (IOException e) {
            System.err.println("Failed to load mod " + jarPath + ": " + e.getMessage());
            return null;
        }
    }

    public List<ModContainer> getMods() { return mods; }
}
