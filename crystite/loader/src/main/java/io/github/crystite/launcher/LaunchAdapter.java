package io.github.crystite.launcher;

public interface LaunchAdapter {
    void launch(String[] args) throws Exception;
    String getMinecraftVersion();
    String getCrystiteVersion();
}
